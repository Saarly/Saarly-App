-- Flutter receives a read-only financial snapshot from current controls.
-- It never receives plans, payment methods, checkout actions, or proof-upload data.

create or replace function public.my_monetization_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  mid uuid;
  subscription_row public.merchant_subscriptions;
  plan_row public.subscription_plans;
  latest_payments jsonb := '[]'::jsonb;
  commissions_due numeric(14,2) := 0;
  commissions_paid numeric(14,2) := 0;
  effective_commission_rate numeric(5,2) := 0;
begin
  payload := public.merchant_account_status();
  mid := nullif(payload->>'merchant_id', '')::uuid;

  if mid is null then
    raise exception 'merchant_not_found_for_current_user';
  end if;

  if nullif(payload->>'current_subscription_id', '') is not null then
    select * into subscription_row
    from public.merchant_subscriptions
    where id = (payload->>'current_subscription_id')::uuid;
  end if;

  if subscription_row.id is null then
    select * into subscription_row
    from public.merchant_subscriptions
    where merchant_id = mid
    order by created_at desc
    limit 1;
  end if;

  if subscription_row.plan_id is not null then
    select * into plan_row
    from public.subscription_plans
    where id = subscription_row.plan_id;
  end if;

  select
    coalesce(sum(mc.commission_amount) filter (
      where mc.status in ('due', 'pending', 'overdue')
        and mc.paid_at is null
        and mc.settlement_id is null
    ), 0),
    coalesce(sum(mc.commission_amount) filter (
      where mc.paid_at is not null
         or mc.settlement_id is not null
         or mc.status = 'paid'
    ), 0)
  into commissions_due, commissions_paid
  from public.merchant_commissions mc
  where mc.merchant_id = mid;

  if private.commissions_are_enabled() then
    select coalesce(cs.global_rate, 0)
    into effective_commission_rate
    from public.commission_settings cs
    where cs.is_enabled
    order by cs.updated_at desc, cs.created_at desc
    limit 1;
  end if;

  select coalesce(jsonb_agg(item.payload order by item.created_at desc), '[]'::jsonb)
  into latest_payments
  from (
    select
      pt.created_at,
      jsonb_build_object(
        'id', pt.id,
        'provider', pt.provider::text,
        'amount', pt.amount,
        'currency', btrim(pt.currency::text),
        'status', pt.status::text,
        'purpose', pt.purpose,
        'created_at', pt.created_at,
        'paid_at', pt.paid_at,
        'direct_to_merchant', pt.direct_to_merchant
      ) as payload
    from public.payment_transactions pt
    where pt.merchant_id = mid
      and pt.purpose in ('subscription', 'merchant_balance', 'commission_settlement')
    order by pt.created_at desc
    limit 20
  ) item;

  return payload || jsonb_build_object(
    'visible', private.feature_enabled('monetization_enabled'),
    'monetization_enabled', private.feature_enabled('monetization_enabled'),
    'monthly_subscription_enabled', private.monthly_subscriptions_enabled(),
    'commission_enabled', private.commissions_are_enabled(),
    'can_choose_billing_model', false,
    'manual_payment_enabled', false,
    'automatic_payment_enabled', false,
    'electronic_payment_enabled', false,
    'buyer_in_app_payment_enabled', false,
    'referrals_enabled', private.feature_enabled('referrals_enabled'),
    'payment_methods', '[]'::jsonb,
    'plans', '[]'::jsonb,
    'latest_payments', latest_payments,
    'subscription_id', subscription_row.id,
    'subscription_status', subscription_row.status::text,
    'billing_model', subscription_row.billing_model::text,
    'plan_name_ar', plan_row.name_ar,
    'plan_name_en', plan_row.name_en,
    'monthly_price', coalesce(
      nullif(subscription_row.price_snapshot->>'final_price', '')::numeric,
      plan_row.monthly_price
    ),
    'grace_months', subscription_row.grace_months,
    'blocked_from_new_work_at', subscription_row.blocked_from_new_work_at,
    'balance_due', greatest(private.current_merchant_balance(mid), 0),
    'commissions_due', commissions_due,
    'commissions_paid', commissions_paid,
    'commission_rate', case
      when private.commissions_are_enabled() then effective_commission_rate
      else 0
    end,
    'message_key', 'merchant_check_registered_email'
  );
end;
$$;

revoke all on function public.my_monetization_dashboard() from public;
grant execute on function public.my_monetization_dashboard() to authenticated;
