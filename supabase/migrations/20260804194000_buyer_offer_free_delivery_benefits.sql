create or replace view public.buyer_offer_delivery_benefits
with (security_invoker = false)
as
select
  o.id as offer_id,
  branch_row.id as branch_id,
  branch_row.name as branch_name,
  coalesce(branch_row.delivery_enabled, delivery.is_enabled, false) as delivery_available,
  coalesce(branch_row.free_delivery_enabled, false) as free_delivery_enabled,
  branch_row.free_delivery_minimum,
  (
    coalesce(branch_row.delivery_enabled, delivery.is_enabled, false)
    and coalesce(branch_row.free_delivery_enabled, false)
    and branch_row.free_delivery_minimum is not null
    and o.total_price_snapshot >= branch_row.free_delivery_minimum
  ) as free_delivery_eligible,
  case
    when coalesce(branch_row.delivery_enabled, delivery.is_enabled, false)
      and coalesce(branch_row.free_delivery_enabled, false)
      and branch_row.free_delivery_minimum is not null
      and o.total_price_snapshot >= branch_row.free_delivery_minimum then 0::numeric
    when coalesce(o.ranking_reason->>'delivery_cost', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (o.ranking_reason->>'delivery_cost')::numeric
    when coalesce(o.ranking_reason->>'delivery_fee', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (o.ranking_reason->>'delivery_fee')::numeric
    else null
  end as effective_delivery_cost
from public.offers o
join public.quote_requests q on q.id = o.quote_request_id
left join public.delivery_settings delivery on delivery.merchant_id = o.merchant_id
left join lateral (
  select b.*
  from public.branches b
  where b.merchant_id = o.merchant_id
    and b.approval_status = 'approved'::public.approval_status
  order by (b.id = q.target_branch_id) desc, b.is_primary desc, b.created_at asc
  limit 1
) branch_row on true
where q.buyer_id = auth.uid();

grant select on public.buyer_offer_delivery_benefits to authenticated;
