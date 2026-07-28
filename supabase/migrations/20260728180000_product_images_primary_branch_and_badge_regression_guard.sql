-- Saarly V12 regression guard.
-- Production already received these contracts through the managed migration flow.
-- This source copy keeps future deployments from silently reverting them.

alter table public.branches
  add column if not exists is_primary boolean not null default false;

with ranked as (
  select id,
         row_number() over (partition by merchant_id order by created_at, id) as position
  from public.branches
), first_branch as (
  select id from ranked where position = 1
)
update public.branches b
set is_primary = true
where b.id in (select id from first_branch)
  and not exists (
    select 1
    from public.branches existing
    where existing.merchant_id = b.merchant_id
      and existing.is_primary
  );

create unique index if not exists branches_one_primary_per_merchant_idx
  on public.branches (merchant_id)
  where is_primary;

create or replace function private.mark_first_branch_as_primary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_primary then
    if exists (
      select 1
      from public.branches b
      where b.merchant_id = new.merchant_id
        and b.is_primary
        and b.id is distinct from new.id
    ) then
      raise exception 'primary_branch_already_exists';
    end if;
    return new;
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.merchant_id = new.merchant_id
      and b.is_primary
  ) then
    new.is_primary := true;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_first_branch_as_primary on public.branches;
create trigger mark_first_branch_as_primary
before insert on public.branches
for each row execute function private.mark_first_branch_as_primary();

-- Product image paths are owned by the authenticated user and scoped to the
-- current merchant: <auth-user>/products/<merchant-id>/<file>.
drop policy if exists product_images_merchant_owner_insert on storage.objects;
drop policy if exists product_images_merchant_owner_select on storage.objects;
drop policy if exists product_images_merchant_owner_update on storage.objects;
drop policy if exists product_images_merchant_owner_delete on storage.objects;

create policy product_images_merchant_owner_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'products'
  and (storage.foldername(name))[3] = coalesce((select public.current_merchant_id())::text, '')
);

create policy product_images_merchant_owner_select
on storage.objects for select to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'products'
  and (storage.foldername(name))[3] = coalesce((select public.current_merchant_id())::text, '')
);

create policy product_images_merchant_owner_update
on storage.objects for update to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'products'
  and (storage.foldername(name))[3] = coalesce((select public.current_merchant_id())::text, '')
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'products'
  and (storage.foldername(name))[3] = coalesce((select public.current_merchant_id())::text, '')
);

create policy product_images_merchant_owner_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'products'
  and (storage.foldername(name))[3] = coalesce((select public.current_merchant_id())::text, '')
);

