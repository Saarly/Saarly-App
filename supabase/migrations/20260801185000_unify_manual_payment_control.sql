-- Make the current admin flag the single source of truth for manual subscription payments.
-- Keep the legacy flag synchronized only for older deployed clients.

create or replace function private.manual_payments_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.feature_enabled('monetization_enabled')
    and private.feature_enabled('manual_payments_enabled');
$$;

create or replace function public.sync_manual_payment_legacy_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.key = 'manual_payments_enabled' then
    insert into public.feature_flags (
      key,
      description_ar,
      description_en,
      is_enabled,
      configuration,
      updated_by
    ) values (
      'manual_payment_enabled',
      'توافق قديم للتحويل اليدوي',
      'Legacy manual payment compatibility',
      coalesce(new.is_enabled, false),
      coalesce(new.configuration, '{}'::jsonb)
        || jsonb_build_object('controlled_by', 'manual_payments_enabled'),
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

drop trigger if exists sync_manual_payment_legacy_flag on public.feature_flags;
create trigger sync_manual_payment_legacy_flag
after insert or update of is_enabled, configuration on public.feature_flags
for each row
when (new.key = 'manual_payments_enabled')
execute function public.sync_manual_payment_legacy_flag();

create or replace function public.portal_create_manual_subscription_payment_request(
  p_plan_id uuid,
  p_manual_payment_method_id uuid,
  p_contact_email text,
  p_proof_storage_path text,
  p_transfer_reference text default null,
  p_idempotency_key text default null
)
returns public.manual_payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  mid uuid;
  plan_row public.subscription_plans;
  method_row public.manual_payment_methods;
  proof_row storage.objects;
  price jsonb;
  saved public.manual_payment_requests;
  mime text;
  size_bytes integer;
begin
  if uid is null then
    raise exception 'authentication_required';
  end if;

  if not private.manual_payments_enabled() then
    raise exception 'manual_payment_disabled';
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

  if p_idempotency_key is not null then
    select * into saved
    from public.manual_payment_requests
    where merchant_id = mid
      and idempotency_key = p_idempotency_key;

    if saved.id is not null then
      return saved;
    end if;
  end if;

  select * into plan_row
  from public.subscription_plans
  where id = p_plan_id
    and is_active;

  if plan_row.id is null then
    raise exception 'subscription_plan_not_available';
  end if;

  select * into method_row
  from public.manual_payment_methods
  where id = p_manual_payment_method_id
    and is_active;

  if method_row.id is null then
    raise exception 'manual_payment_method_not_available';
  end if;

  if p_contact_email is null or position('@' in p_contact_email) = 0 then
    raise exception 'contact_email_required';
  end if;

  select * into proof_row
  from storage.objects
  where bucket_id = 'merchant-payment-proofs'
    and name = p_proof_storage_path;

  if proof_row.id is null then
    raise exception 'payment_proof_not_found';
  end if;

  if (storage.foldername(proof_row.name))[1] <> mid::text then
    raise exception 'payment_proof_not_owned_by_merchant';
  end if;

  mime := coalesce(proof_row.metadata->>'mimetype', '');
  size_bytes := coalesce(nullif(proof_row.metadata->>'size', '')::integer, 0);

  if not (mime = any(method_row.allowed_mime_types)) then
    raise exception 'payment_proof_type_not_allowed';
  end if;

  if size_bytes > method_row.max_file_size_bytes then
    raise exception 'payment_proof_file_too_large';
  end if;

  price := private.subscription_price_snapshot(mid, p_plan_id, now());

  insert into public.manual_payment_requests (
    merchant_id,
    plan_id,
    manual_payment_method_id,
    contact_email,
    transfer_reference,
    proof_storage_path,
    proof_mime_type,
    proof_size_bytes,
    original_amount,
    discount_id,
    discount_percent,
    discount_amount,
    final_amount,
    currency,
    duration_days,
    plan_snapshot,
    price_snapshot,
    idempotency_key
  ) values (
    mid,
    p_plan_id,
    p_manual_payment_method_id,
    p_contact_email,
    p_transfer_reference,
    p_proof_storage_path,
    mime,
    size_bytes,
    (price->>'original_price')::numeric,
    nullif(price->>'discount_id', '')::uuid,
    (price->>'discount_percent')::numeric,
    (price->>'discount_amount')::numeric,
    (price->>'final_price')::numeric,
    coalesce(price->>'currency', 'EGP'),
    (price->>'duration_days')::integer,
    to_jsonb(plan_row),
    price,
    p_idempotency_key
  )
  returning * into saved;

  return saved;
end;
$$;

revoke all on function public.portal_create_manual_subscription_payment_request(uuid, uuid, text, text, text, text) from public;
grant execute on function public.portal_create_manual_subscription_payment_request(uuid, uuid, text, text, text, text) to authenticated;

-- Align the legacy value immediately with the current admin-controlled flag.
update public.feature_flags legacy
set is_enabled = current_flag.is_enabled,
    configuration = coalesce(current_flag.configuration, '{}'::jsonb)
      || jsonb_build_object('controlled_by', 'manual_payments_enabled'),
    updated_by = current_flag.updated_by,
    updated_at = now()
from public.feature_flags current_flag
where legacy.key = 'manual_payment_enabled'
  and current_flag.key = 'manual_payments_enabled';
