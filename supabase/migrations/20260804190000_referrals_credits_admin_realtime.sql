-- Saarly 2026-08-04: referral progression, merchant welcome credit,
-- responsive admin referral data and realtime publication coverage.

alter table public.referrals
  add column if not exists standard_target_confirmed_registrations integer;

alter table public.referrals
  add column if not exists first_milestone_target_confirmed_registrations integer;

update public.referrals
set standard_target_confirmed_registrations = greatest(coalesce(standard_target_confirmed_registrations, target_confirmed_registrations, 10), 1),
    first_milestone_target_confirmed_registrations = greatest(coalesce(first_milestone_target_confirmed_registrations, target_confirmed_registrations, 10), 1)
where standard_target_confirmed_registrations is null
   or first_milestone_target_confirmed_registrations is null;

alter table public.referrals
  alter column standard_target_confirmed_registrations set default 10,
  alter column standard_target_confirmed_registrations set not null,
  alter column first_milestone_target_confirmed_registrations set default 10,
  alter column first_milestone_target_confirmed_registrations set not null;

alter table public.referrals drop constraint if exists referrals_standard_target_positive;
alter table public.referrals add constraint referrals_standard_target_positive
  check (standard_target_confirmed_registrations > 0);
alter table public.referrals drop constraint if exists referrals_first_target_positive;
alter table public.referrals add constraint referrals_first_target_positive
  check (first_milestone_target_confirmed_registrations > 0);

create table if not exists public.merchant_referral_subscription_credits (
  id uuid primary key default extensions.gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  referral_event_id uuid not null references public.referral_events(id) on delete restrict,
  months integer not null default 1 check (months > 0),
  status text not null default 'available' check (status in ('available', 'redeemed', 'void')),
  available_at timestamptz not null default now(),
  redeemed_at timestamptz,
  applied_subscription_id uuid references public.merchant_subscriptions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id),
  unique (referral_event_id)
);

create index if not exists merchant_referral_subscription_credits_status_idx
  on public.merchant_referral_subscription_credits (merchant_id, status);

alter table public.merchant_referral_subscription_credits enable row level security;
drop policy if exists merchant_referral_credit_owner_read on public.merchant_referral_subscription_credits;
create policy merchant_referral_credit_owner_read
on public.merchant_referral_subscription_credits
for select to authenticated
using (
  exists (
    select 1 from public.merchants m
    where m.id = merchant_id and m.user_id = auth.uid()
  )
);

drop policy if exists merchant_referral_credit_admin_all on public.merchant_referral_subscription_credits;
create policy merchant_referral_credit_admin_all
on public.merchant_referral_subscription_credits
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function private.ensure_referral_for_user(p_user_id uuid)
returns public.referrals
language plpgsql
security definer
set search_path = ''
as $function$
declare
  saved_referral public.referrals;
  threshold_value integer := 10;
  first_threshold_value integer := 10;
  reward_value public.referral_reward_type;
  reward_text text;
  target_role public.app_role;
  flag_config jsonb := '{}'::jsonb;
  was_referred boolean := false;
