-- Saarly: keep branch documents, RFQ items/statuses and admin referral views consistent.

create or replace function public.upsert_my_branch_documents(
  p_branch_id uuid,
  p_manager_name text,
  p_branch_front_storage_path text,
  p_manager_front_storage_path text,
  p_manager_back_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_branch public.branches%rowtype;
  v_merchant public.merchants%rowtype;
  v_branch_front_path text;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select * into v_branch
  from public.branches b
  where b.id = p_branch_id
  for update;

  if v_branch.id is null then
    raise exception 'branch_not_found';
  end if;

  select * into v_merchant
  from public.merchants m
  where m.id = v_branch.merchant_id;

  if v_merchant.id is null or v_merchant.user_id <> v_user_id then
    raise exception 'merchant_owner_required' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_manager_name, '')), '') is null
     or nullif(btrim(coalesce(p_branch_front_storage_path, '')), '') is null
     or nullif(btrim(coalesce(p_manager_front_storage_path, '')), '') is null
     or nullif(btrim(coalesce(p_manager_back_storage_path, '')), '') is null then
    raise exception 'missing_branch_documents';
  end if;

  v_branch_front_path := private.normalize_storage_object_path(
    'storefront-photos',
    p_branch_front_storage_path
  );

  perform private.upsert_merchant_document(
    v_merchant.id,
    v_branch.id,
    p_manager_name,
    'branch_front'::public.merchant_document_kind,
    'storefront-photos',
    v_branch_front_path,
    null,
    null,
    jsonb_build_object('source', 'branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant.id,
    v_branch.id,
    p_manager_name,
    'branch_manager_id_front'::public.merchant_document_kind,
    'merchant-ids',
    p_manager_front_storage_path,
    null,
    null,
    jsonb_build_object('source', 'branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant.id,
    v_branch.id,
    p_manager_name,
    'branch_manager_id_back'::public.merchant_document_kind,
    'merchant-ids',
    p_manager_back_storage_path,
    null,
    null,
    jsonb_build_object('source', 'branch_editor')
  );

  update public.branches
  set front_image_url = v_branch_front_path,
      updated_at = now()
  where id = v_branch.id
    and front_image_url is distinct from v_branch_front_path;
end;
$function$;

revoke all on function public.upsert_my_branch_documents(uuid,text,text,text,text) from public;
grant execute on function public.upsert_my_branch_documents(uuid,text,text,text,text) to authenticated;

-- Repair existing branches where the image path exists but the review document row is missing.
do $block$
declare
  v_row record;
  v_path text;
begin
  for v_row in
    select b.id as branch_id, b.merchant_id, b.name, b.front_image_url, m.user_id
    from public.branches b
    join public.merchants m on m.id = b.merchant_id
    where nullif(btrim(coalesce(b.front_image_url, '')), '') is not null
      and not exists (
        select 1
        from public.merchant_documents d
        where d.branch_id = b.id
          and d.kind = 'branch_front'::public.merchant_document_kind
          and d.superseded_by is null
      )
  loop
    v_path := private.normalize_storage_object_path('storefront-photos', v_row.front_image_url);
    if v_path is not null
       and exists (
         select 1 from storage.objects o
         where o.bucket_id = 'storefront-photos' and o.name = v_path
       )
       and private.storage_object_owned_by_user(
         'storefront-photos',
         v_path,
         v_row.user_id
       ) then
      perform private.upsert_merchant_document(
        v_row.merchant_id,
        v_row.branch_id,
        null,
        'branch_front'::public.merchant_document_kind,
        'storefront-photos',
        v_path,
        null,
        null,
        jsonb_build_object('source', 'branch_front_backfill_20260804')
      );
    end if;
  end loop;
end;
$block$;

create or replace function public.sync_my_rfq_items(
  p_rfq_request_id uuid,
  p_quote_item_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request public.rfq_requests%rowtype;
  v_quote public.quote_requests%rowtype;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select * into v_request
  from public.rfq_requests r
  where r.id = p_rfq_request_id
  for update;

  if v_request.id is null or v_request.buyer_id <> v_user_id then
    raise exception 'rfq_request_not_owned' using errcode = '42501';
  end if;
  if v_request.status <> 'open'::public.rfq_status or v_request.expires_at <= now() then
    raise exception 'rfq_request_not_open';
  end if;

  select * into v_quote
  from public.quote_requests q
  where q.id = v_request.quote_request_id;

  if v_quote.id is null or v_quote.buyer_id <> v_user_id then
    raise exception 'quote_not_found_for_current_buyer' using errcode = '42501';
  end if;
  if v_quote.ai_review_status <> 'approved'::public.ai_review_status then
    raise exception 'rfq_requires_approved_quote';
  end if;

  insert into public.rfq_request_items (
    rfq_request_id,
    quote_item_id,
    requested_name_snapshot,
    quantity_snapshot,
    unit_snapshot,
    category_id,
    reason,
    specifications_snapshot
  )
  select
    v_request.id,
    qi.id,
    qi.requested_name,
    qi.quantity,
    qi.unit,
    coalesce(
      private.safe_uuid(qi.specifications->>'category_id'),
      private.safe_uuid(qi.specifications->>'subcategory_id')
    ),
    case
      when v_request.delivery_type = 'direct'::public.quote_request_delivery_type then 'direct_request'
      when exists (
        select 1
        from public.offer_items oi
        join public.offers o on o.id = oi.offer_id
        where oi.quote_item_id = qi.id
          and o.status = 'active'
          and oi.is_available = false
      ) then 'unavailable'
      when exists (
        select 1
        from public.offer_items oi
        join public.offers o on o.id = oi.offer_id
        where oi.quote_item_id = qi.id
          and o.status = 'active'
          and oi.is_available = true
          and oi.requested_quantity_snapshot < qi.quantity
      ) then 'partial_coverage'
      else 'uncovered'
    end,
    coalesce(qi.specifications, '{}'::jsonb)
  from public.quote_items qi
  where qi.quote_request_id = v_quote.id
    and (
      (p_quote_item_ids is not null and qi.id = any(p_quote_item_ids))
      or (
        p_quote_item_ids is null
        and (
          v_request.delivery_type = 'direct'::public.quote_request_delivery_type
          or not exists (
            select 1
            from public.offer_items oi
            join public.offers o on o.id = oi.offer_id
            where oi.quote_item_id = qi.id
              and o.status = 'active'
              and oi.is_available = true
              and oi.requested_quantity_snapshot >= qi.quantity
          )
        )
      )
    )
  on conflict (rfq_request_id, quote_item_id) do update
  set requested_name_snapshot = excluded.requested_name_snapshot,
      quantity_snapshot = excluded.quantity_snapshot,
      unit_snapshot = excluded.unit_snapshot,
      category_id = excluded.category_id,
      reason = excluded.reason,
      specifications_snapshot = excluded.specifications_snapshot;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function public.sync_my_rfq_items(uuid,uuid[]) from public;
grant execute on function public.sync_my_rfq_items(uuid,uuid[]) to authenticated;

create or replace function private.sync_direct_rfq_response_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.rfq_requests%rowtype;
begin
  if new.status <> 'submitted'::public.rfq_response_status then
    return new;
  end if;

  select * into v_request
  from public.rfq_requests r
  where r.id = new.rfq_request_id;

  if v_request.id is null
     or v_request.delivery_type <> 'direct'::public.quote_request_delivery_type
     or v_request.target_merchant_id is distinct from new.merchant_id then
    return new;
  end if;

  update public.rfq_requests
  set target_merchant_responded_at = coalesce(new.submitted_at, now()),
      updated_at = now()
  where id = v_request.id
    and target_merchant_responded_at is distinct from coalesce(new.submitted_at, now());

  update public.quote_requests
  set target_merchant_responded_at = coalesce(new.submitted_at, now()),
      updated_at = now()
  where id = v_request.quote_request_id
    and target_merchant_responded_at is distinct from coalesce(new.submitted_at, now());

  return new;
end;
$function$;

drop trigger if exists trg_sync_direct_rfq_response_state on public.rfq_responses;
create trigger trg_sync_direct_rfq_response_state
after insert or update of status, submitted_at on public.rfq_responses
for each row execute function private.sync_direct_rfq_response_state();

update public.rfq_requests r
set target_merchant_responded_at = latest.submitted_at,
    updated_at = now()
from (
  select distinct on (rr.rfq_request_id)
    rr.rfq_request_id,
    rr.submitted_at
  from public.rfq_responses rr
  join public.rfq_requests request on request.id = rr.rfq_request_id
  where request.delivery_type = 'direct'::public.quote_request_delivery_type
    and request.target_merchant_id = rr.merchant_id
    and rr.status in (
      'submitted'::public.rfq_response_status,
      'accepted'::public.rfq_response_status,
      'rejected'::public.rfq_response_status
    )
    and rr.submitted_at is not null
  order by rr.rfq_request_id, rr.submitted_at desc
) latest
where r.id = latest.rfq_request_id
  and r.target_merchant_responded_at is distinct from latest.submitted_at;

update public.quote_requests q
set target_merchant_responded_at = latest.submitted_at,
    updated_at = now()
from (
  select distinct on (r.quote_request_id)
    r.quote_request_id,
    r.target_merchant_responded_at as submitted_at
  from public.rfq_requests r
  where r.delivery_type = 'direct'::public.quote_request_delivery_type
    and r.target_merchant_responded_at is not null
  order by r.quote_request_id, r.target_merchant_responded_at desc
) latest
where q.id = latest.quote_request_id
  and q.target_merchant_responded_at is distinct from latest.submitted_at;

create or replace function public.my_buyer_quote_request_board()
returns table(
  id uuid,
  source text,
  ai_review_status text,
  created_at timestamptz,
  delivery_type text,
  target_merchant_id uuid,
  target_store_name text,
  response_deadline_at timestamptz,
  target_merchant_responded_at timestamptz,
  quote_items jsonb,
  rfq_request_id uuid,
  rfq_status text,
  rfq_expires_at timestamptz,
  rfq_response_count integer,
  latest_response_id uuid,
  latest_response_status text,
  latest_response_submitted_at timestamptz,
  accepted_order_id uuid,
  accepted_order_status text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    q.id,
    q.source::text,
    q.ai_review_status::text,
    q.created_at,
    q.delivery_type::text,
    q.target_merchant_id,
    merchant.store_name,
    q.response_deadline_at,
    coalesce(q.target_merchant_responded_at, latest_rfq.target_merchant_responded_at),
    coalesce(items.items, '[]'::jsonb),
    latest_rfq.id,
    latest_rfq.status::text,
    latest_rfq.expires_at,
    coalesce(response_summary.response_count, 0)::integer,
    latest_response.id,
    latest_response.status::text,
    latest_response.submitted_at,
    accepted_order.id,
    accepted_order.status::text
  from public.quote_requests q
  left join public.merchants merchant on merchant.id = q.target_merchant_id
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'id', qi.id,
        'requested_name', qi.requested_name,
        'quantity', qi.quantity,
        'unit', qi.unit,
        'specifications', qi.specifications,
        'display_order', qi.display_order
      ) order by qi.display_order, qi.created_at, qi.id
    ) as items
    from public.quote_items qi
    where qi.quote_request_id = q.id
  ) items on true
  left join lateral (
    select r.*
    from public.rfq_requests r
    where r.quote_request_id = q.id
    order by
      case when r.status = 'open'::public.rfq_status then 0 else 1 end,
      r.created_at desc
    limit 1
  ) latest_rfq on true
  left join lateral (
    select count(*)::integer as response_count
    from public.rfq_responses rr
    join public.rfq_requests r on r.id = rr.rfq_request_id
    where r.quote_request_id = q.id
      and rr.status = 'submitted'::public.rfq_response_status
  ) response_summary on true
  left join lateral (
    select rr.*
    from public.rfq_responses rr
    join public.rfq_requests r on r.id = rr.rfq_request_id
    where r.quote_request_id = q.id
      and rr.status in (
        'submitted'::public.rfq_response_status,
        'accepted'::public.rfq_response_status,
        'rejected'::public.rfq_response_status
      )
    order by rr.submitted_at desc nulls last, rr.updated_at desc
    limit 1
  ) latest_response on true
  left join lateral (
    select orders.*
    from public.offers offer
    join public.orders orders on orders.offer_id = offer.id
    where offer.quote_request_id = q.id
      and orders.buyer_id = auth.uid()
    order by orders.created_at desc
    limit 1
  ) accepted_order on true
  where q.buyer_id = auth.uid()
  order by q.created_at desc
  limit 100;
$function$;

revoke all on function public.my_buyer_quote_request_board() from public;
grant execute on function public.my_buyer_quote_request_board() to authenticated;

create or replace view public.buyer_rfq_response_results
with (security_invoker = false)
as
select
  rr.id,
  rr.rfq_request_id,
  r.quote_request_id,
  rr.status,
  rr.item_responses,
  rr.total_price_snapshot,
  rr.submitted_at,
  case
    when r.delivery_type = 'direct'::public.quote_request_delivery_type
      then coalesce(m.store_name, 'المتجر المحدد')
    else 'متجر ' || dense_rank() over (
      partition by rr.rfq_request_id
      order by rr.total_price_snapshot, rr.submitted_at, rr.id
    )::text
  end as anonymous_store_label_ar,
  case
    when r.delivery_type = 'direct'::public.quote_request_delivery_type
      then coalesce(m.store_name, 'Selected store')
    else 'Store ' || dense_rank() over (
      partition by rr.rfq_request_id
      order by rr.total_price_snapshot, rr.submitted_at, rr.id
    )::text
  end as anonymous_store_label_en,
  jsonb_build_object(
    'rfq_request_id', rr.rfq_request_id,
    'rfq_response_id', rr.id,
    'delivery_type', r.delivery_type
  ) as client_payload
from public.rfq_responses rr
join public.rfq_requests r on r.id = rr.rfq_request_id
left join public.merchants m on m.id = rr.merchant_id
where r.buyer_id = auth.uid()
  and rr.status = 'submitted'::public.rfq_response_status;

grant select on public.buyer_rfq_response_results to authenticated;

create or replace view public.admin_referrals_rewards_dashboard_readable
as
select
  r.id,
  r.id as referral_id,
  u.full_name as referrer_name,
  u.full_name as rewarded_user_name,
  r.referral_code,
  r.referral_url,
  r.confirmed_registrations,
  r.target_confirmed_registrations,
  r.reward_type,
  reward.id as reward_id,
  reward.delivery_status,
  reward.delivered_at,
  reward.milestone_number,
  reward.qualified_registrations,
  greatest(r.target_confirmed_registrations - r.confirmed_registrations, 0) as remaining_registrations,
  case
    when reward.id is null and r.confirmed_registrations < r.target_confirmed_registrations then 'لم تستحق مكافأة بعد'
    when reward.id is null then 'بانتظار إنشاء المكافأة'
    when reward.delivery_status::text = 'delivered' then 'تم تسليم المكافأة'
    else 'المكافأة مستحقة'
  end as status_ar,
  case
    when reward.id is null and r.confirmed_registrations < r.target_confirmed_registrations then 'Not eligible yet'
    when reward.id is null then 'Reward creation pending'
    when reward.delivery_status::text = 'delivered' then 'Reward delivered'
    else 'Reward earned'
  end as status_en,
  concat_ws(
    ' - ',
    u.full_name,
    r.referral_code,
    r.confirmed_registrations::text || '/' || r.target_confirmed_registrations::text,
    case when reward.id is null then 'بدون مكافأة حتى الآن' else reward.delivery_status::text end
  ) as row_description_ar,
  coalesce(reward.created_at, r.created_at) as created_at,
  greatest(r.updated_at, coalesce(reward.updated_at, r.updated_at)) as updated_at
from public.referrals r
join public.users u on u.id = r.referrer_user_id
left join lateral (
  select rw.*
  from public.referral_rewards rw
  where rw.referral_id = r.id
  order by rw.created_at desc
  limit 1
) reward on true;

grant select on public.admin_referrals_rewards_dashboard_readable to service_role;

-- Legacy QA/import rows can legitimately reference an existing authoritative
-- storefront object that predates owner-scoped document records.
insert into public.merchant_documents (
  merchant_id, branch_id, manager_name, kind, storage_bucket, storage_path,
  mime_type, file_size_bytes, status, reviewed_at, metadata, created_at, updated_at
)
select
  b.merchant_id,
  b.id,
  null,
  'branch_front'::public.merchant_document_kind,
  'storefront-photos',
  private.normalize_storage_object_path('storefront-photos', b.front_image_url),
  nullif(o.metadata->>'mimetype', ''),
  nullif(o.metadata->>'size', '')::integer,
  case
    when b.approval_status = 'approved'::public.approval_status
      then 'approved'::public.document_review_status
    else 'pending'::public.document_review_status
  end,
  case when b.approval_status = 'approved'::public.approval_status then now() else null end,
  jsonb_build_object('source', 'legacy_branch_front_authoritative_backfill_20260804'),
  now(),
  now()
from public.branches b
join storage.objects o
  on o.bucket_id = 'storefront-photos'
 and o.name = private.normalize_storage_object_path('storefront-photos', b.front_image_url)
where nullif(btrim(coalesce(b.front_image_url, '')), '') is not null
  and not exists (
    select 1 from public.merchant_documents d
    where d.branch_id = b.id
      and d.kind = 'branch_front'::public.merchant_document_kind
      and d.superseded_by is null
  );

-- Keep branch row and all required files in one database transaction.
create or replace function public.save_my_branch_with_documents(
  p_branch_id uuid,
  p_payload jsonb,
  p_manager_name text,
  p_branch_front_storage_path text,
  p_manager_front_storage_path text,
  p_manager_back_storage_path text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_merchant_id uuid;
  v_branch public.branches%rowtype;
  v_name text;
  v_city_id uuid;
  v_city_name text;
  v_governorate_name text;
  v_latitude double precision;
  v_longitude double precision;
  v_manager_mobile text;
  v_delivery_enabled boolean;
  v_delivery_pricing_method text;
  v_craftsman_available boolean;
  v_front_path text;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'branch_payload_required';
  end if;

  v_merchant_id := private.safe_uuid(p_payload->>'merchant_id');
  v_name := nullif(btrim(coalesce(p_payload->>'name', '')), '');
  v_city_id := private.safe_uuid(p_payload->>'city_id');
  v_city_name := nullif(btrim(coalesce(p_payload->>'city_name', '')), '');
  v_governorate_name := nullif(btrim(coalesce(p_payload->>'governorate_name', '')), '');
  v_manager_mobile := nullif(btrim(coalesce(p_payload->>'manager_mobile', '')), '');
  v_front_path := private.normalize_storage_object_path(
    'storefront-photos',
    p_branch_front_storage_path
  );

  begin
    v_latitude := (p_payload->>'latitude')::double precision;
    v_longitude := (p_payload->>'longitude')::double precision;
    v_delivery_enabled := nullif(p_payload->>'delivery_enabled', '')::boolean;
    v_craftsman_available := coalesce(
      nullif(p_payload->>'craftsman_available', '')::boolean,
      false
    );
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_branch_payload';
  end;

  v_delivery_pricing_method := nullif(
    btrim(coalesce(p_payload->>'delivery_pricing_method', '')),
    ''
  );

  if v_merchant_id is null
     or v_name is null
     or v_city_id is null
     or v_city_name is null
     or v_governorate_name is null
     or v_manager_mobile is null
     or v_front_path is null
     or nullif(btrim(coalesce(p_manager_name, '')), '') is null
     or nullif(btrim(coalesce(p_manager_front_storage_path, '')), '') is null
     or nullif(btrim(coalesce(p_manager_back_storage_path, '')), '') is null then
    raise exception 'missing_branch_fields';
  end if;
  if v_latitude not between -90 and 90 or v_longitude not between -180 and 180 then
    raise exception 'invalid_branch_coordinates';
  end if;

  if not exists (
    select 1
    from public.merchants m
    join public.users u on u.id = m.user_id
    where m.id = v_merchant_id
      and m.user_id = v_user_id
      and not u.is_blocked
      and m.approval_status in (
        'pending'::public.approval_status,
        'approved'::public.approval_status
      )
  ) then
    raise exception 'merchant_owner_required' using errcode = '42501';
  end if;

  if p_branch_id is null then
    insert into public.branches (
      merchant_id,
      name,
      city_id,
      city_name,
      governorate_name,
      latitude,
      longitude,
      manager_mobile,
      front_image_url,
      approval_status,
      rejection_reason,
      delivery_enabled,
      delivery_pricing_method,
      craftsman_available,
      is_primary,
      created_at,
      updated_at
    ) values (
      v_merchant_id,
      v_name,
      v_city_id,
      v_city_name,
      v_governorate_name,
      v_latitude,
      v_longitude,
      v_manager_mobile,
      v_front_path,
      'pending'::public.approval_status,
      null,
      v_delivery_enabled,
      v_delivery_pricing_method,
      v_craftsman_available,
      false,
      now(),
      now()
    )
    returning * into v_branch;
  else
    select * into v_branch
    from public.branches b
    where b.id = p_branch_id
      and b.merchant_id = v_merchant_id
      and not b.is_primary
    for update;

    if v_branch.id is null then
      raise exception 'branch_not_found_or_not_editable';
    end if;

    update public.branches
    set name = v_name,
        city_id = v_city_id,
        city_name = v_city_name,
        governorate_name = v_governorate_name,
        latitude = v_latitude,
        longitude = v_longitude,
        manager_mobile = v_manager_mobile,
        front_image_url = v_front_path,
        approval_status = 'pending'::public.approval_status,
        rejection_reason = null,
        delivery_enabled = v_delivery_enabled,
        delivery_pricing_method = v_delivery_pricing_method,
        craftsman_available = v_craftsman_available,
        updated_at = now()
    where id = v_branch.id
    returning * into v_branch;
  end if;

  perform private.upsert_merchant_document(
    v_merchant_id,
    v_branch.id,
    p_manager_name,
    'branch_front'::public.merchant_document_kind,
    'storefront-photos',
    v_front_path,
    null,
    null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant_id,
    v_branch.id,
    p_manager_name,
    'branch_manager_id_front'::public.merchant_document_kind,
    'merchant-ids',
    p_manager_front_storage_path,
    null,
    null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant_id,
    v_branch.id,
    p_manager_name,
    'branch_manager_id_back'::public.merchant_document_kind,
    'merchant-ids',
    p_manager_back_storage_path,
    null,
    null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );

  return v_branch.id;
end;
$function$;

revoke all on function public.save_my_branch_with_documents(uuid,jsonb,text,text,text,text) from public;
grant execute on function public.save_my_branch_with_documents(uuid,jsonb,text,text,text,text) to authenticated;
