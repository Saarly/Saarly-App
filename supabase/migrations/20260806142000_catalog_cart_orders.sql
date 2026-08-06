create or replace function public.create_catalog_cart_order(
  p_merchant_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_buyer_id uuid := auth.uid();
  v_quote_request_id uuid;
  v_offer_id uuid;
  v_order_id uuid;
  v_branch_id uuid;
  v_total numeric(14,2);
  v_requested_count integer;
begin
  if v_buyer_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_merchant_id is null then
    raise exception 'merchant_required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'catalog_cart_empty';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'catalog_cart_too_large';
  end if;

  if exists (
    select 1
    from public.merchants m
    where m.id = p_merchant_id
      and m.user_id = v_buyer_id
  ) then
    raise exception 'cannot_order_from_own_store';
  end if;

  if not exists (
    select 1
    from public.merchants m
    join public.users u on u.id = m.user_id
    where m.id = p_merchant_id
      and m.approval_status = 'approved'
      and not u.is_blocked
      and public.merchant_can_receive_new_work(m.id)
  ) then
    raise exception 'target_merchant_unavailable';
  end if;

  select b.id into v_branch_id
  from public.branches b
  where b.merchant_id = p_merchant_id
    and b.approval_status = 'approved'
  order by b.is_primary desc, b.created_at
  limit 1;

  if v_branch_id is null then
    raise exception 'merchant_branch_not_available';
  end if;

  with requested as (
    select
      private.safe_uuid(item->>'product_id') as product_id,
      sum(greatest(coalesce((item->>'quantity')::numeric, 0), 0)) as quantity
    from jsonb_array_elements(p_items) item
    group by private.safe_uuid(item->>'product_id')
  )
  select count(*) into v_requested_count
  from requested
  where product_id is not null and quantity > 0;

  if v_requested_count = 0 then
    raise exception 'catalog_cart_empty';
  end if;

  if exists (
    with requested as (
      select
        private.safe_uuid(item->>'product_id') as product_id,
        sum(greatest(coalesce((item->>'quantity')::numeric, 0), 0)) as quantity
      from jsonb_array_elements(p_items) item
      group by private.safe_uuid(item->>'product_id')
    )
    select 1
    from requested r
    left join public.products p on p.id = r.product_id
    where r.product_id is null
       or r.quantity <= 0
       or p.id is null
       or p.merchant_id <> p_merchant_id
       or not p.is_active
       or not p.is_available
       or p.price < 0
       or p.quantity < r.quantity
  ) then
    raise exception 'catalog_cart_product_unavailable';
  end if;

  with requested as (
    select
      private.safe_uuid(item->>'product_id') as product_id,
      sum((item->>'quantity')::numeric) as quantity
    from jsonb_array_elements(p_items) item
    group by private.safe_uuid(item->>'product_id')
  )
  select round(sum(p.price * r.quantity), 2)
  into v_total
  from requested r
  join public.products p on p.id = r.product_id;

  insert into public.quote_requests (
    buyer_id,
    search_scope,
    source,
    ai_review_status,
    approved_at,
    delivery_type,
    target_merchant_id,
    target_branch_id,
    response_deadline_at
  ) values (
    v_buyer_id,
    jsonb_build_object(
      'scope', 'country',
      'source', 'catalog_cart',
      'merchant_id', p_merchant_id,
      'branch_id', v_branch_id
    ),
    'manual',
    'approved',
    now(),
    'direct',
    p_merchant_id,
    v_branch_id,
    now() + interval '7 days'
  ) returning id into v_quote_request_id;

  insert into public.quote_items (
    quote_request_id,
    requested_name,
    quantity,
    unit,
    specifications,
    ai_confidence,
    display_order
  )
  with requested as (
    select
      private.safe_uuid(item->>'product_id') as product_id,
      sum((item->>'quantity')::numeric) as quantity,
      min(ordinality)::integer as display_order
    from jsonb_array_elements(p_items) with ordinality as source(item, ordinality)
    group by private.safe_uuid(item->>'product_id')
  )
  select
    v_quote_request_id,
    p.free_name,
    r.quantity,
    p.unit,
    jsonb_strip_nulls(jsonb_build_object(
      'catalog_product_id', p.id,
      'category_id', p.category_id,
      'brand', p.brand,
      'size', p.size,
      'color', p.color,
      'catalog_price_snapshot', p.price,
      'source', 'catalog_cart'
    )),
    1,
    r.display_order
  from requested r
  join public.products p on p.id = r.product_id
  order by r.display_order;

  insert into public.offers (
    quote_request_id,
    merchant_id,
    kind,
    status,
    total_price_snapshot,
    ranking,
    coverage_percentage,
    ranking_reason,
    expires_at
  ) values (
    v_quote_request_id,
    p_merchant_id,
    'single_merchant',
    'active',
    v_total,
    1,
    100,
    jsonb_build_object(
      'source', 'catalog_cart',
      'branch_id', v_branch_id,
      'products_total', v_total,
      'grand_total', v_total,
      'delivery_mode', 'undecided'
    ),
    now() + interval '7 days'
  ) returning id into v_offer_id;

  insert into public.offer_items (
    offer_id,
    quote_item_id,
    merchant_id,
    product_id,
    matched_name_snapshot,
    requested_quantity_snapshot,
    unit_snapshot,
    unit_price_snapshot,
    line_total_snapshot,
    match_confidence,
    is_available
  )
  select
    v_offer_id,
    qi.id,
    p_merchant_id,
    p.id,
    p.free_name,
    qi.quantity,
    p.unit,
    p.price,
    round(p.price * qi.quantity, 2),
    1,
    true
  from public.quote_items qi
  join public.products p
    on p.id = private.safe_uuid(qi.specifications->>'catalog_product_id')
  where qi.quote_request_id = v_quote_request_id;

  v_order_id := public.accept_offer(v_offer_id);

  update public.order_merchant_fulfillments
  set branch_id = v_branch_id,
      updated_at = now()
  where order_id = v_order_id
    and merchant_id = p_merchant_id;


  return jsonb_build_object(
    'order_id', v_order_id,
    'quote_request_id', v_quote_request_id,
    'offer_id', v_offer_id,
    'merchant_id', p_merchant_id,
    'branch_id', v_branch_id,
    'products_total', v_total
  );
end;
$function$;

revoke all on function public.create_catalog_cart_order(uuid, jsonb) from public;
grant execute on function public.create_catalog_cart_order(uuid, jsonb) to authenticated;
