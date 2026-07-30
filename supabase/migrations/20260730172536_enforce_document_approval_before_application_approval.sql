-- Prevent final merchant/branch approval until every required current document is approved.

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
as $function$
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

  select * into v_merchant
  from public.merchants
  where id = p_merchant_id
  for update;
  if v_merchant.id is null then raise exception 'merchant_not_found'; end if;

  if coalesce(p_approved, false) then
    if exists (
      select 1
      from unnest(array[
        'store_front'::public.merchant_document_kind,
        'store_owner_id_front'::public.merchant_document_kind,
        'store_owner_id_back'::public.merchant_document_kind
      ]) as required_kind(kind)
      where not exists (
        select 1
        from public.merchant_documents document
        where document.merchant_id = p_merchant_id
          and document.branch_id is null
          and document.kind = required_kind.kind
          and document.superseded_by is null
          and document.status = 'approved'::public.document_review_status
      )
    ) then
      raise exception 'required_documents_must_be_approved_first';
    end if;

    if exists (
      select 1
      from public.merchant_documents document
      where document.merchant_id = p_merchant_id
        and document.branch_id is null
        and document.superseded_by is null
        and document.status = 'rejected'::public.document_review_status
    ) then
      raise exception 'rejected_documents_must_be_replaced_first';
    end if;
  end if;

  v_status := case when p_approved then 'approved'::public.approval_status else 'rejected'::public.approval_status end;
  v_reason := case when p_approved then null else btrim(p_rejection_reason) end;

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
$function$;

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
as $function$
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

  if coalesce(p_approved, false) then
    if exists (
      select 1
      from unnest(
        case
          when v_branch.uses_parent_commercial_register is false then array[
            'branch_front'::public.merchant_document_kind,
            'branch_manager_id_front'::public.merchant_document_kind,
            'branch_manager_id_back'::public.merchant_document_kind,
            'commercial_register'::public.merchant_document_kind
          ]
          else array[
            'branch_front'::public.merchant_document_kind,
            'branch_manager_id_front'::public.merchant_document_kind,
            'branch_manager_id_back'::public.merchant_document_kind
          ]
        end
      ) as required_kind(kind)
      where not exists (
        select 1
        from public.merchant_documents document
        where document.merchant_id = v_branch.merchant_id
          and document.branch_id = p_branch_id
          and document.kind = required_kind.kind
          and document.superseded_by is null
          and document.status = 'approved'::public.document_review_status
      )
    ) then
      raise exception 'required_documents_must_be_approved_first';
    end if;

    if exists (
      select 1
      from public.merchant_documents document
      where document.merchant_id = v_branch.merchant_id
        and document.branch_id = p_branch_id
        and document.superseded_by is null
        and document.status = 'rejected'::public.document_review_status
    ) then
      raise exception 'rejected_documents_must_be_replaced_first';
    end if;
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
$function$;
