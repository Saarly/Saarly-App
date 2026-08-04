create or replace view public.admin_branches_readable as
select
  b.id,
  b.name as branch_name,
  m.store_name,
  m.owner_name,
  m.contact_mobile as store_contact_mobile,
  b.manager_mobile,
  dfront.manager_name,
  b.city_name,
  b.governorate_name,
  c.name_ar as city_name_ar,
  c.name_en as city_name_en,
  c.governorate_ar,
  c.governorate_en,
  c.country_ar,
  c.country_en,
  b.latitude,
  b.longitude,
  b.approval_status,
  case b.approval_status::text
    when 'pending' then 'قيد المراجعة'
    when 'approved' then 'مقبول'
    else 'مرفوض'
  end as approval_status_ar,
  case b.approval_status::text
    when 'pending' then 'Pending review'
    when 'approved' then 'Approved'
    else 'Rejected'
  end as approval_status_en,
  b.rejection_reason,
  b.front_image_url,
  dfront.storage_path as manager_id_front_image_url,
  dfront.storage_bucket as manager_id_front_bucket,
  dback.storage_path as manager_id_back_image_url,
  dback.storage_bucket as manager_id_back_bucket,
  b.uses_parent_commercial_register,
  case
    when b.uses_parent_commercial_register then m.commercial_register_url
    else branch_commercial.storage_path
  end as commercial_register_url,
  case
    when b.uses_parent_commercial_register then 'commercial-registers'::text
    else branch_commercial.storage_bucket
  end as commercial_register_bucket,
  b.merchant_id,
  b.city_id,
  b.created_at,
  b.updated_at,
  concat_ws(
    ' - ',
    m.store_name,
    b.name,
    coalesce(c.name_ar, b.city_name),
    coalesce(c.governorate_ar, b.governorate_name),
    b.manager_mobile
  ) as row_description_ar
from public.branches b
join public.merchants m on m.id = b.merchant_id
left join public.cities c on c.id = b.city_id
left join lateral (
  select d.storage_path, d.storage_bucket, d.manager_name
  from public.merchant_documents d
  where d.branch_id = b.id
    and d.kind = 'branch_manager_id_front'::public.merchant_document_kind
    and d.superseded_by is null
  order by d.created_at desc
  limit 1
) dfront on true
left join lateral (
  select d.storage_path, d.storage_bucket
  from public.merchant_documents d
  where d.branch_id = b.id
    and d.kind = 'branch_manager_id_back'::public.merchant_document_kind
    and d.superseded_by is null
  order by d.created_at desc
  limit 1
) dback on true
left join lateral (
  select d.storage_path, d.storage_bucket
  from public.merchant_documents d
  where d.branch_id = b.id
    and d.kind = 'commercial_register'::public.merchant_document_kind
    and d.superseded_by is null
  order by d.created_at desc
  limit 1
) branch_commercial on true
where not b.is_primary
  and not coalesce(m.is_archived, false);
