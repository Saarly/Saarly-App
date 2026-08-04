-- Makes merchant referrals count only after admin approval and allows
-- repeated reward milestones without duplicate rewards.

alter table public.merchants
  add column if not exists referral_code_used text,
  add column if not exists referral_registered_at timestamptz,
  add column if not exists referral_event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.merchants'::regclass
      and conname = 'merchants_referral_event_id_fkey'
  ) then
    alter table public.merchants
      add constraint merchants_referral_event_id_fkey
      foreign key (referral_event_id)
      references public.referral_events(id)
      on delete set null;
  end if;
end
$$;

create index if not exists merchants_referral_code_used_idx
  on public.merchants (referral_code_used)
  where referral_code_used is not null;

alter table public.referral_rewards
  add column if not exists milestone_number integer not null default 1,
  add column if not exists qualified_registrations integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.referral_rewards
set qualified_registrations = coalesce(qualified_registrations, 0)
where qualified_registrations is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.referral_rewards'::regclass
      and conname = 'referral_rewards_milestone_number_check'
  ) then
    alter table public.referral_rewards
      add constraint referral_rewards_milestone_number_check
      check (milestone_number > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.referral_rewards'::regclass
      and conname = 'referral_rewards_metadata_check'
  ) then
    alter table public.referral_rewards
      add constraint referral_rewards_metadata_check
      check (jsonb_typeof(metadata) = 'object');
  end if;
end
$$;

alter table public.referral_rewards
  drop constraint if exists referral_rewards_user_unique;

create unique index if not exists referral_rewards_referral_milestone_unique
  on public.referral_rewards (referral_id, milestone_number);

