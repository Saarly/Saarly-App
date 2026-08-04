-- A payment gateway is usable only after a real adapter test succeeded and a secret reference exists.

create or replace function private.payment_provider_ready(p_provider public.payment_provider)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.electronic_payments_enabled()
    and coalesce((
      select p.is_enabled
        and p.is_connected
        and p.config_status = 'connected'
        and nullif(btrim(coalesce(p.secret_reference, '')), '') is not null
        and coalesce(p.metadata->>'last_test_result', '') = 'connection_succeeded'
      from public.payment_settings p
      where p.provider = p_provider
    ), false);
$$;

create or replace function private.enabled_payment_providers_public()
returns table(provider public.payment_provider)
language sql
stable
security definer
set search_path = ''
as $$
  select p.provider
  from public.payment_settings p
  where private.payment_provider_ready(p.provider);
$$;

create or replace function public.create_subscription_payment_transaction(
  p_subscription_id uuid,
  p_provider public.payment_provider,
  p_amount numeric default null,
  p_external_reference text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  subscription_row public.merchant_subscriptions;
  merchant_row public.merchants;
  amount_value numeric(14, 2);
  external_ref_value text;
  saved_transaction public.payment_transactions;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  if not private.monthly_subscriptions_enabled() then
    raise exception 'monthly_subscriptions_disabled';
  end if;

  if not private.payment_provider_ready(p_provider) then
    raise exception 'payment_provider_not_ready';
  end if;

  select * into subscription_row
  from public.merchant_subscriptions
  where id = p_subscription_id;

  if not found then
    raise exception 'subscription_not_found';
  end if;

  select * into merchant_row
  from public.merchants
  where id = subscription_row.merchant_id;

  if not found or (merchant_row.user_id <> auth.uid() and not public.is_admin()) then
    raise exception 'subscription_not_available_for_current_user';
  end if;

  amount_value := coalesce(p_amount, nullif(subscription_row.balance_due, 0));
  if amount_value is null or amount_value <= 0 then
    raise exception 'payment_amount_required';
  end if;

  external_ref_value := coalesce(
    nullif(btrim(coalesce(p_external_reference, '')), ''),
    'subscription:' || subscription_row.id::text || ':' || extensions.gen_random_uuid()::text
  );

  insert into public.payment_transactions (
    user_id, merchant_id, subscription_id, provider, amount, currency,
    status, external_reference, purpose, direct_to_merchant, idempotency_key
  ) values (
    merchant_row.user_id, merchant_row.id, subscription_row.id, p_provider,
    amount_value, 'EGP', 'pending', external_ref_value, 'subscription', false,
    external_ref_value
  )
  on conflict (provider, external_reference)
  do update set updated_at = now()
  returning * into saved_transaction;

  return saved_transaction;
end;
$$;

create or replace function public.create_my_merchant_dues_payment_transaction(
  p_provider public.payment_provider,
  p_amount numeric default null,
  p_external_reference text default null
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  merchant_row public.merchants;
  subscription_row public.merchant_subscriptions;
  amount_value numeric(14, 2);
  external_ref_value text;
  saved_transaction public.payment_transactions;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.payment_provider_ready(p_provider) then
    raise exception 'payment_provider_not_ready';
  end if;

  select m.* into merchant_row
  from public.merchants m
  where m.user_id = current_user_id
  order by m.created_at desc
  limit 1;

  if merchant_row.id is null then
    raise exception 'merchant_not_found_for_current_user';
  end if;

  select s.* into subscription_row
  from public.merchant_subscriptions s
  where s.merchant_id = merchant_row.id
    and s.status in ('trialing', 'active', 'past_due', 'suspended')
  order by s.created_at desc
  limit 1;

  amount_value := coalesce(
    p_amount,
    nullif(subscription_row.balance_due, 0),
    nullif(private.current_merchant_balance(merchant_row.id), 0)
  );

  if amount_value is null or amount_value <= 0 then
    raise exception 'payment_amount_required';
  end if;

  external_ref_value := coalesce(
    nullif(btrim(coalesce(p_external_reference, '')), ''),
    'merchant-dues:' || merchant_row.id::text || ':' || extensions.gen_random_uuid()::text
  );

  insert into public.payment_transactions (
    user_id, merchant_id, subscription_id, provider, amount, currency,
    status, external_reference, purpose, direct_to_merchant, idempotency_key
  ) values (
    current_user_id, merchant_row.id, subscription_row.id, p_provider,
    amount_value, 'EGP', 'pending', external_ref_value,
    case when subscription_row.id is null then 'merchant_balance' else 'subscription' end,
    false, external_ref_value
  )
  on conflict (provider, external_reference)
  do update set updated_at = now()
  returning * into saved_transaction;

  return saved_transaction;
end;
$$;

-- Remove false positive connection states. Configuration is preserved for later adapter setup.
update public.payment_settings
set is_enabled = false,
    is_connected = false,
    config_status = case
      when nullif(btrim(coalesce(secret_reference, '')), '') is null then 'not_configured'::public.payment_gateway_config_status
      else 'configured'::public.payment_gateway_config_status
    end,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'last_test_result', case
        when nullif(btrim(coalesce(secret_reference, '')), '') is null
          then 'secret_reference_required'
        else 'adapter_required'
      end,
      'connection_reset_reason', 'missing_verified_adapter_connection'
    ),
    updated_at = now()
where is_connected
  and (
    nullif(btrim(coalesce(secret_reference, '')), '') is null
    or coalesce(metadata->>'last_test_result', '') <> 'connection_succeeded'
  );
