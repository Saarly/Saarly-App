create or replace function public.get_rfq_response_delivery_quote(
  p_rfq_response_id uuid,
  p_total_weight_kg numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_response public.rfq_responses%rowtype;
  v_request public.rfq_requests%rowtype;
  v_quote public.quote_requests%rowtype;
  v_branch public.branches%rowtype;
  v_delivery public.delivery_settings%rowtype;
  v_method public.delivery_pricing_method;
  v_cost numeric;
  v_companies jsonb := '[]'::jsonb;
  v_effective_enabled boolean := false;
  v_free_eligible boolean := false;
begin
  select rr.* into v_response
  from public.rfq_responses rr
  join public.rfq_requests req on req.id = rr.rfq_request_id
  where rr.id = p_rfq_response_id and req.buyer_id = auth.uid();

  if v_response.id is null then
    raise exception 'rfq_response_not_available_for_current_buyer' using errcode = '42501';
  end if;

  select * into v_request from public.rfq_requests where id = v_response.rfq_request_id;
  select * into v_quote from public.quote_requests where id = v_request.quote_request_id;
  if v_response.branch_id is null then
    v_response.branch_id := private.resolve_rfq_response_branch(v_request.id, v_response.merchant_id, null);
  end if;
  select * into v_branch from public.branches where id = v_response.branch_id;
  select * into v_delivery from public.delivery_settings where merchant_id = v_response.merchant_id;

  v_effective_enabled := coalesce(v_branch.delivery_enabled, v_delivery.is_enabled, false);
  v_method := case
    when v_branch.delivery_pricing_method in ('zone', 'weight', 'flat')
      then v_branch.delivery_pricing_method::public.delivery_pricing_method
    else v_delivery.pricing_method
  end;
  v_free_eligible := v_effective_enabled
    and v_branch.free_delivery_enabled
    and v_branch.free_delivery_minimum is not null
    and coalesce(v_response.total_price_snapshot, 0) >= v_branch.free_delivery_minimum;

  if v_effective_enabled then
    if v_free_eligible then
      v_cost := 0;
    else
      v_cost := private.delivery_cost_from_table(
        v_delivery.pricing_table,
        v_method,
        p_total_weight_kg,
        coalesce(v_quote.search_scope->'location', '{}'::jsonb)
      );
    end if;
    if v_method = 'weight'::public.delivery_pricing_method then
      v_companies := coalesce(public.get_merchant_shipping_options(v_response.merchant_id)->'companies', '[]'::jsonb);
    end if;
  end if;

  return jsonb_build_object(
    'branch_id', v_branch.id,
    'branch_name', v_branch.name,
    'delivery_enabled', v_effective_enabled,
    'delivery_method', v_method::text,
    'requires_weight', v_effective_enabled and v_method = 'weight'::public.delivery_pricing_method,
    'delivery_cost', v_cost,
    'companies', v_companies,
    'products_subtotal', coalesce(v_response.total_price_snapshot, 0),
    'free_delivery_enabled', v_branch.free_delivery_enabled,
    'free_delivery_minimum', v_branch.free_delivery_minimum,
    'free_delivery_eligible', v_free_eligible,
    'pickup_available', true
  );
end;
$function$;

revoke all on function public.get_rfq_response_delivery_quote(uuid,numeric) from public;
grant execute on function public.get_rfq_response_delivery_quote(uuid,numeric) to authenticated;
create or replace function public.accept_rfq_response(
 p_rfq_response_id uuid,p_shipping_company_id uuid default null,p_shipping_company_name text default null,
 p_total_weight_kg numeric default null,p_shipping_cost numeric default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_user_id uuid:=auth.uid(); v_response public.rfq_responses%rowtype; v_request public.rfq_requests%rowtype; v_branch public.branches%rowtype;
  v_offer_id uuid; v_order_id uuid; v_product_total numeric(14,2); v_shipping_cost numeric(14,2):=0; v_shipping_name text;
  v_priced_count integer:=0; v_total_count integer:=0; v_coverage numeric(5,2):=0; v_delivery public.delivery_settings%rowtype;
  v_effective_delivery boolean:=false; v_free_delivery boolean:=false; v_delivery_requested boolean:=false; v_delivery_method public.delivery_pricing_method; v_quote public.quote_requests%rowtype; v_location jsonb:='{}'::jsonb;
begin
 if v_user_id is null then raise exception 'auth_required' using errcode='42501'; end if;
 select * into v_response from public.rfq_responses where id=p_rfq_response_id for update; if v_response.id is null then raise exception 'rfq_response_not_found'; end if;
 select * into v_request from public.rfq_requests where id=v_response.rfq_request_id for update; if v_request.id is null or v_request.buyer_id<>v_user_id then raise exception 'rfq_response_not_available_for_current_buyer' using errcode='42501'; end if; select * into v_quote from public.quote_requests where id=v_request.quote_request_id; v_location:=coalesce(v_quote.search_scope->'location','{}'::jsonb);
 select orders.id into v_order_id from public.offers offer join public.orders orders on orders.offer_id=offer.id where offer.ranking_reason->>'rfq_response_id'=p_rfq_response_id::text and orders.buyer_id=v_user_id order by orders.created_at desc limit 1; if v_order_id is not null then return v_order_id; end if;
 if v_response.status<>'submitted' or v_request.status<>'open' then raise exception 'rfq_response_not_submitted'; end if;
 if not public.merchant_can_receive_new_work(v_response.merchant_id) then raise exception 'target_merchant_unavailable'; end if;
 if v_response.branch_id is null then v_response.branch_id:=private.resolve_rfq_response_branch(v_request.id,v_response.merchant_id,null); update public.rfq_responses set branch_id=v_response.branch_id where id=v_response.id; end if;
 select * into v_branch from public.branches where id=v_response.branch_id and merchant_id=v_response.merchant_id and approval_status='approved'; if v_branch.id is null then raise exception 'rfq_branch_not_available'; end if;
 select coalesce(sum((item->>'unit_price')::numeric*ri.quantity_snapshot),0),count(*) into v_product_total,v_priced_count from jsonb_array_elements(v_response.item_responses) item join public.rfq_request_items ri on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id where item->>'decision'='priced' and nullif(item->>'unit_price','') is not null and(item->>'unit_price')::numeric>=0;
 select count(*) into v_total_count from public.rfq_request_items where rfq_request_id=v_request.id; if v_product_total<=0 or v_priced_count<=0 then raise exception 'rfq_response_has_no_priced_items'; end if;
 select * into v_delivery from public.delivery_settings where merchant_id=v_response.merchant_id; v_effective_delivery:=coalesce(v_branch.delivery_enabled,v_delivery.is_enabled,false); v_free_delivery:=v_effective_delivery and v_branch.free_delivery_enabled and v_branch.free_delivery_minimum is not null and v_product_total>=v_branch.free_delivery_minimum;
 v_delivery_requested:=p_shipping_company_id is not null or coalesce(p_shipping_company_name,'')='__branch_delivery__';
 if p_shipping_company_id is not null then
   if not v_effective_delivery then raise exception 'delivery_not_enabled_for_branch'; end if;
   if p_total_weight_kg is null or p_total_weight_kg<=0 then raise exception 'shipping_weight_required'; end if;
   select c.name,public.calculate_shipping_cost(c.id,p_total_weight_kg) into v_shipping_name,v_shipping_cost from public.merchant_shipping_companies c where c.id=p_shipping_company_id and c.merchant_id=v_response.merchant_id and c.is_active;
   if v_shipping_name is null then raise exception 'shipping_company_not_available'; end if; if v_shipping_cost is null then raise exception 'shipping_weight_not_covered'; end if;
   v_delivery_method:='weight'::public.delivery_pricing_method;
   if v_free_delivery then v_shipping_cost:=0; elsif p_shipping_cost is not null and abs(p_shipping_cost-v_shipping_cost)>0.01 then raise exception 'shipping_cost_mismatch'; end if;
 elsif coalesce(p_shipping_company_name,'')='__branch_delivery__' then
   if not v_effective_delivery then raise exception 'delivery_not_enabled_for_branch'; end if;
   v_delivery_method:=case when v_branch.delivery_pricing_method in('zone','weight','flat') then v_branch.delivery_pricing_method::public.delivery_pricing_method else v_delivery.pricing_method end;
   if v_delivery_method='weight'::public.delivery_pricing_method and (p_total_weight_kg is null or p_total_weight_kg<=0) then raise exception 'shipping_weight_required'; end if;
   v_shipping_cost:=private.delivery_cost_from_table(v_delivery.pricing_table,v_delivery_method,p_total_weight_kg,v_location);
   if v_free_delivery then v_shipping_cost:=0; elsif v_shipping_cost is null then raise exception 'delivery_price_not_available'; elsif p_shipping_cost is not null and abs(p_shipping_cost-v_shipping_cost)>0.01 then raise exception 'shipping_cost_mismatch'; end if;
   v_shipping_name:=null;
 elsif coalesce(p_shipping_cost,0)<>0 then raise exception 'shipping_company_required';
 end if;
 if v_total_count>0 then v_coverage:=round((v_priced_count::numeric*100)/v_total_count,2); end if;
 insert into public.offers(quote_request_id,merchant_id,kind,status,total_price_snapshot,ranking,coverage_percentage,ranking_reason,expires_at)
 values(v_request.quote_request_id,v_response.merchant_id,'single_merchant','active',v_product_total+coalesce(v_shipping_cost,0),1,v_coverage,
 jsonb_build_object('source','rfq_response','rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'branch_id',v_branch.id,'products_total',v_product_total,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'shipping_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when v_delivery_requested then 'delivery' else 'pickup' end,'delivery_method',v_delivery_method,'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum),now()+interval '24 hours') returning id into v_offer_id;
 insert into public.offer_items(offer_id,quote_item_id,merchant_id,product_id,matched_name_snapshot,requested_quantity_snapshot,unit_snapshot,unit_price_snapshot,line_total_snapshot,match_confidence,is_available)
 select v_offer_id,ri.quote_item_id,v_response.merchant_id,null,coalesce(nullif(item->>'matched_name',''),ri.requested_name_snapshot),ri.quantity_snapshot,coalesce(nullif(item->>'unit',''),ri.unit_snapshot),(item->>'unit_price')::numeric,(item->>'unit_price')::numeric*ri.quantity_snapshot,1,true from jsonb_array_elements(v_response.item_responses) item join public.rfq_request_items ri on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id where item->>'decision'='priced' and nullif(item->>'unit_price','') is not null and(item->>'unit_price')::numeric>=0;
 v_order_id:=public.accept_offer(v_offer_id);
 update public.orders set accepted_offer_snapshot=accepted_offer_snapshot||jsonb_build_object('rfq_shipping',jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'company_id',p_shipping_company_id,'company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when v_delivery_requested then 'delivery' else 'pickup' end,'delivery_method',v_delivery_method,'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum)),updated_at=now() where id=v_order_id;
 update public.order_merchant_fulfillments set branch_id=v_branch.id,delivery_available_snapshot=v_delivery_requested,delivery_pricing_method_snapshot=case when v_delivery_requested then v_delivery_method else null end,delivery_pricing_table_snapshot=jsonb_build_object('source',case when not v_delivery_requested then 'store_pickup' when p_shipping_company_id is not null then 'merchant_shipping_company' else 'branch_delivery' end,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'delivery_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'free_delivery_applied',v_free_delivery and v_delivery_requested,'free_delivery_minimum',v_branch.free_delivery_minimum),updated_at=now() where order_id=v_order_id and merchant_id=v_response.merchant_id;
 update public.rfq_responses set selected_shipping_company_id=p_shipping_company_id,selected_shipping_company_name=v_shipping_name,total_weight_kg=p_total_weight_kg,shipping_cost=coalesce(v_shipping_cost,0),status='accepted',updated_at=now() where id=v_response.id;
 update public.rfq_responses set status='withdrawn',updated_at=now() where rfq_request_id=v_request.id and id<>v_response.id and status in('draft','submitted'); update public.rfq_requests set status='closed',updated_at=now() where id=v_request.id;
 insert into public.notifications(user_id,type,title_ar,title_en,body_ar,body_en,deep_link,dedupe_key,payload) select m.user_id,'rfq_accepted','تم قبول عرضك السعري','Your quote was accepted','قام المشتري بالموافقة على عرضك.','A buyer accepted your quote.','saarly://merchant/orders?id='||v_order_id::text,'rfq-response-accepted:'||v_response.id::text,jsonb_build_object('rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'order_id',v_order_id,'branch_id',v_branch.id) from public.merchants m where m.id=v_response.merchant_id on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
 return v_order_id;
end;$function$;