begin
  select u.role into target_role
  from public.users u
  where u.id = p_user_id;

  select coalesce(f.configuration, '{}'::jsonb)
  into flag_config
  from public.feature_flags f
  where f.key = 'referrals_enabled';

  threshold_value := greatest(
    coalesce(nullif((flag_config->>'confirmed_referrals_threshold')::integer, 0), 10),
    1
  );
  target_role := coalesce(target_role, 'buyer'::public.app_role);

  select exists (
    select 1 from public.referral_events e
    where e.referred_user_id = p_user_id
  ) into was_referred;

  first_threshold_value := case
    when target_role = 'buyer'::public.app_role and was_referred
      then greatest(threshold_value - 1, 1)
    else threshold_value
  end;

  reward_text := case
    when target_role = 'merchant'::public.app_role then
      coalesce(flag_config->>'active_merchant_reward_type', flag_config->>'merchant_reward_type', 'monthly_subscription')
    else
      coalesce(flag_config->>'active_buyer_reward_type', flag_config->>'buyer_reward_type', flag_config->>'default_reward_type', 'tshirt')
  end;

  reward_value := private.referral_reward_type_from_text(
    reward_text,
    case
      when target_role = 'merchant'::public.app_role then 'monthly_subscription'::public.referral_reward_type
      else 'tshirt'::public.referral_reward_type
    end
  );

  insert into public.referrals (
    referrer_user_id,
    referral_code,
    referral_url,
    target_confirmed_registrations,
    standard_target_confirmed_registrations,
    first_milestone_target_confirmed_registrations,
    reward_type,
    is_active,
    metadata
  ) values (
    p_user_id,
    private.default_referral_code(p_user_id),
    'https://saarly.app/invite?code=' || private.default_referral_code(p_user_id),
    first_threshold_value,
    threshold_value,
    first_threshold_value,
    reward_value,
    private.referrals_enabled(),
    jsonb_build_object(
      'created_by', 'automatic',
      'audience', target_role::text,
      'registered_with_referral', was_referred,
      'first_target_discount', threshold_value - first_threshold_value
    )
  )
  on conflict (referrer_user_id) do update
  set referral_url = coalesce(
        public.referrals.referral_url,
        'https://saarly.app/invite?code=' || public.referrals.referral_code
      ),
      standard_target_confirmed_registrations = threshold_value,
      first_milestone_target_confirmed_registrations = case
        when not exists (
          select 1 from public.referral_rewards rw
          where rw.referral_id = public.referrals.id
        ) and public.referrals.confirmed_registrations = 0
          then least(public.referrals.first_milestone_target_confirmed_registrations, first_threshold_value)
        else public.referrals.first_milestone_target_confirmed_registrations
      end,
      target_confirmed_registrations = case
        when not exists (
          select 1 from public.referral_rewards rw
          where rw.referral_id = public.referrals.id
        )
          then case
            when public.referrals.confirmed_registrations = 0
              then least(public.referrals.first_milestone_target_confirmed_registrations, first_threshold_value)
            else public.referrals.first_milestone_target_confirmed_registrations
          end
        else threshold_value
      end,
      reward_type = reward_value,
      is_active = private.referrals_enabled(),
      metadata = coalesce(public.referrals.metadata, '{}'::jsonb) || jsonb_build_object(
        'audience', target_role::text,
        'registered_with_referral', was_referred or coalesce((public.referrals.metadata->>'registered_with_referral')::boolean, false),
        'first_target_discount', greatest(threshold_value - least(public.referrals.first_milestone_target_confirmed_registrations, first_threshold_value), 0)
      ),
      updated_at = now()
  returning * into saved_referral;

  return saved_referral;
