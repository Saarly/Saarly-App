-- Counts buyer referrals after profile completion and requires device signals
-- before any referral is counted.

alter table public.merchants
  add column if not exists referral_device_fingerprint text,
  add column if not exists referral_device_family_fingerprint text;

alter table public.referral_events
  add column if not exists device_family_hash text;

create unique index if not exists referral_events_device_family_hash_unique
  on public.referral_events (device_family_hash)
  where device_family_hash is not null;

create index if not exists merchants_referral_device_family_idx
  on public.merchants (referral_device_family_fingerprint)
  where referral_device_family_fingerprint is not null;

create or replace function private.record_confirmed_referral(
  p_referral_code text,
  p_referred_user_id uuid,
  p_device_fingerprint text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  referred_user public.users;
  referrer_role public.app_role;
  referral_row public.referrals;
  inserted_event public.referral_events;
  existing_event_id uuid;
  reward_insert_count integer := 0;
  reward_created boolean := false;
  target_value integer := 10;
  milestone_value integer := 0;
  qualified_value integer := 0;
  email_hash_value text;
  mobile_hash_value text;
  device_hash_value text;
  device_family_hash_value text;
  normalized_code text := upper(btrim(coalesce(p_referral_code, '')));
  normalized_device_fingerprint text :=
    nullif(left(btrim(coalesce(p_device_fingerprint, '')), 512), '');
  normalized_device_family text :=
    nullif(left(btrim(coalesce(p_metadata->>'device_family_fingerprint', '')), 512), '');
begin
  if p_referred_user_id is null then
    raise exception 'referred_user_required';
  end if;

  if coalesce(jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)), 'object') <> 'object' then
    raise exception 'metadata_must_be_json_object';
  end if;

  if normalized_code = '' then
    return jsonb_build_object('counted', false, 'reason', 'no_referral_code');
  end if;

  if normalized_device_fingerprint is null and normalized_device_family is null then
    return jsonb_build_object('counted', false, 'reason', 'device_fingerprint_required');
  end if;

  select *
    into referred_user
  from public.users
  where id = p_referred_user_id;

  if not found then
    raise exception 'referred_user_profile_not_found';
  end if;

  if not private.referrals_enabled() then
    perform private.ensure_referral_for_user(p_referred_user_id);
    return jsonb_build_object('counted', false, 'reason', 'referrals_disabled');
  end if;

  select *
    into referral_row
  from public.referrals
  where referral_code = normalized_code
     or referral_code = btrim(coalesce(p_referral_code, ''))
  for update;

  if not found or not referral_row.is_active then
    return jsonb_build_object('counted', false, 'reason', 'referral_not_active');
  end if;

  if referral_row.referrer_user_id = p_referred_user_id then
    return jsonb_build_object('counted', false, 'reason', 'self_referral_not_allowed');
  end if;

  email_hash_value := md5(lower(referred_user.primary_email));
  mobile_hash_value := md5(regexp_replace(referred_user.mobile, '\D', '', 'g'));
  device_hash_value := case
    when normalized_device_fingerprint is null then null
    else md5(lower(normalized_device_fingerprint))
  end;
  device_family_hash_value := case
    when normalized_device_family is not null then md5(lower(normalized_device_family))
    when normalized_device_fingerprint is not null then md5(lower(normalized_device_fingerprint))
    else null
  end;

  insert into public.referral_events (
    referral_id,
    referrer_user_id,
    referred_user_id,
    referred_email_hash,
    referred_mobile_hash,
    device_fingerprint_hash,
    device_family_hash,
    confirmed_at,
    metadata
  )
  values (
    referral_row.id,
    referral_row.referrer_user_id,
    p_referred_user_id,
    email_hash_value,
    mobile_hash_value,
    device_hash_value,
    device_family_hash_value,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning * into inserted_event;

  if inserted_event.id is null then
    select e.id
      into existing_event_id
    from public.referral_events e
    where e.referred_user_id = p_referred_user_id
       or e.referred_email_hash = email_hash_value
       or e.referred_mobile_hash = mobile_hash_value
       or (device_hash_value is not null and e.device_fingerprint_hash = device_hash_value)
       or (device_family_hash_value is not null and e.device_family_hash = device_family_hash_value)
    limit 1;

    return jsonb_build_object(
      'counted', false,
      'reason', 'duplicate_referral_signal',
      'event_id', existing_event_id
    );
  end if;

  update public.referrals
  set confirmed_registrations = confirmed_registrations + 1,
      updated_at = now()
  where id = referral_row.id
  returning * into referral_row;

  target_value := greatest(coalesce(referral_row.target_confirmed_registrations, 10), 1);
  milestone_value := floor(referral_row.confirmed_registrations::numeric / target_value)::integer;
  qualified_value := milestone_value * target_value;

  if milestone_value > 0 then
    insert into public.referral_rewards (
      referral_id,
      user_id,
      reward_type,
      delivery_status,
      milestone_number,
      qualified_registrations,
      notes,
      metadata
    )
    values (
      referral_row.id,
      referral_row.referrer_user_id,
      referral_row.reward_type,
      'pending',
      milestone_value,
      qualified_value,
      'Auto-created after reaching a referral milestone.',
      jsonb_build_object(
        'source', 'referral_milestone',
        'milestone_number', milestone_value,
        'target_confirmed_registrations', target_value,
        'confirmed_registrations', referral_row.confirmed_registrations
      )
    )
    on conflict (referral_id, milestone_number) do nothing;

    get diagnostics reward_insert_count = row_count;
    reward_created := reward_insert_count > 0;

    if reward_created then
      select u.role
        into referrer_role
      from public.users u
      where u.id = referral_row.referrer_user_id;

      insert into public.notifications (
        user_id,
        type,
        title_ar,
        title_en,
        body_ar,
        body_en,
        deep_link,
        dedupe_key,
        payload
      )
      values (
        referral_row.referrer_user_id,
        'referral_reward_qualified',
        'تم استحقاق مكافأة إحالة',
        'Referral reward qualified',
        'اكتمل عدد الإحالات المقبولة المطلوب، وتم تسجيل مكافأة جديدة لك.',
        'The required accepted referrals were completed and a new reward was recorded for you.',
        case
          when referrer_role = 'merchant'::public.app_role then 'saarly://merchant/referrals'
          else 'saarly://buyer/referrals'
        end,
        'referral_reward:' || referral_row.id::text || ':' || milestone_value::text,
        jsonb_build_object(
          'referral_id', referral_row.id,
          'milestone_number', milestone_value,
          'qualified_registrations', qualified_value,
          'reward_type', referral_row.reward_type::text
        )
      )
      on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'counted', true,
    'event_id', inserted_event.id,
    'confirmed_registrations', referral_row.confirmed_registrations,
    'target_confirmed_registrations', target_value,
    'milestone_number', milestone_value,
    'qualified_registrations', qualified_value,
    'reward_created', reward_created
  );
