-- Inventory integrity, stock alerts, storefront stock state, and RFQ catalog links.

create or replace function private.saarly_sync_product_stock_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quantity is null or new.quantity < 0 then
    raise exception 'invalid_product_quantity';
  end if;

  if new.quantity <= 0 then
    new.quantity := 0;
    new.is_available := false;
  elsif tg_op = 'UPDATE'
        and coalesce(old.quantity, 0) <= 0
        and new.quantity > 0
        and new.is_available is not distinct from old.is_available then
    -- Restocking an item that was automatically marked unavailable makes it
    -- available again. The merchant can still turn it off afterwards.
    new.is_available := true;
  end if;

  if tg_op = 'UPDATE' and new.quantity is distinct from old.quantity then
    new.price_quantity_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_stock_state on public.products;
create trigger products_sync_stock_state
before insert or update of quantity on public.products
for each row execute function private.saarly_sync_product_stock_state();

create or replace function private.saarly_notify_product_stock_threshold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_quantity_text text;
begin
  if new.quantity is not distinct from old.quantity then return new; end if;

  select m.user_id into v_owner_id
  from public.merchants m
  where m.id = new.merchant_id;
  if v_owner_id is null then return new; end if;

  v_quantity_text := trim(to_char(new.quantity, 'FM9999999990.###'));

  if old.quantity > 0 and new.quantity <= 0 then
    perform public.enqueue_notification(
      v_owner_id,
      'product_out_of_stock',
      'نفدت كمية منتج',
      'A product is out of stock',
      'نفدت كمية "' || new.free_name || '" وتم إيقافه تلقائيًا عن الطلب حتى تضيف مخزونًا جديدًا.',
      '"' || new.free_name || '" is out of stock and was automatically disabled until you add new stock.',
      'saarly://merchant/products?product=' || new.id::text,
      'product-out-of-stock:' || new.id::text || ':' || txid_current()::text,
      jsonb_build_object('product_id', new.id, 'merchant_id', new.merchant_id, 'remaining_quantity', new.quantity)
    );
  elsif old.quantity > 3 and new.quantity <= 3 and new.quantity > 0 then
    perform public.enqueue_notification(
      v_owner_id,
      'product_low_stock',
      'مخزون منتج أوشك على النفاد',
      'A product is running low',
      'المتبقي من "' || new.free_name || '" هو ' || v_quantity_text || ' ' || new.unit || '. حدّث المخزون قبل نفاده.',
      'Only ' || v_quantity_text || ' ' || new.unit || ' remain for "' || new.free_name || '". Update the stock before it runs out.',
      'saarly://merchant/products?product=' || new.id::text,
      'product-low-stock:' || new.id::text || ':' || txid_current()::text,
      jsonb_build_object('product_id', new.id, 'merchant_id', new.merchant_id, 'remaining_quantity', new.quantity)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists products_notify_stock_threshold on public.products;
create trigger products_notify_stock_threshold
after update of quantity on public.products
for each row execute function private.saarly_notify_product_stock_threshold();

create or replace function private.saarly_validate_order_catalog_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_product public.products%rowtype;
begin
  for v_item in
    select oi.product_id, oi.merchant_id, sum(oi.requested_quantity_snapshot) as required_quantity
    from public.offer_items oi
    where oi.offer_id = new.offer_id
      and oi.is_available
      and oi.product_id is not null
    group by oi.product_id, oi.merchant_id
  loop
    select * into v_product
    from public.products p
    where p.id = v_item.product_id
    for update;

    if v_product.id is null
       or v_product.merchant_id <> v_item.merchant_id
       or not v_product.is_active
       or not v_product.is_available
       or v_product.quantity < v_item.required_quantity then
      raise exception 'offer_product_stock_changed';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists validate_order_catalog_stock on public.orders;
create trigger validate_order_catalog_stock
before insert on public.orders
for each row execute function private.saarly_validate_order_catalog_stock();

create or replace function private.saarly_deduct_confirmed_fulfillment_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_product public.products%rowtype;
  v_remaining numeric;
begin
  if old.status is distinct from new.status
     and old.status = 'awaiting_confirmation'::public.order_status
     and new.status = 'confirmed'::public.order_status then
    for v_item in
      select ofi.product_id, sum(ofi.quantity_snapshot) as required_quantity
      from public.order_fulfillment_items ofi
      where ofi.fulfillment_id = new.id
        and ofi.product_id is not null
      group by ofi.product_id
    loop
      select * into v_product
      from public.products p
      where p.id = v_item.product_id
      for update;

      if v_product.id is null
         or v_product.merchant_id <> new.merchant_id
         or not v_product.is_active
         or not v_product.is_available
         or v_product.quantity < v_item.required_quantity then
        raise exception 'insufficient_stock_for_confirmation:%', coalesce(v_product.free_name, v_item.product_id::text);
      end if;

      v_remaining := v_product.quantity - v_item.required_quantity;
      update public.products
      set quantity = v_remaining,
          is_available = case when v_remaining <= 0 then false else is_available end,
          price_quantity_updated_at = now(),
          updated_at = now()
      where id = v_product.id;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists a_deduct_confirmed_fulfillment_stock on public.order_merchant_fulfillments;
create trigger a_deduct_confirmed_fulfillment_stock
before update of status on public.order_merchant_fulfillments
for each row execute function private.saarly_deduct_confirmed_fulfillment_stock();

-- Show active products even when their stock is zero so the buyer sees a clear
-- "out of stock" state instead of the item silently disappearing.
drop function if exists public.buyer_storefront_products(uuid, uuid, text);
create function public.buyer_storefront_products(
  p_merchant_id uuid,
  p_category_id uuid default null,
  p_query text default null
)
returns table(
  product_id uuid,
  merchant_id uuid,
  category_id uuid,
  category_ar text,
  category_en text,
  name text,
  price numeric,
  unit text,
  quantity numeric,
  image_url text,
  image_urls text[],
  brand text,
  size text,
  color text,
  updated_at timestamptz,
  is_available boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.merchant_id,
    p.category_id,
    c.name_ar,
    c.name_en,
    p.free_name,
    p.price,
    p.unit,
    p.quantity,
    p.image_url,
    p.image_urls,
    p.brand,
    p.size,
    p.color,
    p.updated_at,
    (p.is_available and p.quantity > 0) as is_available
  from public.products p
  join public.merchants m on m.id = p.merchant_id
  join public.users owner_user on owner_user.id = m.user_id
  left join public.categories c on c.id = p.category_id
  where p.merchant_id = p_merchant_id
    and p.is_active
    and m.approval_status = 'approved'
    and not owner_user.is_blocked
    and m.user_id is distinct from (select auth.uid())
    and not exists (
      select 1
      from public.merchant_staff_members staff
      where staff.merchant_id = m.id
        and staff.user_id = (select auth.uid())
        and staff.is_active
    )
    and (p_category_id is null or p.category_id = p_category_id)
    and (
      nullif(trim(coalesce(p_query, '')), '') is null
      or p.free_name ilike '%' || trim(p_query) || '%'
      or coalesce(p.brand, '') ilike '%' || trim(p_query) || '%'
    )
  order by (p.is_available and p.quantity > 0) desc,
           c.display_order nulls last,
           p.free_name
  limit 200;
$$;

revoke all on function public.buyer_storefront_products(uuid, uuid, text) from public;
grant execute on function public.buyer_storefront_products(uuid, uuid, text) to authenticated;

create or replace function public.submit_rfq_response(
  p_rfq_request_id uuid,
  p_item_responses jsonb,
  p_branch_id uuid
)
returns public.rfq_responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  merchant_uuid uuid := (select public.current_merchant_id());
  request_row public.rfq_requests;
  response_row public.rfq_responses;
  invalid_count integer;
  total_price numeric(14,2);
  priced_count integer;
  expected_count integer;
  response_count integer;
  resolved_branch_id uuid;
begin
  if merchant_uuid is null then raise exception 'merchant_account_required'; end if;
  if p_item_responses is null or jsonb_typeof(p_item_responses) <> 'array' then raise exception 'rfq_item_responses_must_be_array'; end if;

  select * into request_row from public.rfq_requests where id = p_rfq_request_id for update;
  if not found or request_row.status <> 'open' or request_row.expires_at <= now() then raise exception 'rfq_request_not_open'; end if;
  if not exists(select 1 from public.rfq_request_targets t where t.rfq_request_id = p_rfq_request_id and t.merchant_id = merchant_uuid) then raise exception 'rfq_not_targeted_to_current_merchant'; end if;

  resolved_branch_id := private.resolve_rfq_response_branch(p_rfq_request_id, merchant_uuid, p_branch_id);
  select count(*) into expected_count from public.rfq_request_items i where i.rfq_request_id = p_rfq_request_id;
  select count(*) into response_count from jsonb_array_elements(p_item_responses);
  if response_count <> expected_count then raise exception 'all_rfq_items_must_be_answered'; end if;

  select count(*) into invalid_count
  from jsonb_array_elements(p_item_responses) item
  left join public.rfq_request_items ri
    on ri.rfq_request_id = p_rfq_request_id
   and ri.id = private.safe_uuid(item->>'rfq_item_id')
  left join public.products linked_product
    on linked_product.id = private.safe_uuid(item->>'product_id')
  where ri.id is null
     or coalesce(item->>'decision','') not in ('priced','rejected')
     or (
       item->>'decision' = 'priced'
       and (
         nullif(item->>'unit_price','') is null
         or (item->>'unit_price')::numeric < 0
         or nullif(btrim(coalesce(item->>'unit','')), '') is null
         or (
           nullif(item->>'product_id','') is not null
           and (
             linked_product.id is null
             or linked_product.merchant_id <> merchant_uuid
             or not linked_product.is_active
             or not linked_product.is_available
             or linked_product.quantity < ri.quantity_snapshot
           )
         )
       )
     );
  if invalid_count > 0 then raise exception 'invalid_rfq_item_response'; end if;

  select
    coalesce(sum(case when item->>'decision'='priced' then (item->>'unit_price')::numeric * ri.quantity_snapshot else 0 end), 0),
    count(*) filter(where item->>'decision'='priced')
  into total_price, priced_count
  from jsonb_array_elements(p_item_responses) item
  join public.rfq_request_items ri
    on ri.id = private.safe_uuid(item->>'rfq_item_id')
   and ri.rfq_request_id = p_rfq_request_id;

  insert into public.rfq_responses(
    rfq_request_id, merchant_id, branch_id, status, item_responses,
    total_price_snapshot, submitted_at
  ) values (
    p_rfq_request_id, merchant_uuid, resolved_branch_id, 'submitted',
    p_item_responses, total_price, now()
  )
  on conflict(rfq_request_id, merchant_id) do update
  set branch_id = excluded.branch_id,
      status = 'submitted',
      item_responses = excluded.item_responses,
      total_price_snapshot = excluded.total_price_snapshot,
      submitted_at = now(),
      updated_at = now()
  returning * into response_row;

  perform public.enqueue_notification(
    request_row.buyer_id,
    case when priced_count > 0 then 'rfq_response_new' else 'rfq_rejected' end,
    case when priced_count > 0 then 'وصل رد تسعير جديد' else 'اعتذر المتجر عن الطلب' end,
    case when priced_count > 0 then 'New quote response' else 'Store declined the request' end,
    case when priced_count > 0 then 'راجع تفاصيل الأسعار والشحن ثم اختر ما يناسبك.' else 'لا يستطيع المتجر توفير البنود المطلوبة.' end,
    case when priced_count > 0 then 'Review item prices and delivery, then choose what suits you.' else 'The store cannot provide the requested items.' end,
    'saarly://buyer/rfq?request=' || p_rfq_request_id::text || '&response=' || response_row.id::text,
    'rfq-response:' || response_row.id::text,
    jsonb_build_object('rfq_request_id', p_rfq_request_id, 'rfq_response_id', response_row.id, 'branch_id', resolved_branch_id, 'has_prices', priced_count > 0)
  );
  return response_row;
end;
$$;

create or replace function public.accept_rfq_response(
  p_rfq_response_id uuid,
  p_shipping_company_id uuid default null,
  p_shipping_company_name text default null,
  p_total_weight_kg numeric default null,
  p_shipping_cost numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_response public.rfq_responses%rowtype;
  v_request public.rfq_requests%rowtype;
  v_branch public.branches%rowtype;
  v_offer_id uuid;
  v_order_id uuid;
  v_product_total numeric(14,2);
  v_shipping_cost numeric(14,2) := 0;
  v_shipping_name text;
  v_priced_count integer := 0;
  v_total_count integer := 0;
  v_coverage numeric(5,2) := 0;
  v_delivery public.delivery_settings%rowtype;
  v_effective_delivery boolean := false;
  v_free_delivery boolean := false;
  v_delivery_requested boolean := false;
  v_delivery_method public.delivery_pricing_method;
  v_quote public.quote_requests%rowtype;
  v_location jsonb := '{}'::jsonb;
  v_invalid_link_count integer := 0;
begin
  if v_user_id is null then raise exception 'auth_required' using errcode='42501'; end if;
  select * into v_response from public.rfq_responses where id=p_rfq_response_id for update;
  if v_response.id is null then raise exception 'rfq_response_not_found'; end if;
  select * into v_request from public.rfq_requests where id=v_response.rfq_request_id for update;
  if v_request.id is null or v_request.buyer_id<>v_user_id then raise exception 'rfq_response_not_available_for_current_buyer' using errcode='42501'; end if;
  select * into v_quote from public.quote_requests where id=v_request.quote_request_id;
  v_location := coalesce(v_quote.search_scope->'location','{}'::jsonb);

  select orders.id into v_order_id
  from public.offers offer
  join public.orders orders on orders.offer_id=offer.id
  where offer.ranking_reason->>'rfq_response_id'=p_rfq_response_id::text
    and orders.buyer_id=v_user_id
  order by orders.created_at desc limit 1;
  if v_order_id is not null then return v_order_id; end if;

  if v_response.status<>'submitted' or v_request.status<>'open' then raise exception 'rfq_response_not_submitted'; end if;
  if not public.merchant_can_receive_new_work(v_response.merchant_id) then raise exception 'target_merchant_unavailable'; end if;
  if v_response.branch_id is null then
    v_response.branch_id := private.resolve_rfq_response_branch(v_request.id,v_response.merchant_id,null);
    update public.rfq_responses set branch_id=v_response.branch_id where id=v_response.id;
  end if;
  select * into v_branch from public.branches where id=v_response.branch_id and merchant_id=v_response.merchant_id and approval_status='approved';
  if v_branch.id is null then raise exception 'rfq_branch_not_available'; end if;

  select count(*) into v_invalid_link_count
  from jsonb_array_elements(v_response.item_responses) item
  join public.rfq_request_items ri
    on ri.id=private.safe_uuid(item->>'rfq_item_id')
   and ri.rfq_request_id=v_request.id
  left join public.products p on p.id=private.safe_uuid(item->>'product_id')
  where item->>'decision'='priced'
    and nullif(item->>'product_id','') is not null
    and (
      p.id is null
      or p.merchant_id<>v_response.merchant_id
      or not p.is_active
      or not p.is_available
      or p.quantity<ri.quantity_snapshot
    );
  if v_invalid_link_count>0 then raise exception 'rfq_linked_product_stock_changed'; end if;

  select coalesce(sum((item->>'unit_price')::numeric*ri.quantity_snapshot),0),count(*)
  into v_product_total,v_priced_count
  from jsonb_array_elements(v_response.item_responses) item
  join public.rfq_request_items ri
    on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id
  where item->>'decision'='priced'
    and nullif(item->>'unit_price','') is not null
    and(item->>'unit_price')::numeric>=0;
  select count(*) into v_total_count from public.rfq_request_items where rfq_request_id=v_request.id;
  if v_product_total<=0 or v_priced_count<=0 then raise exception 'rfq_response_has_no_priced_items'; end if;

  select * into v_delivery from public.delivery_settings where merchant_id=v_response.merchant_id;
  v_effective_delivery:=coalesce(v_branch.delivery_enabled,v_delivery.is_enabled,false);
  v_free_delivery:=v_effective_delivery and v_branch.free_delivery_enabled and v_branch.free_delivery_minimum is not null and v_product_total>=v_branch.free_delivery_minimum;
  v_delivery_requested:=p_shipping_company_id is not null or coalesce(p_shipping_company_name,'')='__branch_delivery__';

  if p_shipping_company_id is not null then
    if not v_effective_delivery then raise exception 'delivery_not_enabled_for_branch'; end if;
    if p_total_weight_kg is null or p_total_weight_kg<=0 then raise exception 'shipping_weight_required'; end if;
    select c.name,public.calculate_shipping_cost(c.id,p_total_weight_kg) into v_shipping_name,v_shipping_cost
    from public.merchant_shipping_companies c
    where c.id=p_shipping_company_id and c.merchant_id=v_response.merchant_id and c.is_active;
    if v_shipping_name is null then raise exception 'shipping_company_not_available'; end if;
    if v_shipping_cost is null then raise exception 'shipping_weight_not_covered'; end if;
    v_delivery_method:='weight'::public.delivery_pricing_method;
    if v_free_delivery then v_shipping_cost:=0;
    elsif p_shipping_cost is not null and abs(p_shipping_cost-v_shipping_cost)>0.01 then raise exception 'shipping_cost_mismatch'; end if;
  elsif coalesce(p_shipping_company_name,'')='__branch_delivery__' then
    if not v_effective_delivery then raise exception 'delivery_not_enabled_for_branch'; end if;
    v_delivery_method:=case when v_branch.delivery_pricing_method in('zone','weight','flat') then v_branch.delivery_pricing_method::public.delivery_pricing_method else v_delivery.pricing_method end;
    if v_delivery_method='weight'::public.delivery_pricing_method and (p_total_weight_kg is null or p_total_weight_kg<=0) then raise exception 'shipping_weight_required'; end if;
    v_shipping_cost:=private.delivery_cost_from_table(v_delivery.pricing_table,v_delivery_method,p_total_weight_kg,v_location);
    if v_free_delivery then v_shipping_cost:=0;
    elsif v_shipping_cost is null then raise exception 'delivery_price_not_available';
    elsif p_shipping_cost is not null and abs(p_shipping_cost-v_shipping_cost)>0.01 then raise exception 'shipping_cost_mismatch'; end if;
    v_shipping_name:=null;
  elsif coalesce(p_shipping_cost,0)<>0 then
    raise exception 'shipping_company_required';
  end if;

  if v_total_count>0 then v_coverage:=round((v_priced_count::numeric*100)/v_total_count,2); end if;
  insert into public.offers(quote_request_id,merchant_id,kind,status,total_price_snapshot,ranking,coverage_percentage,ranking_reason,expires_at)
  values(v_request.quote_request_id,v_response.merchant_id,'single_merchant','active',v_product_total+coalesce(v_shipping_cost,0),1,v_coverage,
    jsonb_build_object('source','rfq_response','rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'branch_id',v_branch.id,'products_total',v_product_total,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'shipping_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when v_delivery_requested then 'delivery' else 'pickup' end,'delivery_method',v_delivery_method,'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum),now()+interval '24 hours')
  returning id into v_offer_id;

  insert into public.offer_items(
    offer_id,quote_item_id,merchant_id,product_id,matched_name_snapshot,
    requested_quantity_snapshot,unit_snapshot,unit_price_snapshot,
    line_total_snapshot,match_confidence,is_available
  )
  select
    v_offer_id,
    ri.quote_item_id,
    v_response.merchant_id,
    private.safe_uuid(item->>'product_id'),
    coalesce(nullif(item->>'matched_name',''), linked_product.free_name, ri.requested_name_snapshot),
    ri.quantity_snapshot,
    coalesce(nullif(item->>'unit',''), linked_product.unit, ri.unit_snapshot),
    (item->>'unit_price')::numeric,
    (item->>'unit_price')::numeric*ri.quantity_snapshot,
    1,
    true
  from jsonb_array_elements(v_response.item_responses) item
  join public.rfq_request_items ri
    on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id
  left join public.products linked_product
    on linked_product.id=private.safe_uuid(item->>'product_id')
  where item->>'decision'='priced'
    and nullif(item->>'unit_price','') is not null
    and(item->>'unit_price')::numeric>=0;

  v_order_id:=public.accept_offer(v_offer_id);
  update public.orders
  set accepted_offer_snapshot=accepted_offer_snapshot||jsonb_build_object('rfq_shipping',jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'company_id',p_shipping_company_id,'company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when v_delivery_requested then 'delivery' else 'pickup' end,'delivery_method',v_delivery_method,'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum)),updated_at=now()
  where id=v_order_id;
  update public.order_merchant_fulfillments
  set branch_id=v_branch.id,
      delivery_available_snapshot=v_delivery_requested,
      delivery_pricing_method_snapshot=case when v_delivery_requested then v_delivery_method else null end,
      delivery_pricing_table_snapshot=jsonb_build_object('source',case when not v_delivery_requested then 'store_pickup' when p_shipping_company_id is not null then 'merchant_shipping_company' else 'branch_delivery' end,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'delivery_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum),
      updated_at=now()
  where order_id=v_order_id and merchant_id=v_response.merchant_id;
  update public.rfq_responses
  set selected_shipping_company_id=p_shipping_company_id,
      selected_shipping_company_name=v_shipping_name,
      total_weight_kg=p_total_weight_kg,
      shipping_cost=coalesce(v_shipping_cost,0),
      status='accepted',updated_at=now()
  where id=v_response.id;
  update public.rfq_responses set status='withdrawn',updated_at=now()
  where rfq_request_id=v_request.id and id<>v_response.id and status in('draft','submitted');
  update public.rfq_requests set status='closed',updated_at=now() where id=v_request.id;
  insert into public.notifications(user_id,type,title_ar,title_en,body_ar,body_en,deep_link,dedupe_key,payload)
  select m.user_id,'rfq_accepted','تم قبول عرضك السعري','Your quote was accepted','قام المشتري بالموافقة على عرضك.','A buyer accepted your quote.','saarly://merchant/orders?id='||v_order_id::text,'rfq-response-accepted:'||v_response.id::text,jsonb_build_object('rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'order_id',v_order_id,'branch_id',v_branch.id)
  from public.merchants m where m.id=v_response.merchant_id
  on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  return v_order_id;
end;
$$;

revoke all on function public.submit_rfq_response(uuid, jsonb, uuid) from public;
grant execute on function public.submit_rfq_response(uuid, jsonb, uuid) to authenticated;
revoke all on function public.accept_rfq_response(uuid, uuid, text, numeric, numeric) from public;
grant execute on function public.accept_rfq_response(uuid, uuid, text, numeric, numeric) to authenticated;
