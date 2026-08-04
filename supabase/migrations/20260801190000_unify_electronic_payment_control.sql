-- Make the current admin electronic-payment flag effective for every merchant payment creation path.
-- Keep the legacy flag synchronized for older deployed clients only.

create or replace function private.electronic_payments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.feature_enabled('monetization_enabled')
    and private.feature_enabled('electronic_payments_enabled');
$$;

create or replace function public.sync_electronic_payment_legacy_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key = 'electronic_payments_enabled' then
    insert into public.feature_flags (
      key,
      description_ar,
      description_en,
      is_enabled,
      configuration,
      updated_by
    ) values (
      'electronic_payments',
      'توافق قديم للدفع الإلكتروني',
      'Legacy electronic payment compatibility',
      coalesce(new.is_enabled, false),
      coalesce(new.configuration, '{}'::jsonb)
        || jsonb_build_object('controlled_by', 'electronic_payments_enabled'),
      new.updated_by
    )
    on conflict (key) do update
    set is_enabled = excluded.is_enabled,
        configuration = excluded.configuration,
        updated_by = excluded.updated_by,
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_electronic_payment_legacy_flag on public.feature_flags;
create trigger sync_electronic_payment_legacy_flag
after insert or update of is_enabled, configuration on public.feature_flags
for each row
when (new.key = 'electronic_payments_enabled')
execute function public.sync_electronic_payment_legacy_flag();

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
  provider_row public.payment_settings;
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

  if not private.electronic_payments_enabled() then
    raise exception 'electronic_payments_disabled';
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

  select * into provider_row
  from public.payment_settings
  where provider = p_provider
    and is_enabled;

  if not found then
    raise exception 'payment_provider_disabled';
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
    user_id,
    merchant_id,
    subscription_id,
    provider,
    amount,
    currency,
    status,
    external_reference,
    purpose,
    direct_to_merchant,
    idempotency_key
  ) values (
    merchant_row.user_id,
    merchant_row.id,
    subscription_row.id,
    p_provider,
    amount_value,
    'EGP',
    'pending',
    external_ref_value,
    'subscription',
    false,
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
  provider_row public.payment_settings;
  amount_value numeric(14, 2);
  external_ref_value text;
  saved_transaction public.payment_transactions;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not private.electronic_payments_enabled() then
    raise exception 'electronic_payments_disabled';
  end if;

  select m.* into merchant_row
  from public.merchants m
  where m.user_id = current_user_id
  order by m.created_at desc
  limit 1;

  if merchant_row.id is null then
    raise exception 'merchant_not_found_for_current_user';
  end if;

  select * into provider_row
  from public.payment_settings
  where provider = p_provider
    and is_enabled;

  if provider_row.id is null then
    raise exception 'payment_provider_disabled';
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
    user_id,
    merchant_id,
    subscription_id,
    provider,
    amount,
    currency,
    status,
    external_reference,
    purpose,
    direct_to_merchant,
    idempotency_key
  ) values (
    current_user_id,
    merchant_row.id,
    subscription_row.id,
    p_provider,
    amount_value,
    'EGP',
    'pending',
    external_ref_value,
    case when subscription_row.id is null then 'merchant_balance' else 'subscription' end,
    false,
    external_ref_value
  )
  on conflict (provider, external_reference)
  do update set updated_at = now()
  returning * into saved_transaction;

  return saved_transaction;
end;
$$;

update public.feature_flags legacy
set is_enabled = current_flag.is_enabled,
    configuration = coalesce(current_flag.configuration, '{}'::jsonb)
      || jsonb_build_object('controlled_by', 'electronic_payments_enabled'),
    updated_by = current_flag.updated_by,
    updated_at = now()
from public.feature_flags current_flag
where legacy.key = 'electronic_payments'
  and current_flag.key = 'electronic_payments_enabled';