create index if not exists referral_rewards_user_created_idx
  on public.referral_rewards (user_id, created_at desc);

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
  normalized_code text := upper(btrim(coalesce(p_referral_code, '')));
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
    when nullif(btrim(coalesce(p_device_fingerprint, '')), '') is null then null
    else md5(lower(btrim(p_device_fingerprint)))
  end;

  insert into public.referral_events (
    referral_id,
    referrer_user_id,
    referred_user_id,
    referred_email_hash,
    referred_mobile_hash,
    device_fingerprint_hash,
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
    null,
    jsonb_build_object(
      'source', 'merchant_approval',
      'merchant_id', p_merchant_id,
      'approved_by', p_actor_id
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

  return private.record_confirmed_referral(
    p_referral_code,
    current_user_id,
    p_device_fingerprint,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'public_referral_registration')
  );
end;
$$;

revoke all on function public.register_confirmed_referral(text,text,jsonb) from public, anon;
grant execute on function public.register_confirmed_referral(text,text,jsonb) to authenticated, service_role;

create or replace function public.my_referral_dashboard_for(p_audience text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  referral_row public.referrals;
  reward_row public.referral_rewards;
  audience text := case when lower(coalesce(p_audience, 'buyer')) = 'merchant' then 'merchant' else 'buyer' end;
  flag_config jsonb := '{}'::jsonb;
  reward_text text;
  display_reward_type public.referral_reward_type;
  enabled_value boolean := private.feature_enabled('monetization_enabled')
    and private.feature_enabled('referrals_enabled');
  target_value integer := 0;
  qualified_rewards_count integer := 0;
  completed_registrations integer := 0;
  current_registrations integer := 0;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select coalesce(f.configuration, '{}'::jsonb)
    into flag_config
  from public.feature_flags f
  where f.key = 'referrals_enabled';

  select r.* into referral_row
  from public.referrals r
  where r.referrer_user_id = current_user_id
  limit 1;

  if referral_row.id is null then
    referral_row := private.ensure_referral_for_user(current_user_id);
  end if;

  reward_text := case
    when audience = 'merchant' then
      coalesce(flag_config->>'active_merchant_reward_type', flag_config->>'merchant_reward_type', 'monthly_subscription')
    else
      coalesce(flag_config->>'active_buyer_reward_type', flag_config->>'buyer_reward_type', flag_config->>'default_reward_type', 'tshirt')
  end;

  display_reward_type := private.referral_reward_type_from_text(
    reward_text,
    case
      when audience = 'merchant' then 'monthly_subscription'::public.referral_reward_type
      else 'tshirt'::public.referral_reward_type
    end
  );

  target_value := greatest(coalesce(referral_row.target_confirmed_registrations, 0), 0);

  select count(*)::integer
    into qualified_rewards_count
  from public.referral_rewards rw
  where rw.user_id = current_user_id
    and rw.referral_id = referral_row.id;

  completed_registrations := qualified_rewards_count * greatest(target_value, 1);
  current_registrations := greatest(referral_row.confirmed_registrations - completed_registrations, 0);

  select rw.* into reward_row
  from public.referral_rewards rw
  where rw.user_id = current_user_id
    and rw.referral_id = referral_row.id
  order by rw.milestone_number desc, rw.created_at desc
  limit 1;

  return jsonb_build_object(
    'enabled', enabled_value,
    'referral_id', referral_row.id,
    'referral_code', referral_row.referral_code,
    'referral_url', referral_row.referral_url,
    'confirmed_registrations', current_registrations,
    'total_confirmed_registrations', referral_row.confirmed_registrations,
    'target_confirmed_registrations', target_value,
    'qualified_rewards_count', qualified_rewards_count,
    'next_target_remaining', greatest(target_value - current_registrations, 0),
    'reward_type', display_reward_type::text,
    'reward_label_ar', private.referral_reward_option_label(flag_config, audience, display_reward_type, 'ar'),
    'reward_label_en', private.referral_reward_option_label(flag_config, audience, display_reward_type, 'en'),
    'reward_options_label_ar', private.referral_reward_option_label(flag_config, audience, display_reward_type, 'ar'),
    'reward_options_label_en', private.referral_reward_option_label(flag_config, audience, display_reward_type, 'en'),
    'banner_image_url', case
      when audience = 'merchant' then coalesce(flag_config->>'merchant_banner_image_url', '')
      else coalesce(flag_config->>'buyer_banner_image_url', '')
    end,
    'achieved', target_value > 0 and current_registrations >= target_value,
    'reward_status', reward_row.delivery_status::text,
    'reward_created_at', reward_row.created_at,
    'reward_milestone_number', reward_row.milestone_number,
    'audience', audience
  );
end;
$$;

revoke all on function public.my_referral_dashboard_for(text) from public, anon;
grant execute on function public.my_referral_dashboard_for(text) to authenticated, service_role;

create or replace function public.submit_my_merchant_registration(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role public.app_role;
  v_is_blocked boolean;
  v_city public.cities%rowtype;
  v_merchant public.merchants%rowtype;
  v_branch public.branches%rowtype;
  v_existing_branch_id uuid;
  v_latitude double precision;
  v_longitude double precision;
  v_pricing_mode text := nullif(btrim(coalesce(p_payload->>'pricing_mode', '')), '');
  v_referral_code text := upper(nullif(btrim(coalesce(p_payload->>'referral_code', '')), ''));
  v_category_ids uuid[] := array[]::uuid[];
  v_category_id uuid;
  v_primary_category_id uuid;
  v_owner_front text := nullif(btrim(coalesce(p_payload->>'owner_id_front_image_url', p_payload->>'owner_id_image_url', '')), '');
  v_owner_back text := nullif(btrim(coalesce(p_payload->>'owner_id_back_image_url', '')), '');
  v_store_front text := nullif(btrim(coalesce(p_payload->>'store_front_image_url', '')), '');
  v_commercial text := nullif(btrim(coalesce(p_payload->>'commercial_register_url', '')), '');
begin
  if v_user_id is null then
    raise exception 'auth_required';
  end if;

  select u.role, u.is_blocked
  into v_role, v_is_blocked
  from public.users u
  where u.id = v_user_id;

  if v_role is distinct from 'merchant'::public.app_role
     or coalesce(v_is_blocked, true) then
    raise exception 'merchant_role_required';
  end if;

  if v_pricing_mode is null then
    v_pricing_mode := 'catalog';
  end if;

  if v_pricing_mode not in ('catalog', 'manual_quote') then
    raise exception 'invalid_pricing_mode';
  end if;

  if v_referral_code is not null and v_referral_code !~ '^[A-Z0-9_-]{3,64}$' then
    v_referral_code := null;
  end if;

  if jsonb_typeof(coalesce(p_payload->'category_ids', '[]'::jsonb)) = 'array' then
    for v_category_id in
      select distinct value::uuid
      from jsonb_array_elements_text(coalesce(p_payload->'category_ids', '[]'::jsonb)) as ids(value)
      where nullif(btrim(value), '') is not null
    loop
      v_category_ids := array_append(v_category_ids, v_category_id);
    end loop;
  end if;

  if array_length(v_category_ids, 1) is null then
    if nullif(btrim(coalesce(p_payload->>'primary_category_id', '')), '') is not null then
      v_category_ids := array[(p_payload->>'primary_category_id')::uuid];
    end if;
  end if;

  if array_length(v_category_ids, 1) is null then
    raise exception 'invalid_category';
  end if;

  v_primary_category_id := v_category_ids[1];

  if nullif(btrim(coalesce(p_payload->>'store_name', '')), '') is null
     or nullif(btrim(coalesce(p_payload->>'owner_name', '')), '') is null
     or nullif(btrim(coalesce(p_payload->>'owner_mobile', '')), '') is null
     or nullif(btrim(coalesce(p_payload->>'manager_name', '')), '') is null
     or nullif(btrim(coalesce(p_payload->>'manager_mobile', '')), '') is null
     or nullif(btrim(coalesce(p_payload->>'contact_mobile', '')), '') is null
     or v_owner_front is null
     or v_owner_back is null
     or v_store_front is null
     or nullif(btrim(coalesce(p_payload->>'city_id', '')), '') is null then
    raise exception 'missing_required_registration_data';
  end if;

  begin
    v_latitude := (p_payload->>'latitude')::double precision;
    v_longitude := (p_payload->>'longitude')::double precision;
  exception
    when invalid_text_representation then
      raise exception 'invalid_location';
  end;

  if v_latitude is null
     or v_longitude is null
     or v_latitude < -90
     or v_latitude > 90
     or v_longitude < -180
     or v_longitude > 180 then
    raise exception 'invalid_location';
  end if;

  if exists (
    select 1
    from unnest(v_category_ids) as selected_id
    left join public.categories c on c.id = selected_id and c.is_active
    where c.id is null
  ) then
    raise exception 'invalid_category';
  end if;

  select *
  into v_city
  from public.cities c
  where c.id = (p_payload->>'city_id')::uuid
    and c.is_active;

  if not found then
    raise exception 'invalid_city';
  end if;

  select *
  into v_merchant
  from public.merchants m
  where m.user_id = v_user_id
  for update;

  if v_merchant.id is not null and exists (
    select 1
    from public.products p
    where p.merchant_id = v_merchant.id
      and p.is_active
      and p.category_id is not null
      and not (p.category_id = any(v_category_ids))
  ) then
    raise exception 'category_has_products';
  end if;

  insert into public.merchants (
    user_id,
    store_name,
    owner_name,
    owner_mobile,
    manager_name,
    manager_mobile,
    owner_id_image_url,
    store_front_image_url,
    commercial_register_url,
    primary_category_id,
    contact_mobile,
    approval_status,
    rejection_reason,
    pricing_mode,
    referral_code_used,
    updated_at
  ) values (
    v_user_id,
    btrim(p_payload->>'store_name'),
    btrim(p_payload->>'owner_name'),
    btrim(p_payload->>'owner_mobile'),
    btrim(p_payload->>'manager_name'),
    btrim(p_payload->>'manager_mobile'),
    v_owner_front,
    v_store_front,
    v_commercial,
    v_primary_category_id,
    btrim(p_payload->>'contact_mobile'),
    'pending'::public.approval_status,
    null,
    v_pricing_mode::public.merchant_pricing_mode,
    v_referral_code,
    now()
  )
  on conflict (user_id) do update
  set store_name = excluded.store_name,
      owner_name = excluded.owner_name,
      owner_mobile = excluded.owner_mobile,
      manager_name = excluded.manager_name,
      manager_mobile = excluded.manager_mobile,
      owner_id_image_url = excluded.owner_id_image_url,
      store_front_image_url = excluded.store_front_image_url,
      commercial_register_url = excluded.commercial_register_url,
      primary_category_id = excluded.primary_category_id,
      contact_mobile = excluded.contact_mobile,
      approval_status = 'pending'::public.approval_status,
      rejection_reason = null,
      pricing_mode = excluded.pricing_mode,
      referral_code_used = coalesce(excluded.referral_code_used, public.merchants.referral_code_used),
      updated_at = now()
  returning * into v_merchant;

  delete from public.merchant_categories mc
  where mc.merchant_id = v_merchant.id
    and not (mc.category_id = any(v_category_ids));

  foreach v_category_id in array v_category_ids loop
    insert into public.merchant_categories (merchant_id, category_id, is_primary)
    values (v_merchant.id, v_category_id, v_category_id = v_primary_category_id)
    on conflict (merchant_id, category_id) do update
    set is_primary = excluded.is_primary;
  end loop;

  select b.id
  into v_existing_branch_id
  from public.branches b
  where b.merchant_id = v_merchant.id
  order by b.created_at asc
  limit 1;

  if v_existing_branch_id is null then
    insert into public.branches (
      merchant_id,
      name,
      latitude,
      longitude,
      city_id,
      city_name,
      governorate_name,
      front_image_url,
      manager_mobile,
      approval_status,
      rejection_reason,
      updated_at
    ) values (
      v_merchant.id,
      btrim(coalesce(p_payload->>'branch_name', p_payload->>'store_name')),
      v_latitude,
      v_longitude,
      v_city.id,
      v_city.name_ar,
      v_city.governorate_ar,
      v_store_front,
      btrim(p_payload->>'manager_mobile'),
      'pending'::public.approval_status,
      null,
      now()
    )
    returning * into v_branch;
  else
    update public.branches
    set name = btrim(coalesce(p_payload->>'branch_name', p_payload->>'store_name')),
        latitude = v_latitude,
        longitude = v_longitude,
        city_id = v_city.id,
        city_name = v_city.name_ar,
        governorate_name = v_city.governorate_ar,
        front_image_url = v_store_front,
        manager_mobile = btrim(p_payload->>'manager_mobile'),
        approval_status = 'pending'::public.approval_status,
        rejection_reason = null,
        updated_at = now()
    where id = v_existing_branch_id
    returning * into v_branch;
  end if;

  perform private.upsert_merchant_document(v_merchant.id, null, v_merchant.manager_name, 'store_owner_id_front', 'merchant-ids', v_owner_front, null, null, jsonb_build_object('source','merchant_registration'));
  perform private.upsert_merchant_document(v_merchant.id, null, v_merchant.manager_name, 'store_owner_id_back', 'merchant-ids', v_owner_back, null, null, jsonb_build_object('source','merchant_registration'));
  perform private.upsert_merchant_document(v_merchant.id, null, v_merchant.manager_name, 'store_front', 'storefront-photos', v_store_front, null, null, jsonb_build_object('source','merchant_registration'));
  if v_commercial is not null then
    perform private.upsert_merchant_document(v_merchant.id, null, v_merchant.manager_name, 'commercial_register', 'commercial-registers', v_commercial, null, null, jsonb_build_object('source','merchant_registration'));
  end if;

  return jsonb_build_object(
    'merchant', to_jsonb(v_merchant) || jsonb_build_object('category_ids', to_jsonb(v_category_ids), 'owner_id_front_image_url', v_owner_front, 'owner_id_back_image_url', v_owner_back),
    'branch', to_jsonb(v_branch)
  );
end;
$$;

create or replace function public.admin_review_merchant_registration_as(
  p_actor_id uuid,
  p_merchant_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.merchants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_status public.approval_status;
  v_reason text;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;
  if not coalesce(p_approved, false)
     and length(btrim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_merchant
  from public.merchants
  where id = p_merchant_id
  for update;
  if v_merchant.id is null then raise exception 'merchant_not_found'; end if;

  if coalesce(p_approved, false) then
    if exists (
      select 1
      from unnest(array[
        'store_front'::public.merchant_document_kind,
        'store_owner_id_front'::public.merchant_document_kind,
        'store_owner_id_back'::public.merchant_document_kind
      ]) as required_kind(kind)
      where not exists (
        select 1
        from public.merchant_documents document
        where document.merchant_id = p_merchant_id
          and document.branch_id is null
          and document.kind = required_kind.kind
          and document.superseded_by is null
          and document.status = 'approved'::public.document_review_status
      )
    ) then
      raise exception 'required_documents_must_be_approved_first';
    end if;

    if exists (
      select 1
      from public.merchant_documents document
      where document.merchant_id = p_merchant_id
        and document.branch_id is null
        and document.superseded_by is null
        and document.status = 'rejected'::public.document_review_status
    ) then
      raise exception 'rejected_documents_must_be_replaced_first';
    end if;
  end if;

  v_status := case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end;
  v_reason := case when p_approved then null else btrim(p_rejection_reason) end;

  if v_merchant.approval_status is distinct from v_status
     or v_merchant.rejection_reason is distinct from v_reason then
    update public.merchants
    set approval_status = v_status,
        rejection_reason = v_reason,
        last_admin_contact_at = now(),
        updated_at = now()
    where id = p_merchant_id
    returning * into v_merchant;
  end if;

  update public.branches
  set approval_status = v_status,
      rejection_reason = v_reason,
      updated_at = now()
  where merchant_id = p_merchant_id
    and is_primary
    and (approval_status is distinct from v_status or rejection_reason is distinct from v_reason);

  if v_status = 'approved'::public.approval_status then
    perform private.register_merchant_referral_after_approval(p_merchant_id, p_actor_id);
  end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, new_data)
  values (
    p_actor_id,
    case when p_approved then 'approve_merchant_registration' else 'reject_merchant_registration' end,
    'merchants', p_merchant_id::text,
    jsonb_build_object('approval_status', v_merchant.approval_status, 'reason', v_merchant.rejection_reason)
  );
  return v_merchant;
end;
$$;

create or replace view public.admin_referral_rewards_readable as
select
  rw.id,
  referrer.full_name as referrer_name,
  rewarded.full_name as rewarded_user_name,
  r.referral_code,
  rw.reward_type,
  rw.delivery_status,
  concat_ws(' - '::text, rewarded.full_name, rw.reward_type::text, rw.delivery_status::text) as row_description_ar,
  rw.delivered_at,
  rw.notes,
  rw.created_at,
  rw.updated_at,
  rw.referral_id,
  r.confirmed_registrations,
  r.target_confirmed_registrations,
  rw.milestone_number,
  rw.qualified_registrations
from public.referral_rewards rw
join public.referrals r on r.id = rw.referral_id
join public.users referrer on referrer.id = r.referrer_user_id
join public.users rewarded on rewarded.id = rw.user_id;