-- A merchant registration's first branch is reviewed together with the
-- merchant. It must not appear as a second, independent pending approval.
create or replace function public.admin_review_merchant_registration_as(
  p_actor_id uuid,
  p_merchant_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.merchants
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_status public.approval_status;
  v_reason text;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;
  if not coalesce(p_approved, false)
     and length(btrim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'rejection_reason_required';
  end if;

  v_status := case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end;
  v_reason := case when p_approved then null else btrim(p_rejection_reason) end;

  select * into v_merchant
  from public.merchants
  where id = p_merchant_id
  for update;
  if v_merchant.id is null then raise exception 'merchant_not_found'; end if;

  if v_merchant.approval_status is distinct from v_status
     or v_merchant.rejection_reason is distinct from v_reason then
    update public.merchants
    set approval_status = v_status,
        rejection_reason = v_reason,
        last_admin_contact_at = now(),
        updated_at = now()
    where id = p_merchant_id
    returning * into v_merchant;
  end if;

  update public.branches
  set approval_status = v_status,
      rejection_reason = v_reason,
      updated_at = now()
  where merchant_id = p_merchant_id
    and is_primary
    and (approval_status is distinct from v_status or rejection_reason is distinct from v_reason);

  insert into public.audit_logs(actor_id, action, target_table, target_id, new_data)
  values (
    p_actor_id,
    case when p_approved then 'approve_merchant_registration' else 'reject_merchant_registration' end,
    'merchants', p_merchant_id::text,
    jsonb_build_object('approval_status', v_merchant.approval_status, 'reason', v_merchant.rejection_reason)
  );
  return v_merchant;
end;
$$;

create or replace function public.admin_review_branch_as(
  p_actor_id uuid,
  p_branch_id uuid,
  p_approved boolean,
  p_rejection_reason text default null
)
returns public.branches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch public.branches;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;
  if not coalesce(p_approved, false)
     and length(btrim(coalesce(p_rejection_reason, ''))) < 3 then
    raise exception 'rejection_reason_required';
  end if;

  select * into v_branch
  from public.branches
  where id = p_branch_id
  for update;
  if v_branch.id is null then raise exception 'branch_not_found'; end if;
  if v_branch.is_primary then
    raise exception 'primary_branch_reviewed_with_merchant';
  end if;

  update public.branches
  set approval_status = case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end,
      rejection_reason = case when p_approved then null else btrim(p_rejection_reason) end,
      updated_at = now()
  where id = p_branch_id
    and (
      approval_status is distinct from case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end
      or rejection_reason is distinct from case when p_approved then null else btrim(p_rejection_reason) end
    )
  returning * into v_branch;

  if v_branch.id is null then
    select * into v_branch from public.branches where id = p_branch_id;
  end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, new_data)
  values (
    p_actor_id,
    case when p_approved then 'approve_branch' else 'reject_branch' end,
    'branches', p_branch_id::text,
    jsonb_build_object('approval_status', v_branch.approval_status, 'reason', v_branch.rejection_reason)
  );
  return v_branch;
end;
$$;

-- The primary branch follows the merchant decision, so it must not enqueue a
-- duplicate branch email/push notification.
create or replace function private.queue_approval_decision_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_merchant public.merchants;
  v_user public.users;
  v_subject text;
  v_subject_en text;
  v_body_ar text;
  v_body_en text;
  v_event_type text;
  v_entity_name text;
  v_reason text;
  v_target_id uuid;
begin
  if old.approval_status is not distinct from new.approval_status
     or new.approval_status not in ('approved'::public.approval_status, 'rejected'::public.approval_status) then
    return new;
  end if;

  if tg_table_name = 'branches' and coalesce(new.is_primary, false) then
    return new;
  end if;

  if tg_table_name = 'merchants' then
    v_merchant := new;
    v_target_id := new.id;
    v_entity_name := new.store_name;
    v_event_type := case when new.approval_status = 'approved' then 'merchant_approved' else 'merchant_rejected' end;
  else
    select * into v_merchant from public.merchants where id = new.merchant_id;
    v_target_id := new.id;
    v_entity_name := new.name;
    v_event_type := case when new.approval_status = 'approved' then 'branch_approved' else 'branch_rejected' end;
  end if;

  select * into v_user from public.users where id = v_merchant.user_id;
  v_reason := nullif(btrim(coalesce(new.rejection_reason, '')), '');

  if tg_table_name = 'merchants' and new.approval_status = 'approved' then
    v_subject := 'تم قبول متجرك في سعرلي';
    v_subject_en := 'Your store was approved in Saarly';
    v_body_ar := format('تم قبول متجر %s بتاريخ %s. يمكنك الآن تسجيل الدخول وبدء استخدام النظام.', v_merchant.store_name, to_char(now(), 'YYYY-MM-DD'));
    v_body_en := format('Store %s was approved on %s. You can now sign in and start using Saarly.', v_merchant.store_name, to_char(now(), 'YYYY-MM-DD'));
  elsif tg_table_name = 'merchants' then
    v_subject := 'تم رفض طلب تسجيل المتجر';
    v_subject_en := 'Your store registration was rejected';
    v_body_ar := format('تم رفض طلب تسجيل متجر %s. السبب: %s. يمكنك تعديل البيانات أو إعادة التقديم وفق حالة الطلب.', v_merchant.store_name, coalesce(v_reason, 'لم يتم تحديد السبب'));
    v_body_en := format('The registration request for %s was rejected. Reason: %s.', v_merchant.store_name, coalesce(v_reason, 'No reason supplied'));
  elsif new.approval_status = 'approved' then
    v_subject := 'تم قبول فرع المتجر';
    v_subject_en := 'Your store branch was approved';
    v_body_ar := format('تم قبول فرع %s التابع لمتجر %s بتاريخ %s.', v_entity_name, v_merchant.store_name, to_char(now(), 'YYYY-MM-DD'));
    v_body_en := format('Branch %s for %s was approved on %s.', v_entity_name, v_merchant.store_name, to_char(now(), 'YYYY-MM-DD'));
  else
    v_subject := 'تم رفض فرع المتجر';
    v_subject_en := 'Your store branch was rejected';
    v_body_ar := format('تم رفض فرع %s التابع لمتجر %s. السبب: %s. يمكنك تعديل البيانات أو إعادة رفع المستندات.', v_entity_name, v_merchant.store_name, coalesce(v_reason, 'لم يتم تحديد السبب'));
    v_body_en := format('Branch %s for %s was rejected. Reason: %s.', v_entity_name, v_merchant.store_name, coalesce(v_reason, 'No reason supplied'));
  end if;

  perform private.enqueue_admin_email_event(
    v_event_type,
    tg_table_name,
    v_target_id,
    v_merchant.id,
    v_user.id,
    v_user.primary_email,
    case when v_user.preferred_language::text = 'en' then v_subject_en else v_subject end,
    case when v_user.preferred_language::text = 'en' then v_body_en else v_body_ar end,
    case when v_user.preferred_language::text = 'en'
      then '<div dir="ltr"><h2>' || private.html_escape(v_subject_en) || '</h2><p>' || private.html_escape(v_body_en) || '</p></div>'
      else '<div dir="rtl"><h2>' || private.html_escape(v_subject) || '</h2><p>' || private.html_escape(v_body_ar) || '</p></div>'
    end,
    'admin:' || v_event_type || ':' || v_target_id::text,
    jsonb_build_object(
      'store_name', v_merchant.store_name,
      'entity_name', v_entity_name,
      'approval_status', new.approval_status,
      'rejection_reason', v_reason,
      'decided_at', now()
    )
  );

  if not exists (
    select 1 from public.notifications n
    where n.user_id = v_user.id
      and n.dedupe_key = 'admin:' || v_event_type || ':' || v_target_id::text
  ) then
    insert into public.notifications (
      user_id, type, title_ar, title_en, body_ar, body_en,
      deep_link, dedupe_key, payload
    ) values (
      v_user.id, v_event_type, v_subject,
      case when new.approval_status = 'approved' then 'Request approved' else 'Request rejected' end,
      v_body_ar, v_body_en, '/merchant/account-status',
      'admin:' || v_event_type || ':' || v_target_id::text,
      jsonb_build_object('target_table', tg_table_name, 'target_id', v_target_id, 'reason', v_reason)
    );
  end if;

  return new;
end;
$$;

-- Recreate the review view without the primary registration branch.
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
  case when b.uses_parent_commercial_register
    then m.commercial_register_url
    else branch_commercial.storage_path
  end as commercial_register_url,
  case when b.uses_parent_commercial_register
    then 'commercial-registers'::text
    else branch_commercial.storage_bucket
  end as commercial_register_bucket,
  b.merchant_id,
  b.city_id,
  b.created_at,
  b.updated_at,
  concat_ws(' - ', m.store_name, b.name, coalesce(c.name_ar, b.city_name), coalesce(c.governorate_ar, b.governorate_name), b.manager_mobile) as row_description_ar
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
where not b.is_primary;
