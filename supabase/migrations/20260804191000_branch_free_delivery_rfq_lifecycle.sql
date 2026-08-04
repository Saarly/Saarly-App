-- Saarly: branch-level free delivery, explicit RFQ branch, final direct rejection,
-- and server-authoritative quote totals.

alter table public.branches
  add column if not exists free_delivery_enabled boolean not null default false,
  add column if not exists free_delivery_minimum numeric(14,2);

alter table public.branches drop constraint if exists branches_free_delivery_minimum_check;
alter table public.branches add constraint branches_free_delivery_minimum_check
check (
  (not free_delivery_enabled and (free_delivery_minimum is null or free_delivery_minimum >= 0))
  or (free_delivery_enabled and free_delivery_minimum is not null and free_delivery_minimum > 0)
);

alter table public.rfq_responses
  add column if not exists branch_id uuid references public.branches(id) on delete set null;
create index if not exists rfq_responses_branch_id_idx on public.rfq_responses(branch_id);

create or replace function public.set_my_branch_free_delivery(
  p_branch_id uuid,
  p_enabled boolean,
  p_minimum numeric default null
)
returns public.branches
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_branch public.branches;
begin
  if v_user_id is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if coalesce(p_enabled,false) and (p_minimum is null or p_minimum<=0) then
    raise exception 'free_delivery_minimum_required';
  end if;
  update public.branches b
  set free_delivery_enabled=coalesce(p_enabled,false),
      free_delivery_minimum=case when coalesce(p_enabled,false) then round(p_minimum,2) else null end,
      updated_at=now()
  where b.id=p_branch_id
    and exists(select 1 from public.merchants m where m.id=b.merchant_id and m.user_id=v_user_id)
  returning * into v_branch;
  if v_branch.id is null then raise exception 'branch_not_found_or_not_owned' using errcode='42501'; end if;
  return v_branch;
end;$function$;
revoke all on function public.set_my_branch_free_delivery(uuid,boolean,numeric) from public;
grant execute on function public.set_my_branch_free_delivery(uuid,boolean,numeric) to authenticated;

