create or replace function private.apply_branch_delivery_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_quote public.quote_requests%rowtype;
  v_branch public.branches%rowtype;
  v_free boolean := false;
  v_cost numeric;
  v_snapshot jsonb;
begin
  select q.* into v_quote
  from public.orders o
  join public.offers offer on offer.id = o.offer_id
  join public.quote_requests q on q.id = offer.quote_request_id
  where o.id = new.order_id;

  if new.branch_id is null then
    select b.* into v_branch
    from public.branches b
    where b.merchant_id = new.merchant_id
      and b.approval_status = 'approved'
    order by (b.id = v_quote.target_branch_id) desc,
             b.is_primary desc,
             b.created_at asc
    limit 1;
    new.branch_id := v_branch.id;
  else
    select * into v_branch
    from public.branches
    where id = new.branch_id;
  end if;

  if v_branch.id is null then return new; end if;

  if not new.delivery_available_snapshot then
    new.delivery_pricing_method_snapshot := null;
    new.delivery_pricing_table_snapshot := '{}'::jsonb;
    return new;
  end if;

  v_free := v_branch.free_delivery_enabled
    and v_branch.free_delivery_minimum is not null
    and new.subtotal_snapshot >= v_branch.free_delivery_minimum;
  v_snapshot := coalesce(new.delivery_pricing_table_snapshot, '{}'::jsonb);
  v_cost := coalesce((v_snapshot->>'delivery_cost')::numeric, 0);
  if v_free then v_cost := 0; end if;
  new.delivery_pricing_table_snapshot := v_snapshot || jsonb_build_object(
    'branch_id', v_branch.id,
    'branch_name', v_branch.name,
    'products_total', new.subtotal_snapshot,
    'delivery_cost', v_cost,
    'grand_total', new.subtotal_snapshot + v_cost,
    'free_delivery_applied', v_free,
    'free_delivery_minimum', v_branch.free_delivery_minimum
  );
  return new;
end;
$function$;
