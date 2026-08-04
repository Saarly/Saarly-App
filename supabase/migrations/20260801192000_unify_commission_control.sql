-- Use the current admin commission control and commission settings as the only effective source.
-- Legacy flags remain synchronized for compatibility but no longer decide access or accrual.

create or replace function private.commissions_are_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.monetization_enabled()
    and private.feature_enabled('merchant_commission_enabled')
    and coalesce((
      select cs.is_enabled
      from public.commission_settings cs
      order by cs.updated_at desc, cs.created_at desc
      limit 1
    ), false);
$$;

create or replace function public.admin_configure_commissions_as(
  p_actor_id uuid,
  p_is_enabled boolean,
  p_global_rate numeric,
  p_category_rates jsonb default '{}'::jsonb
)
returns public.commission_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.commission_settings;
  v_saved public.commission_settings;
  v_rates jsonb := coalesce(p_category_rates, '{}'::jsonb);
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;

  if p_global_rate is null or p_global_rate < 0 or p_global_rate > 100 then
    raise exception 'global_rate_must_be_between_0_and_100';
  end if;

  if coalesce(p_is_enabled, false) and p_global_rate <= 0
     and not exists (
       select 1
       from jsonb_each_text(v_rates) item
       where nullif(item.value, '')::numeric > 0
     ) then
    raise exception 'enabled_commission_requires_positive_rate';
  end if;

  perform private.validate_commission_category_rates(v_rates);

  select * into v_before
  from public.commission_settings
  order by updated_at desc, created_at desc
  limit 1
  for update;

  if v_before.id is null then
    insert into public.commission_settings (
      is_enabled, global_rate, category_rates, activated_at, updated_by
    ) values (
      coalesce(p_is_enabled, false),
      p_global_rate,
      v_rates,
      case when coalesce(p_is_enabled, false) then now() else null end,
      p_actor_id
    )
    returning * into v_saved;
  else
    update public.commission_settings
    set is_enabled = coalesce(p_is_enabled, false),
        global_rate = p_global_rate,
        category_rates = v_rates,
        activated_at = case
          when coalesce(p_is_enabled, false) and not v_before.is_enabled then now()
          when coalesce(p_is_enabled, false) then coalesce(v_before.activated_at, now())
          else v_before.activated_at
        end,
        updated_by = p_actor_id,
        updated_at = now()
    where id = v_before.id
    returning * into v_saved;
  end if;

  insert into public.feature_flags (
    key, description_ar, description_en, is_enabled, configuration, updated_by
  ) values
    (
      'merchant_commission_enabled',
      'نظام محاسبة المتاجر بالعمولة',
      'Merchant commission billing',
      coalesce(p_is_enabled, false),
      jsonb_build_object('uses_commission_settings', true),
      p_actor_id
    ),
    (
      'commissions',
      'توافق قديم لاحتساب العمولات',
      'Legacy commission calculation compatibility',
      coalesce(p_is_enabled, false),
      jsonb_build_object(
        'global_rate', p_global_rate,
        'category_rates', v_rates,
        'scope', 'new_confirmed_orders_only',
        'controlled_by', 'merchant_commission_enabled'
      ),
      p_actor_id
    ),
    (
      'commission_mode_enabled',
      'توافق قديم لنظام العمولة',
      'Legacy commission mode compatibility',
      coalesce(p_is_enabled, false),
      jsonb_build_object(
        'default_commission_percent', p_global_rate,
        'controlled_by', 'merchant_commission_enabled'
      ),
      p_actor_id
    )
  on conflict (key) do update
  set is_enabled = excluded.is_enabled,
      configuration = excluded.configuration,
      updated_by = excluded.updated_by,
      updated_at = now();

  insert into public.audit_logs (
    actor_id, action, target_table, target_id, old_data, new_data
  ) values (
    p_actor_id,
    'configure_commissions',
    'commission_settings',
    v_saved.id::text,
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_saved)
  );

  return v_saved;
end;
$$;

create or replace function public.portal_set_my_billing_preference(
  p_preference public.merchant_billing_preference
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mid uuid;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;

  if not private.feature_enabled('monetization_enabled') then
    raise exception 'monetization_not_enabled';
  end if;

  if not private.feature_enabled('merchant_can_choose_billing_model') then
    raise exception 'billing_model_choice_disabled';
  end if;

  if p_preference = 'monthly_subscription'
     and not private.monthly_subscriptions_enabled() then
    raise exception 'monthly_subscriptions_disabled';
  end if;

  if p_preference = 'commission'
     and not private.commissions_are_enabled() then
    raise exception 'commission_mode_disabled';
  end if;

  mid := public.current_merchant_id();
  if mid is null then
    select id into mid
    from public.merchants
    where user_id = uid
    order by created_at desc
    limit 1;
  end if;

  if mid is null then
    raise exception 'merchant_not_found_for_current_user';
  end if;

  update public.merchants
  set billing_preference = p_preference,
      billing_preference_changed_at = now(),
      updated_at = now()
  where id = mid;

  insert into public.audit_logs (
    actor_id, action, target_table, target_id, new_data
  ) values (
    uid,
    'portal_set_billing_preference',
    'merchants',
    mid::text,
    jsonb_build_object('billing_preference', p_preference::text)
  );

  return private.merchant_access_snapshot(mid, now());
end;
$$;

-- Current admin state is authoritative. Keep compatibility flags aligned now.
update public.feature_flags legacy
set is_enabled = current_flag.is_enabled,
    configuration = case
      when legacy.key = 'commission_mode_enabled' then
        jsonb_build_object(
          'default_commission_percent', coalesce((
            select cs.global_rate
            from public.commission_settings cs
            order by cs.updated_at desc, cs.created_at desc
            limit 1
          ), 3),
          'controlled_by', 'merchant_commission_enabled'
        )
      else coalesce(legacy.configuration, '{}'::jsonb)
        || jsonb_build_object('controlled_by', 'merchant_commission_enabled')
    end,
    updated_by = current_flag.updated_by,
    updated_at = now()
from public.feature_flags current_flag
where legacy.key in ('commissions', 'commission_mode_enabled')
  and current_flag.key = 'merchant_commission_enabled';