end;
$function$;

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
as $function$
declare
  referred_user public.users;
  referrer_role public.app_role;
  referral_row public.referrals;
  inserted_event public.referral_events;
  existing_event_id uuid;
  reward_insert_count integer := 0;
  reward_created boolean := false;
  standard_target integer := 10;
  first_target integer := 10;
  existing_reward_count integer := 0;
  next_milestone integer := 1;
  next_qualified_total integer := 0;
  email_hash_value text;
  mobile_hash_value text;
  device_hash_value text;
  device_family_hash_value text;
  normalized_code text := upper(btrim(coalesce(p_referral_code, '')));
  normalized_device_fingerprint text := nullif(left(btrim(coalesce(p_device_fingerprint, '')), 512), '');
  normalized_device_family text := nullif(left(btrim(coalesce(p_metadata->>'device_family_fingerprint', '')), 512), '');
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

  select * into referred_user from public.users where id = p_referred_user_id;
  if not found then raise exception 'referred_user_profile_not_found'; end if;

  if not private.referrals_enabled() then
    perform private.ensure_referral_for_user(p_referred_user_id);
    return jsonb_build_object('counted', false, 'reason', 'referrals_disabled');
  end if;

  select * into referral_row
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
  mobile_hash_value := md5(regexp_replace(referred_user.mobile, '\\D', '', 'g'));
  device_hash_value := case when normalized_device_fingerprint is null then null else md5(lower(normalized_device_fingerprint)) end;
  device_family_hash_value := case
    when normalized_device_family is not null then md5(lower(normalized_device_family))
    when normalized_device_fingerprint is not null then md5(lower(normalized_device_fingerprint))
    else null
  end;

  insert into public.referral_events (
    referral_id, referrer_user_id, referred_user_id,
    referred_email_hash, referred_mobile_hash,
    device_fingerprint_hash, device_family_hash,
    confirmed_at, metadata
  ) values (
    referral_row.id, referral_row.referrer_user_id, p_referred_user_id,
    email_hash_value, mobile_hash_value,
    device_hash_value, device_family_hash_value,
    now(), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning * into inserted_event;

  if inserted_event.id is null then
    select e.id into existing_event_id
    from public.referral_events e
    where e.referred_user_id = p_referred_user_id
       or e.referred_email_hash = email_hash_value
       or e.referred_mobile_hash = mobile_hash_value
       or (device_hash_value is not null and e.device_fingerprint_hash = device_hash_value)
       or (device_family_hash_value is not null and e.device_family_hash = device_family_hash_value)
    limit 1;
    return jsonb_build_object('counted', false, 'reason', 'duplicate_referral_signal', 'event_id', existing_event_id);
  end if;

  update public.referrals
  set confirmed_registrations = confirmed_registrations + 1,
      updated_at = now()
  where id = referral_row.id
  returning * into referral_row;

  -- A referred buyer needs one fewer friend for the first reward only.
  if referred_user.role = 'buyer'::public.app_role then
    update public.referrals own_referral
    set first_milestone_target_confirmed_registrations = greatest(own_referral.standard_target_confirmed_registrations - 1, 1),
        target_confirmed_registrations = greatest(own_referral.standard_target_confirmed_registrations - 1, 1),
        metadata = coalesce(own_referral.metadata, '{}'::jsonb) || jsonb_build_object(
          'registered_with_referral', true,
          'first_target_discount', 1,
          'referral_event_id', inserted_event.id
        ),
        updated_at = now()
    where own_referral.referrer_user_id = p_referred_user_id
      and own_referral.confirmed_registrations = 0
      and not exists (
        select 1 from public.referral_rewards rw where rw.referral_id = own_referral.id
      );
  end if;

  standard_target := greatest(coalesce(referral_row.standard_target_confirmed_registrations, referral_row.target_confirmed_registrations, 10), 1);
  first_target := greatest(coalesce(referral_row.first_milestone_target_confirmed_registrations, standard_target), 1);
  select count(*)::integer into existing_reward_count
  from public.referral_rewards rw
  where rw.referral_id = referral_row.id;

  next_milestone := existing_reward_count + 1;
  next_qualified_total := first_target + (existing_reward_count * standard_target);

  if referral_row.confirmed_registrations >= next_qualified_total then
    insert into public.referral_rewards (
      referral_id, user_id, reward_type, delivery_status,
      milestone_number, qualified_registrations, notes, metadata
    ) values (
      referral_row.id,
      referral_row.referrer_user_id,
      referral_row.reward_type,
      'pending',
      next_milestone,
      next_qualified_total,
      'Auto-created after reaching a referral milestone.',
      jsonb_build_object(
        'source', 'referral_milestone',
        'milestone_number', next_milestone,
        'standard_target', standard_target,
        'first_target', first_target,
        'qualified_registrations', next_qualified_total,
        'confirmed_registrations', referral_row.confirmed_registrations
      )
    )
    on conflict (referral_id, milestone_number) do nothing;

    get diagnostics reward_insert_count = row_count;
    reward_created := reward_insert_count > 0;

    if reward_created then
      select u.role into referrer_role from public.users u where u.id = referral_row.referrer_user_id;
      insert into public.notifications (
        user_id, type, title_ar, title_en, body_ar, body_en,
        deep_link, dedupe_key, payload
      ) values (
        referral_row.referrer_user_id,
        'referral_reward_qualified',
        'تم استحقاق مكافأة إحالة',
        'Referral reward qualified',
        'اكتمل عدد الإحالات المقبولة المطلوب، وتم تسجيل مكافأة جديدة لك.',
        'The required accepted referrals were completed and a new reward was recorded for you.',
        case when referrer_role = 'merchant'::public.app_role then 'saarly://merchant/referrals' else 'saarly://buyer/referrals' end,
        'referral_reward:' || referral_row.id::text || ':' || next_milestone::text,
        jsonb_build_object(
          'referral_id', referral_row.id,
          'milestone_number', next_milestone,
          'qualified_registrations', next_qualified_total,
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
    'standard_target_confirmed_registrations', standard_target,
    'first_milestone_target_confirmed_registrations', first_target,
    'next_milestone_number', next_milestone,
    'next_qualified_registrations', next_qualified_total,
    'reward_created', reward_created
  );
end;
$function$;

create or replace function private.register_merchant_referral_after_approval(
  p_merchant_id uuid,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  merchant_row public.merchants;
  result jsonb;
  event_id uuid;
  event_matches boolean := false;
begin
  select * into merchant_row
  from public.merchants
  where id = p_merchant_id
  for update;

  if not found then raise exception 'merchant_not_found'; end if;
  if merchant_row.approval_status <> 'approved'::public.approval_status then
    return jsonb_build_object('counted', false, 'reason', 'merchant_not_approved');
  end if;
  if nullif(btrim(coalesce(merchant_row.referral_code_used, '')), '') is null then
    return jsonb_build_object('counted', false, 'reason', 'no_referral_code');
  end if;

  if merchant_row.referral_registered_at is null then
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

    if coalesce(result->>'event_id', '') <> '' then
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
  else
    event_id := merchant_row.referral_event_id;
    result := jsonb_build_object('counted', false, 'reason', 'already_registered', 'event_id', event_id);
  end if;

  if event_id is not null then
    select exists (
      select 1
      from public.referral_events e
      join public.referrals r on r.id = e.referral_id
      where e.id = event_id
        and e.referred_user_id = merchant_row.user_id
        and upper(r.referral_code) = upper(btrim(merchant_row.referral_code_used))
    ) into event_matches;
  end if;

  if event_matches then
    insert into public.merchant_referral_subscription_credits (
      merchant_id,
      referral_event_id,
      months,
      status,
      metadata
    ) values (
      p_merchant_id,
      event_id,
      1,
      'available',
      jsonb_build_object(
        'source', 'approved_merchant_referral',
        'approved_by', p_actor_id,
        'available_after_approval', true
      )
    )
    on conflict (merchant_id) do nothing;
  end if;

  return coalesce(result, '{}'::jsonb) || jsonb_build_object(
    'welcome_credit_available', event_matches,
    'welcome_credit_months', case when event_matches then 1 else 0 end
  );
end;
$function$;

create or replace function public.my_merchant_referral_subscription_credit()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_merchant_id uuid;
  v_credit public.merchant_referral_subscription_credits%rowtype;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  select m.id into v_merchant_id
  from public.merchants m
  where m.user_id = v_user_id
  order by m.created_at desc
  limit 1;

  if v_merchant_id is null then
    return jsonb_build_object('available', false, 'redeemed', false, 'months', 0);
  end if;

  select * into v_credit
  from public.merchant_referral_subscription_credits c
  where c.merchant_id = v_merchant_id
  limit 1;

  if v_credit.id is null then
    return jsonb_build_object('available', false, 'redeemed', false, 'months', 0);
  end if;

  return jsonb_build_object(
    'id', v_credit.id,
    'available', v_credit.status = 'available',
    'redeemed', v_credit.status = 'redeemed',
    'months', v_credit.months,
    'available_at', v_credit.available_at,
    'redeemed_at', v_credit.redeemed_at,
    'applied_subscription_id', v_credit.applied_subscription_id
  );
end;
$function$;

revoke all on function public.my_merchant_referral_subscription_credit() from public;
grant execute on function public.my_merchant_referral_subscription_credit() to authenticated;

create or replace function public.redeem_my_merchant_referral_subscription_credit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_merchant public.merchants%rowtype;
  v_credit public.merchant_referral_subscription_credits%rowtype;
  v_subscription public.merchant_subscriptions%rowtype;
  v_plan_id uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into v_merchant
  from public.merchants m
  where m.user_id = v_user_id
  order by m.created_at desc
  limit 1
  for update;

  if v_merchant.id is null or v_merchant.approval_status <> 'approved'::public.approval_status then
    raise exception 'approved_merchant_required';
  end if;

  select * into v_credit
  from public.merchant_referral_subscription_credits c
  where c.merchant_id = v_merchant.id
  for update;

  if v_credit.id is null then raise exception 'referral_subscription_credit_not_found'; end if;
  if v_credit.status = 'redeemed' then
    return jsonb_build_object(
      'redeemed', true,
      'already_redeemed', true,
      'subscription_id', v_credit.applied_subscription_id,
      'redeemed_at', v_credit.redeemed_at
    );
  end if;
  if v_credit.status <> 'available' then raise exception 'referral_subscription_credit_not_available'; end if;

  select * into v_subscription
  from public.merchant_subscriptions s
  where s.merchant_id = v_merchant.id
    and s.status in ('trialing','active','past_due')
  order by coalesce(s.ends_at, s.next_billing_at, s.starts_at) desc
  limit 1
  for update;

  v_plan_id := coalesce(v_subscription.plan_id, v_merchant.billing_plan_id);
  if v_plan_id is null then
    select p.id into v_plan_id
    from public.subscription_plans p
    where p.is_active
    order by p.duration_days asc, p.monthly_price asc, p.sort_order asc
    limit 1;
  end if;
  if v_plan_id is null then raise exception 'active_subscription_plan_not_found'; end if;

  v_start := greatest(now(), coalesce(v_subscription.ends_at, v_subscription.next_billing_at, now()));
  v_end := v_start + make_interval(months => v_credit.months);

  if v_subscription.id is null then
    insert into public.merchant_subscriptions (
      merchant_id, plan_id, status, starts_at, ends_at, next_billing_at,
      billing_model, grace_months, balance_due, auto_renew, metadata,
      price_snapshot, started_by
    ) values (
      v_merchant.id,
      v_plan_id,
      'active',
      now(),
      v_end,
      v_end,
      'monthly_subscription',
      0,
      0,
      false,
      jsonb_build_object('source','merchant_referral_welcome_credit','months',v_credit.months),
      jsonb_build_object('amount',0,'currency','EGP','source','referral_credit'),
      v_user_id
    ) returning * into v_subscription;
  else
    update public.merchant_subscriptions
    set status = 'active',
        ends_at = v_end,
        next_billing_at = v_end,
        suspended_at = null,
        blocked_from_new_work_at = null,
        suspension_reason = null,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'referral_welcome_credit_redeemed_at', now(),
          'referral_welcome_credit_months', v_credit.months
        ),
        updated_at = now()
    where id = v_subscription.id
    returning * into v_subscription;
  end if;

  update public.merchant_referral_subscription_credits
  set status = 'redeemed',
      redeemed_at = now(),
      applied_subscription_id = v_subscription.id,
      updated_at = now()
  where id = v_credit.id;

  insert into public.notifications (
    user_id, type, title_ar, title_en, body_ar, body_en,
    deep_link, dedupe_key, payload
  ) values (
    v_user_id,
    'merchant_referral_credit_redeemed',
    'تم تفعيل شهر الاشتراك المجاني',
    'Free subscription month activated',
    'تمت إضافة شهر اشتراك مجاني إلى حساب متجرك بنجاح.',
    'One free subscription month was added to your merchant account.',
    'saarly://merchant/subscription',
    'merchant-referral-credit:' || v_credit.id::text,
    jsonb_build_object('credit_id',v_credit.id,'subscription_id',v_subscription.id,'ends_at',v_end)
  )
  on conflict (user_id,dedupe_key) where dedupe_key is not null do nothing;

  return jsonb_build_object(
    'redeemed', true,
    'already_redeemed', false,
    'months', v_credit.months,
    'subscription_id', v_subscription.id,
    'ends_at', v_end
  );
end;
$function$;

revoke all on function public.redeem_my_merchant_referral_subscription_credit() from public;
grant execute on function public.redeem_my_merchant_referral_subscription_credit() to authenticated;

create or replace function public.my_referral_dashboard_for(p_audience text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_user_id uuid := auth.uid();
  referral_row public.referrals;
  reward_row public.referral_rewards;
  audience text := case when lower(coalesce(p_audience, 'buyer')) = 'merchant' then 'merchant' else 'buyer' end;
  flag_config jsonb := '{}'::jsonb;
  reward_text text;
  display_reward_type public.referral_reward_type;
  enabled_value boolean := private.feature_enabled('monetization_enabled') and private.feature_enabled('referrals_enabled');
  standard_target integer := 10;
  first_target integer := 10;
  current_target integer := 10;
  qualified_rewards_count integer := 0;
  completed_registrations integer := 0;
  current_registrations integer := 0;
  credit_json jsonb := '{}'::jsonb;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;

  select coalesce(f.configuration, '{}'::jsonb) into flag_config
  from public.feature_flags f where f.key='referrals_enabled';

  select r.* into referral_row from public.referrals r where r.referrer_user_id=current_user_id limit 1;
  if referral_row.id is null then referral_row := private.ensure_referral_for_user(current_user_id); end if;

  reward_text := case when audience='merchant'
    then coalesce(flag_config->>'active_merchant_reward_type',flag_config->>'merchant_reward_type','monthly_subscription')
    else coalesce(flag_config->>'active_buyer_reward_type',flag_config->>'buyer_reward_type',flag_config->>'default_reward_type','tshirt') end;
  display_reward_type := private.referral_reward_type_from_text(
    reward_text,
    case when audience='merchant' then 'monthly_subscription'::public.referral_reward_type else 'tshirt'::public.referral_reward_type end
  );

  standard_target := greatest(coalesce(referral_row.standard_target_confirmed_registrations, referral_row.target_confirmed_registrations, 10),1);
  first_target := greatest(coalesce(referral_row.first_milestone_target_confirmed_registrations,standard_target),1);

  select count(*)::integer into qualified_rewards_count
  from public.referral_rewards rw
  where rw.user_id=current_user_id and rw.referral_id=referral_row.id;

  completed_registrations := case
    when qualified_rewards_count=0 then 0
    else first_target + ((qualified_rewards_count-1)*standard_target)
  end;
  current_registrations := greatest(referral_row.confirmed_registrations-completed_registrations,0);
  current_target := case when qualified_rewards_count=0 then first_target else standard_target end;

  select rw.* into reward_row
  from public.referral_rewards rw
  where rw.user_id=current_user_id and rw.referral_id=referral_row.id
  order by rw.milestone_number desc,rw.created_at desc limit 1;

  if audience='merchant' then
    credit_json := public.my_merchant_referral_subscription_credit();
  end if;

  return jsonb_build_object(
    'enabled', enabled_value,
    'referral_id', referral_row.id,
    'referral_code', referral_row.referral_code,
    'referral_url', referral_row.referral_url,
    'confirmed_registrations', current_registrations,
    'total_confirmed_registrations', referral_row.confirmed_registrations,
    'target_confirmed_registrations', current_target,
    'standard_target_confirmed_registrations', standard_target,
    'first_milestone_target_confirmed_registrations', first_target,
    'first_target_discount_applied', first_target < standard_target,
    'qualified_rewards_count', qualified_rewards_count,
    'next_target_remaining', greatest(current_target-current_registrations,0),
    'reward_type', display_reward_type::text,
    'reward_label_ar', private.referral_reward_option_label(flag_config,audience,display_reward_type,'ar'),
    'reward_label_en', private.referral_reward_option_label(flag_config,audience,display_reward_type,'en'),
    'reward_options_label_ar', private.referral_reward_option_label(flag_config,audience,display_reward_type,'ar'),
    'reward_options_label_en', private.referral_reward_option_label(flag_config,audience,display_reward_type,'en'),
    'banner_image_url', case when audience='merchant' then coalesce(flag_config->>'merchant_banner_image_url','') else coalesce(flag_config->>'buyer_banner_image_url','') end,
    'achieved', current_target>0 and current_registrations>=current_target,
    'reward_status', reward_row.delivery_status::text,
    'reward_created_at', reward_row.created_at,
    'reward_milestone_number', reward_row.milestone_number,
    'audience', audience,
    'welcome_subscription_credit', credit_json
  );
end;
$function$;

drop view if exists public.admin_referrals_rewards_dashboard_readable;
create view public.admin_referrals_rewards_dashboard_readable as
select
  r.id,
  r.id as referral_id,
  u.full_name as referrer_name,
  u.primary_email as referrer_email,
  u.mobile as referrer_mobile,
  u.full_name as rewarded_user_name,
  r.referral_code,
  r.referral_url,
  r.confirmed_registrations,
  r.target_confirmed_registrations,
  r.standard_target_confirmed_registrations,
  r.first_milestone_target_confirmed_registrations,
  r.reward_type,
  reward.id as reward_id,
  reward.delivery_status,
  reward.delivered_at,
  reward.milestone_number,
  reward.qualified_registrations,
  greatest(
    case when reward.id is null then r.first_milestone_target_confirmed_registrations else r.standard_target_confirmed_registrations end
      - greatest(r.confirmed_registrations - coalesce(reward.qualified_registrations,0),0),
    0
  ) as remaining_registrations,
  case
    when reward.id is null and r.confirmed_registrations < r.first_milestone_target_confirmed_registrations then 'لم تستحق مكافأة بعد'
    when reward.id is null then 'بانتظار إنشاء المكافأة'
    when reward.delivery_status::text='delivered' then 'تم تسليم المكافأة'
    else 'المكافأة مستحقة'
  end as status_ar,
  case
    when reward.id is null and r.confirmed_registrations < r.first_milestone_target_confirmed_registrations then 'Not eligible yet'
    when reward.id is null then 'Reward creation pending'
    when reward.delivery_status::text='delivered' then 'Reward delivered'
    else 'Reward earned'
  end as status_en,
  case
    when reward.id is null then 'لا توجد مكافأة مستحقة بعد'
    when reward.delivery_status::text='delivered' then 'تم التسليم'
    when reward.delivery_status::text='approved' then 'معتمدة وبانتظار التسليم'
    when reward.delivery_status::text='rejected' then 'مرفوضة'
    else 'بانتظار المراجعة'
  end as reward_delivery_status_ar,
  concat_ws(' - ',u.full_name,u.primary_email,u.mobile,r.referral_code,r.confirmed_registrations::text || ' إحالة') as row_description_ar,
  coalesce(reward.created_at,r.created_at) as created_at,
  greatest(r.updated_at,coalesce(reward.updated_at,r.updated_at)) as updated_at
from public.referrals r
join public.users u on u.id=r.referrer_user_id
left join lateral (
  select rw.* from public.referral_rewards rw
  where rw.referral_id=r.id
  order by rw.created_at desc limit 1
) reward on true
where r.confirmed_registrations > 0;

grant select on public.admin_referrals_rewards_dashboard_readable to service_role;

create or replace function public.admin_confirmed_orders_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $function$
  select case when public.is_admin()
    then (select count(*)::bigint from public.orders o where o.status='confirmed'::public.order_status)
    else 0::bigint
  end;
$function$;

revoke all on function public.admin_confirmed_orders_count() from public;
grant execute on function public.admin_confirmed_orders_count() to authenticated, service_role;

-- Realtime: keep both parties synchronized while the app is open.
do $block$
declare
  v_table text;
begin
  foreach v_table in array array[
    'quote_requests','rfq_requests','rfq_responses','offers','orders',
    'order_merchant_fulfillments','notifications','branches'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$block$;