end;
$$;

create or replace function private.register_merchant_referral_after_approval(
  p_merchant_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_row public.merchants;
  result jsonb;
  event_id uuid;
begin
  select *
    into merchant_row
  from public.merchants
  where id = p_merchant_id
  for update;

  if not found then
    raise exception 'merchant_not_found';
  end if;

  if merchant_row.approval_status <> 'approved'::public.approval_status then
    return jsonb_build_object('counted', false, 'reason', 'merchant_not_approved');
  end if;

  if merchant_row.referral_registered_at is not null then
    return jsonb_build_object(
      'counted', false,
      'reason', 'already_registered',
      'event_id', merchant_row.referral_event_id
    );
  end if;

  if nullif(btrim(coalesce(merchant_row.referral_code_used, '')), '') is null then
    return jsonb_build_object('counted', false, 'reason', 'no_referral_code');
  end if;

  result := private.record_confirmed_referral(
    merchant_row.referral_code_used,
    merchant_row.user_id,
    merchant_row.referral_device_fingerprint,
    jsonb_build_object(
      'source', 'merchant_approval',
      'merchant_id', p_merchant_id,
      'approved_by', p_actor_id,
      'device_family_fingerprint', merchant_row.referral_device_family_fingerprint
    )
  );

  if coalesce((result->>'event_id'), '') <> '' then
    event_id := (result->>'event_id')::uuid;
  end if;

  if coalesce((result->>'counted')::boolean, false)
     or result->>'reason' = 'duplicate_referral_signal' then
    update public.merchants
    set referral_registered_at = now(),
        referral_event_id = event_id,
        updated_at = now()
    where id = p_merchant_id;
  end if;

  return result;
end;
$$;

create or replace function public.register_confirmed_referral(
  p_referral_code text,
  p_device_fingerprint text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  referred_user public.users;
  merged_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select *
    into referred_user
  from public.users
  where id = current_user_id;

  if not found then
    raise exception 'current_user_profile_not_found';
  end if;

  if referred_user.role = 'merchant'::public.app_role
     and not exists (
       select 1
       from public.merchants m
       where m.user_id = current_user_id
         and m.approval_status = 'approved'::public.approval_status
     ) then
    return jsonb_build_object(
      'counted', false,
      'reason', 'pending_merchant_approval'
    );
  end if;

  merged_metadata := merged_metadata || jsonb_build_object(
    'source',
    coalesce(nullif(merged_metadata->>'source', ''), 'public_referral_registration')
  );

  return private.record_confirmed_referral(
    p_referral_code,
    current_user_id,
    p_device_fingerprint,
    merged_metadata
  );
end;
$$;

revoke all on function public.register_confirmed_referral(text,text,jsonb) from public, anon;
grant execute on function public.register_confirmed_referral(text,text,jsonb) to authenticated, service_role;

create or replace function public.submit_my_merchant_registration_with_referral_device(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
  v_merchant_id uuid;
  v_referral_code text := upper(nullif(btrim(coalesce(p_payload->>'referral_code', '')), ''));
  v_device_fingerprint text :=
    nullif(left(btrim(coalesce(p_payload->>'referral_device_fingerprint', '')), 512), '');
  v_device_family text :=
    nullif(left(btrim(coalesce(p_payload->>'referral_device_family_fingerprint', '')), 512), '');
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  if v_referral_code is not null and v_referral_code !~ '^[A-Z0-9_-]{3,64}$' then
    v_referral_code := null;
  end if;

  v_result := public.submit_my_merchant_registration(p_payload);
  v_merchant_id := nullif(v_result #>> '{merchant,id}', '')::uuid;

  if v_merchant_id is not null
     and (v_referral_code is not null or v_device_fingerprint is not null or v_device_family is not null) then
    update public.merchants
    set referral_code_used = coalesce(v_referral_code, referral_code_used),
        referral_device_fingerprint = coalesce(v_device_fingerprint, referral_device_fingerprint),
        referral_device_family_fingerprint = coalesce(v_device_family, referral_device_family_fingerprint),
        updated_at = now()
    where id = v_merchant_id
      and user_id = v_user_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.submit_my_merchant_registration_with_referral_device(jsonb) from public, anon;
grant execute on function public.submit_my_merchant_registration_with_referral_device(jsonb) to authenticated, service_role;
