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
  v_free_delivery_enabled boolean := false;
  v_free_delivery_minimum numeric(14,2);
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
  v_front_path := private.normalize_storage_object_path('storefront-photos', p_branch_front_storage_path);

  begin
    v_latitude := (p_payload->>'latitude')::double precision;
    v_longitude := (p_payload->>'longitude')::double precision;
    v_delivery_enabled := nullif(p_payload->>'delivery_enabled', '')::boolean;
    v_craftsman_available := coalesce(nullif(p_payload->>'craftsman_available', '')::boolean, false);
    v_free_delivery_enabled := coalesce(nullif(p_payload->>'free_delivery_enabled', '')::boolean, false);
    v_free_delivery_minimum := nullif(p_payload->>'free_delivery_minimum', '')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid_branch_payload';
  end;

  v_delivery_pricing_method := nullif(btrim(coalesce(p_payload->>'delivery_pricing_method', '')), '');

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
  if v_free_delivery_enabled and (v_free_delivery_minimum is null or v_free_delivery_minimum <= 0) then
    raise exception 'free_delivery_minimum_required';
  end if;

  if not exists (
    select 1
    from public.merchants m
    join public.users u on u.id = m.user_id
    where m.id = v_merchant_id
      and m.user_id = v_user_id
      and not u.is_blocked
      and m.approval_status in ('pending'::public.approval_status, 'approved'::public.approval_status)
  ) then
    raise exception 'merchant_owner_required' using errcode = '42501';
  end if;

  if p_branch_id is null then
    insert into public.branches (
      merchant_id, name, city_id, city_name, governorate_name,
      latitude, longitude, manager_mobile, front_image_url,
      approval_status, rejection_reason, delivery_enabled,
      delivery_pricing_method, free_delivery_enabled,
      free_delivery_minimum, craftsman_available, is_primary,
      created_at, updated_at
    ) values (
      v_merchant_id, v_name, v_city_id, v_city_name, v_governorate_name,
      v_latitude, v_longitude, v_manager_mobile, v_front_path,
      'pending'::public.approval_status, null, v_delivery_enabled,
      v_delivery_pricing_method, v_free_delivery_enabled,
      case when v_free_delivery_enabled then round(v_free_delivery_minimum, 2) else null end,
      v_craftsman_available, false, now(), now()
    ) returning * into v_branch;
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
        free_delivery_enabled = v_free_delivery_enabled,
        free_delivery_minimum = case when v_free_delivery_enabled then round(v_free_delivery_minimum, 2) else null end,
        craftsman_available = v_craftsman_available,
        updated_at = now()
    where id = v_branch.id
    returning * into v_branch;
  end if;

  perform private.upsert_merchant_document(
    v_merchant_id, v_branch.id, p_manager_name,
    'branch_front'::public.merchant_document_kind,
    'storefront-photos', v_front_path, null, null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant_id, v_branch.id, p_manager_name,
    'branch_manager_id_front'::public.merchant_document_kind,
    'merchant-ids', p_manager_front_storage_path, null, null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );
  perform private.upsert_merchant_document(
    v_merchant_id, v_branch.id, p_manager_name,
    'branch_manager_id_back'::public.merchant_document_kind,
    'merchant-ids', p_manager_back_storage_path, null, null,
    jsonb_build_object('source', 'atomic_branch_editor')
  );

  return v_branch.id;
end;
$function$;