create or replace function private.resolve_rfq_response_branch(
  p_rfq_request_id uuid,
  p_merchant_id uuid,
  p_requested_branch_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_branch_id uuid;
begin
  if p_requested_branch_id is not null then
    select b.id into v_branch_id from public.branches b
    where b.id=p_requested_branch_id and b.merchant_id=p_merchant_id and b.approval_status='approved'
    limit 1;
    if v_branch_id is null then raise exception 'rfq_branch_not_available'; end if;
    return v_branch_id;
  end if;

  select q.target_branch_id into v_branch_id
  from public.rfq_requests r join public.quote_requests q on q.id=r.quote_request_id
  join public.branches b on b.id=q.target_branch_id and b.merchant_id=p_merchant_id and b.approval_status='approved'
  where r.id=p_rfq_request_id limit 1;
  if v_branch_id is not null then return v_branch_id; end if;

  select b.id into v_branch_id from public.branches b
  where b.merchant_id=p_merchant_id and b.approval_status='approved'
  order by b.is_primary desc,b.created_at asc limit 1;
  if v_branch_id is null then raise exception 'approved_merchant_branch_required'; end if;
  return v_branch_id;
end;$function$;

create or replace function public.submit_rfq_response(
  p_rfq_request_id uuid,
  p_item_responses jsonb,
  p_branch_id uuid
)
returns public.rfq_responses
language plpgsql
security definer
set search_path=''
as $function$
declare
  merchant_uuid uuid:=(select public.current_merchant_id());
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
  if p_item_responses is null or jsonb_typeof(p_item_responses)<>'array' then raise exception 'rfq_item_responses_must_be_array'; end if;
  select * into request_row from public.rfq_requests where id=p_rfq_request_id for update;
  if not found or request_row.status<>'open' or request_row.expires_at<=now() then raise exception 'rfq_request_not_open'; end if;
  if not exists(select 1 from public.rfq_request_targets t where t.rfq_request_id=p_rfq_request_id and t.merchant_id=merchant_uuid) then raise exception 'rfq_not_targeted_to_current_merchant'; end if;

  resolved_branch_id:=private.resolve_rfq_response_branch(p_rfq_request_id,merchant_uuid,p_branch_id);

  select count(*) into expected_count from public.rfq_request_items i where i.rfq_request_id=p_rfq_request_id;
  select count(*) into response_count from jsonb_array_elements(p_item_responses);
  if response_count<>expected_count then raise exception 'all_rfq_items_must_be_answered'; end if;

  select count(*) into invalid_count
  from jsonb_array_elements(p_item_responses) item
  left join public.rfq_request_items request_item
    on request_item.rfq_request_id=p_rfq_request_id and request_item.id=private.safe_uuid(item->>'rfq_item_id')
  where request_item.id is null
     or coalesce(item->>'decision','') not in('priced','rejected')
     or (item->>'decision'='priced' and (
       nullif(item->>'unit_price','') is null or (item->>'unit_price')::numeric<0
       or nullif(btrim(coalesce(item->>'unit','')),'') is null));
  if invalid_count>0 then raise exception 'invalid_rfq_item_response'; end if;

  select coalesce(sum(case when item->>'decision'='priced' then (item->>'unit_price')::numeric*ri.quantity_snapshot else 0 end),0),
         count(*) filter(where item->>'decision'='priced')
  into total_price,priced_count
  from jsonb_array_elements(p_item_responses) item
  join public.rfq_request_items ri on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=p_rfq_request_id;

  insert into public.rfq_responses(rfq_request_id,merchant_id,branch_id,status,item_responses,total_price_snapshot,submitted_at)
  values(p_rfq_request_id,merchant_uuid,resolved_branch_id,'submitted',p_item_responses,total_price,now())
  on conflict(rfq_request_id,merchant_id) do update set
    branch_id=excluded.branch_id,status='submitted',item_responses=excluded.item_responses,
    total_price_snapshot=excluded.total_price_snapshot,submitted_at=now(),updated_at=now()
  returning * into response_row;

  perform public.enqueue_notification(
    request_row.buyer_id,
    case when priced_count>0 then 'rfq_response_new' else 'rfq_rejected' end,
    case when priced_count>0 then 'وصل رد تسعير جديد' else 'اعتذر المتجر عن الطلب' end,
    case when priced_count>0 then 'New quote response' else 'Store declined the request' end,
    case when priced_count>0 then 'راجع تفاصيل الأسعار والشحن ثم اختر ما يناسبك.' else 'لا يستطيع المتجر توفير البنود المطلوبة.' end,
    case when priced_count>0 then 'Review item prices and delivery, then choose what suits you.' else 'The store cannot provide the requested items.' end,
    'saarly://buyer/rfq?request='||p_rfq_request_id::text||'&response='||response_row.id::text,
    'rfq-response:'||response_row.id::text,
    jsonb_build_object('rfq_request_id',p_rfq_request_id,'rfq_response_id',response_row.id,'branch_id',resolved_branch_id,'has_prices',priced_count>0)
  );
  return response_row;
end;$function$;

create or replace function public.submit_rfq_response(p_rfq_request_id uuid,p_item_responses jsonb)
returns public.rfq_responses
language sql
security definer
set search_path=''
as $function$
  select public.submit_rfq_response(p_rfq_request_id,p_item_responses,null::uuid);
$function$;
revoke all on function public.submit_rfq_response(uuid,jsonb,uuid) from public;
revoke all on function public.submit_rfq_response(uuid,jsonb) from public;
grant execute on function public.submit_rfq_response(uuid,jsonb,uuid) to authenticated;
grant execute on function public.submit_rfq_response(uuid,jsonb) to authenticated;

create or replace function public.reject_rfq_response(p_rfq_response_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_response public.rfq_responses%rowtype;
  v_request public.rfq_requests%rowtype;
  v_is_direct boolean:=false;
begin
  if v_user_id is null then raise exception 'auth_required' using errcode='42501'; end if;
  select * into v_response from public.rfq_responses where id=p_rfq_response_id for update;
  if v_response.id is null then raise exception 'rfq_response_not_found'; end if;
  select * into v_request from public.rfq_requests where id=v_response.rfq_request_id for update;
  if v_request.id is null or v_request.buyer_id<>v_user_id then raise exception 'rfq_response_not_available_for_current_buyer' using errcode='42501'; end if;
  if v_response.status='rejected' then return true; end if;
  if v_response.status<>'submitted' then raise exception 'rfq_response_not_submitted'; end if;
  v_is_direct:=v_request.delivery_type='direct'::public.quote_request_delivery_type;

  update public.rfq_responses set status='rejected',updated_at=now() where id=v_response.id;
  if v_is_direct then
    update public.rfq_requests set status='closed',updated_at=now() where id=v_request.id;
    update public.rfq_responses set status='withdrawn',updated_at=now()
      where rfq_request_id=v_request.id and id<>v_response.id and status in('draft','submitted');
  end if;

  insert into public.notifications(user_id,type,title_ar,title_en,body_ar,body_en,deep_link,dedupe_key,payload)
  select recipient.user_id,'rfq_response_rejected','رفض العميل العرض السعري','Customer rejected the quote',
    case when v_is_direct then 'رفض العميل العرض وانتهى هذا الطلب المخصوص.' else 'رفض العميل هذا العرض السعري.' end,
    case when v_is_direct then 'The customer rejected the quote and this direct request is finished.' else 'The customer rejected this quote.' end,
    'saarly://merchant/rfq?request='||v_request.id::text,
    'rfq-response-rejected:'||v_response.id::text||':'||recipient.user_id::text,
    jsonb_build_object('rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'merchant_id',v_response.merchant_id,'request_finished',v_is_direct)
  from(
    select m.user_id from public.merchants m where m.id=v_response.merchant_id
    union select s.user_id from public.merchant_staff_members s where s.merchant_id=v_response.merchant_id and s.is_active and coalesce((s.permissions->>'rfqs')::boolean,false)
  ) recipient
  on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
  return true;
end;$function$;

create or replace function private.prevent_reopening_rejected_direct_quote()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if new.delivery_type='direct'::public.quote_request_delivery_type and exists(
    select 1 from public.rfq_requests old_request
    join public.rfq_responses old_response on old_response.rfq_request_id=old_request.id
    where old_request.quote_request_id=new.quote_request_id
      and old_response.status='rejected'::public.rfq_response_status
  ) then raise exception 'direct_request_finished_create_new_request'; end if;
  return new;
end;$function$;
drop trigger if exists trg_prevent_reopening_rejected_direct_quote on public.rfq_requests;
create trigger trg_prevent_reopening_rejected_direct_quote before insert on public.rfq_requests
for each row execute function private.prevent_reopening_rejected_direct_quote();

create or replace function public.get_rfq_response_shipping_options(p_rfq_response_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_response public.rfq_responses%rowtype;
  v_request public.rfq_requests%rowtype;
  v_branch public.branches%rowtype;
  v_delivery public.delivery_settings%rowtype;
  v_companies jsonb:='[]'::jsonb;
  v_effective_enabled boolean:=false;
  v_free_eligible boolean:=false;
begin
  select rr.* into v_response from public.rfq_responses rr join public.rfq_requests req on req.id=rr.rfq_request_id where rr.id=p_rfq_response_id and req.buyer_id=auth.uid();
  if v_response.id is null then return jsonb_build_object('companies','[]'::jsonb); end if;
  select * into v_request from public.rfq_requests where id=v_response.rfq_request_id;
  if v_response.branch_id is null then v_response.branch_id:=private.resolve_rfq_response_branch(v_request.id,v_response.merchant_id,null); end if;
  select * into v_branch from public.branches where id=v_response.branch_id;
  select * into v_delivery from public.delivery_settings where merchant_id=v_response.merchant_id;
  v_effective_enabled:=coalesce(v_branch.delivery_enabled,v_delivery.is_enabled,false);
  v_free_eligible:=v_effective_enabled and v_branch.free_delivery_enabled and v_branch.free_delivery_minimum is not null and coalesce(v_response.total_price_snapshot,0)>=v_branch.free_delivery_minimum;
  if v_effective_enabled and private.delivery_method_enabled(v_delivery.pricing_table,'weight'::public.delivery_pricing_method,v_delivery.pricing_method='weight') then
    v_companies:=coalesce(public.get_merchant_shipping_options(v_response.merchant_id)->'companies','[]'::jsonb);
  end if;
  return jsonb_build_object(
    'companies',v_companies,'branch_id',v_branch.id,'branch_name',v_branch.name,
    'delivery_enabled',v_effective_enabled,'products_subtotal',coalesce(v_response.total_price_snapshot,0),
    'free_delivery_enabled',v_branch.free_delivery_enabled,'free_delivery_minimum',v_branch.free_delivery_minimum,
    'free_delivery_eligible',v_free_eligible,'pickup_available',true
  );
end;$function$;

create or replace function public.accept_rfq_response(
 p_rfq_response_id uuid,p_shipping_company_id uuid default null,p_shipping_company_name text default null,
 p_total_weight_kg numeric default null,p_shipping_cost numeric default null)
returns uuid language plpgsql security definer set search_path='' as $function$
declare
  v_user_id uuid:=auth.uid(); v_response public.rfq_responses%rowtype; v_request public.rfq_requests%rowtype; v_branch public.branches%rowtype;
  v_offer_id uuid; v_order_id uuid; v_product_total numeric(14,2); v_shipping_cost numeric(14,2):=0; v_shipping_name text;
  v_priced_count integer:=0; v_total_count integer:=0; v_coverage numeric(5,2):=0; v_delivery public.delivery_settings%rowtype;
  v_effective_delivery boolean:=false; v_free_delivery boolean:=false;
begin
 if v_user_id is null then raise exception 'auth_required' using errcode='42501'; end if;
 select * into v_response from public.rfq_responses where id=p_rfq_response_id for update; if v_response.id is null then raise exception 'rfq_response_not_found'; end if;
 select * into v_request from public.rfq_requests where id=v_response.rfq_request_id for update; if v_request.id is null or v_request.buyer_id<>v_user_id then raise exception 'rfq_response_not_available_for_current_buyer' using errcode='42501'; end if;
 select orders.id into v_order_id from public.offers offer join public.orders orders on orders.offer_id=offer.id where offer.ranking_reason->>'rfq_response_id'=p_rfq_response_id::text and orders.buyer_id=v_user_id order by orders.created_at desc limit 1; if v_order_id is not null then return v_order_id; end if;
 if v_response.status<>'submitted' or v_request.status<>'open' then raise exception 'rfq_response_not_submitted'; end if;
 if not public.merchant_can_receive_new_work(v_response.merchant_id) then raise exception 'target_merchant_unavailable'; end if;
 if v_response.branch_id is null then v_response.branch_id:=private.resolve_rfq_response_branch(v_request.id,v_response.merchant_id,null); update public.rfq_responses set branch_id=v_response.branch_id where id=v_response.id; end if;
 select * into v_branch from public.branches where id=v_response.branch_id and merchant_id=v_response.merchant_id and approval_status='approved'; if v_branch.id is null then raise exception 'rfq_branch_not_available'; end if;
 select coalesce(sum((item->>'unit_price')::numeric*ri.quantity_snapshot),0),count(*) into v_product_total,v_priced_count from jsonb_array_elements(v_response.item_responses) item join public.rfq_request_items ri on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id where item->>'decision'='priced' and nullif(item->>'unit_price','') is not null and(item->>'unit_price')::numeric>=0;
 select count(*) into v_total_count from public.rfq_request_items where rfq_request_id=v_request.id; if v_product_total<=0 or v_priced_count<=0 then raise exception 'rfq_response_has_no_priced_items'; end if;
 select * into v_delivery from public.delivery_settings where merchant_id=v_response.merchant_id; v_effective_delivery:=coalesce(v_branch.delivery_enabled,v_delivery.is_enabled,false); v_free_delivery:=v_effective_delivery and v_branch.free_delivery_enabled and v_branch.free_delivery_minimum is not null and v_product_total>=v_branch.free_delivery_minimum;
 if p_shipping_company_id is not null then
   if not v_effective_delivery then raise exception 'delivery_not_enabled_for_branch'; end if;
   if p_total_weight_kg is null or p_total_weight_kg<=0 then raise exception 'shipping_weight_required'; end if;
   select c.name,public.calculate_shipping_cost(c.id,p_total_weight_kg) into v_shipping_name,v_shipping_cost from public.merchant_shipping_companies c where c.id=p_shipping_company_id and c.merchant_id=v_response.merchant_id and c.is_active;
   if v_shipping_name is null then raise exception 'shipping_company_not_available'; end if; if v_shipping_cost is null then raise exception 'shipping_weight_not_covered'; end if;
   if v_free_delivery then v_shipping_cost:=0; elsif p_shipping_cost is not null and abs(p_shipping_cost-v_shipping_cost)>0.01 then raise exception 'shipping_cost_mismatch'; end if;
 elsif coalesce(p_shipping_cost,0)<>0 then raise exception 'shipping_company_required';
 end if;
 if v_total_count>0 then v_coverage:=round((v_priced_count::numeric*100)/v_total_count,2); end if;
 insert into public.offers(quote_request_id,merchant_id,kind,status,total_price_snapshot,ranking,coverage_percentage,ranking_reason,expires_at)
 values(v_request.quote_request_id,v_response.merchant_id,'single_merchant','active',v_product_total+coalesce(v_shipping_cost,0),1,v_coverage,
 jsonb_build_object('source','rfq_response','rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'branch_id',v_branch.id,'products_total',v_product_total,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'shipping_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when p_shipping_company_id is null then 'pickup' else 'delivery' end,'free_delivery_applied',v_free_delivery and p_shipping_company_id is not null,'free_delivery_minimum',v_branch.free_delivery_minimum),now()+interval '24 hours') returning id into v_offer_id;
 insert into public.offer_items(offer_id,quote_item_id,merchant_id,product_id,matched_name_snapshot,requested_quantity_snapshot,unit_snapshot,unit_price_snapshot,line_total_snapshot,match_confidence,is_available)
 select v_offer_id,ri.quote_item_id,v_response.merchant_id,null,coalesce(nullif(item->>'matched_name',''),ri.requested_name_snapshot),ri.quantity_snapshot,coalesce(nullif(item->>'unit',''),ri.unit_snapshot),(item->>'unit_price')::numeric,(item->>'unit_price')::numeric*ri.quantity_snapshot,1,true from jsonb_array_elements(v_response.item_responses) item join public.rfq_request_items ri on ri.id=private.safe_uuid(item->>'rfq_item_id') and ri.rfq_request_id=v_request.id where item->>'decision'='priced' and nullif(item->>'unit_price','') is not null and(item->>'unit_price')::numeric>=0;
 v_order_id:=public.accept_offer(v_offer_id);
 update public.orders set accepted_offer_snapshot=accepted_offer_snapshot||jsonb_build_object('rfq_shipping',jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'company_id',p_shipping_company_id,'company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'shipping_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'delivery_mode',case when p_shipping_company_id is null then 'pickup' else 'delivery' end,'free_delivery_applied',v_free_delivery and p_shipping_company_id is not null,'free_delivery_minimum',v_branch.free_delivery_minimum)),updated_at=now() where id=v_order_id;
 update public.order_merchant_fulfillments set branch_id=v_branch.id,delivery_available_snapshot=p_shipping_company_id is not null,delivery_pricing_method_snapshot=case when p_shipping_company_id is not null then 'weight'::public.delivery_pricing_method else null end,delivery_pricing_table_snapshot=jsonb_build_object('source',case when p_shipping_company_id is null then 'store_pickup' else 'merchant_shipping_company' end,'shipping_company_id',p_shipping_company_id,'shipping_company_name',v_shipping_name,'total_weight_kg',p_total_weight_kg,'delivery_cost',coalesce(v_shipping_cost,0),'products_total',v_product_total,'grand_total',v_product_total+coalesce(v_shipping_cost,0),'free_delivery_applied',v_free_delivery and p_shipping_company_id is not null,'free_delivery_minimum',v_branch.free_delivery_minimum),updated_at=now() where order_id=v_order_id and merchant_id=v_response.merchant_id;
 update public.rfq_responses set selected_shipping_company_id=p_shipping_company_id,selected_shipping_company_name=v_shipping_name,total_weight_kg=p_total_weight_kg,shipping_cost=coalesce(v_shipping_cost,0),status='accepted',updated_at=now() where id=v_response.id;
 update public.rfq_responses set status='withdrawn',updated_at=now() where rfq_request_id=v_request.id and id<>v_response.id and status in('draft','submitted'); update public.rfq_requests set status='closed',updated_at=now() where id=v_request.id;
 insert into public.notifications(user_id,type,title_ar,title_en,body_ar,body_en,deep_link,dedupe_key,payload) select m.user_id,'rfq_accepted','تم قبول عرضك السعري','Your quote was accepted','قام المشتري بالموافقة على عرضك.','A buyer accepted your quote.','saarly://merchant/orders?id='||v_order_id::text,'rfq-response-accepted:'||v_response.id::text,jsonb_build_object('rfq_request_id',v_request.id,'rfq_response_id',v_response.id,'order_id',v_order_id,'branch_id',v_branch.id) from public.merchants m where m.id=v_response.merchant_id on conflict(user_id,dedupe_key) where dedupe_key is not null do nothing;
 return v_order_id;
end;$function$;

create or replace function public.accept_rfq_response(p_rfq_response_id uuid)
returns uuid language sql security definer set search_path='' as $function$
 select public.accept_rfq_response(p_rfq_response_id,null::uuid,null::text,null::numeric,null::numeric);
$function$;

create or replace function private.apply_branch_delivery_snapshot()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_quote public.quote_requests%rowtype; v_branch public.branches%rowtype; v_free boolean:=false; v_cost numeric; v_snapshot jsonb;
begin
 select q.* into v_quote from public.orders o join public.offers offer on offer.id=o.offer_id join public.quote_requests q on q.id=offer.quote_request_id where o.id=new.order_id;
 if new.branch_id is null then
   select b.* into v_branch from public.branches b where b.merchant_id=new.merchant_id and b.approval_status='approved' order by (b.id=v_quote.target_branch_id) desc,b.is_primary desc,b.created_at asc limit 1;
   new.branch_id:=v_branch.id;
 else select * into v_branch from public.branches where id=new.branch_id; end if;
 if v_branch.id is null then return new; end if;
 v_free:=new.delivery_available_snapshot and v_branch.free_delivery_enabled and v_branch.free_delivery_minimum is not null and new.subtotal_snapshot>=v_branch.free_delivery_minimum;
 v_snapshot:=coalesce(new.delivery_pricing_table_snapshot,'{}'::jsonb);
 v_cost:=coalesce((v_snapshot->>'delivery_cost')::numeric,0);
 if v_free then v_cost:=0; end if;
 new.delivery_pricing_table_snapshot:=v_snapshot||jsonb_build_object('branch_id',v_branch.id,'branch_name',v_branch.name,'products_total',new.subtotal_snapshot,'delivery_cost',v_cost,'grand_total',new.subtotal_snapshot+v_cost,'free_delivery_applied',v_free,'free_delivery_minimum',v_branch.free_delivery_minimum);
 return new;
end;$function$;
drop trigger if exists trg_apply_branch_delivery_snapshot on public.order_merchant_fulfillments;
create trigger trg_apply_branch_delivery_snapshot before insert or update of subtotal_snapshot,delivery_available_snapshot,delivery_pricing_table_snapshot,branch_id on public.order_merchant_fulfillments for each row execute function private.apply_branch_delivery_snapshot();

drop view if exists public.buyer_rfq_response_results;
create view public.buyer_rfq_response_results with(security_invoker=false) as
select rr.id,rr.rfq_request_id,r.quote_request_id,rr.status,rr.item_responses,rr.total_price_snapshot,rr.submitted_at,
 case when r.delivery_type='direct' then coalesce(m.store_name,'المتجر المحدد') else 'متجر '||dense_rank() over(partition by rr.rfq_request_id order by rr.total_price_snapshot,rr.submitted_at,rr.id)::text end as anonymous_store_label_ar,
 case when r.delivery_type='direct' then coalesce(m.store_name,'Selected store') else 'Store '||dense_rank() over(partition by rr.rfq_request_id order by rr.total_price_snapshot,rr.submitted_at,rr.id)::text end as anonymous_store_label_en,
 jsonb_build_object('rfq_request_id',rr.rfq_request_id,'rfq_response_id',rr.id,'delivery_type',r.delivery_type,'branch_id',rr.branch_id) as client_payload,
 rr.branch_id,b.name as branch_name,r.delivery_type::text as delivery_type,rr.selected_shipping_company_name,coalesce(rr.shipping_cost,0) as shipping_cost,
 coalesce(rr.total_price_snapshot,0)+coalesce(rr.shipping_cost,0) as grand_total,
 case when rr.selected_shipping_company_id is null then 'pickup' else 'delivery' end as delivery_mode,
 b.free_delivery_enabled,b.free_delivery_minimum,
 (rr.selected_shipping_company_id is not null and coalesce(rr.shipping_cost,0)=0 and b.free_delivery_enabled and coalesce(rr.total_price_snapshot,0)>=coalesce(b.free_delivery_minimum,1e18)) as free_delivery_applied,
 coalesce((select jsonb_agg(jsonb_build_object('rfq_item_id',ri.id,'quote_item_id',ri.quote_item_id,'requested_name',ri.requested_name_snapshot,'quantity',ri.quantity_snapshot,'unit',ri.unit_snapshot,'decision',coalesce(x.item->>'decision','rejected'),'unit_price',nullif(x.item->>'unit_price','')::numeric,'line_total',case when x.item->>'decision'='priced' then nullif(x.item->>'unit_price','')::numeric*ri.quantity_snapshot else 0 end,'matched_name',nullif(x.item->>'matched_name',''),'note',nullif(x.item->>'note',''),'expected_duration',nullif(x.item->>'expected_duration','')) order by ri.created_at) from public.rfq_request_items ri left join lateral(select item from jsonb_array_elements(rr.item_responses) item where private.safe_uuid(item->>'rfq_item_id')=ri.id limit 1)x on true where ri.rfq_request_id=rr.rfq_request_id),'[]'::jsonb) as detailed_item_responses
from public.rfq_responses rr join public.rfq_requests r on r.id=rr.rfq_request_id left join public.merchants m on m.id=rr.merchant_id left join public.branches b on b.id=rr.branch_id
where r.buyer_id=auth.uid() and rr.status='submitted';
grant select on public.buyer_rfq_response_results to authenticated;
