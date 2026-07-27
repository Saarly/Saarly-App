-- Saarly Admin Web V6 final fixes
-- 1) Turning off an ongoing ad stops it immediately.
-- 2) Finite inactive ads may be saved without a schedule; activation requires a valid schedule.
-- 3) Complaint status changes use an audited RPC.
-- 4) Merchant deletion is atomic and refuses to destroy order/financial history.

create or replace function private.normalize_ad_banner_schedule()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_ongoing, false) then
      new.saved_starts_at := coalesce(new.saved_starts_at, new.starts_at);
      new.saved_ends_at := coalesce(new.saved_ends_at, new.ends_at);
      new.starts_at := null;
      new.ends_at := null;
      return new;
    end if;
  elsif coalesce(new.is_ongoing, false) then
    if coalesce(old.is_ongoing, false) = false then
      new.saved_starts_at := coalesce(old.starts_at, old.saved_starts_at, new.starts_at, new.saved_starts_at);
      new.saved_ends_at := coalesce(old.ends_at, old.saved_ends_at, new.ends_at, new.saved_ends_at);
    else
      new.saved_starts_at := coalesce(new.saved_starts_at, old.saved_starts_at);
      new.saved_ends_at := coalesce(new.saved_ends_at, old.saved_ends_at);
    end if;
    new.starts_at := null;
    new.ends_at := null;
    return new;
  elsif coalesce(old.is_ongoing, false) then
    -- Disabling the ongoing option is an explicit stop action.
    -- Restore any previous finite dates for later reuse, but never keep the ad active.
    new.is_active := false;
    new.starts_at := coalesce(new.starts_at, old.saved_starts_at);
    new.ends_at := coalesce(new.ends_at, old.saved_ends_at);
  end if;

  if (new.starts_at is null) <> (new.ends_at is null) then
    raise exception 'ad_schedule_required';
  end if;

  if new.starts_at is not null and new.ends_at is not null then
    if new.ends_at <= new.starts_at then
      raise exception 'ad_end_must_be_after_start';
    end if;
    new.saved_starts_at := new.starts_at;
    new.saved_ends_at := new.ends_at;
  elsif coalesce(new.is_active, false) then
    raise exception 'ad_schedule_required';
  end if;

  return new;
end;
$function$;

drop trigger if exists normalize_ad_banner_schedule on public.ads_banners;
create trigger normalize_ad_banner_schedule
before insert or update of is_ongoing, is_active, starts_at, ends_at
on public.ads_banners
for each row execute function private.normalize_ad_banner_schedule();

create or replace function public.admin_set_support_complaint_status_as(
  p_actor_id uuid,
  p_complaint_id uuid,
  p_status text
)
returns public.support_complaints
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_before public.support_complaints%rowtype;
  v_after public.support_complaints%rowtype;
  v_status text := btrim(coalesce(p_status, ''));
begin
  if p_actor_id is null
     or not (private.is_admin_user(p_actor_id) or private.is_active_support_agent(p_actor_id)) then
    raise exception 'admin_or_support_permission_required';
  end if;

  if v_status not in ('open', 'in_support', 'escalated', 'resolved', 'closed') then
    raise exception 'invalid_complaint_status';
  end if;

  select * into v_before
  from public.support_complaints
  where id = p_complaint_id
  for update;

  if not found then
    raise exception 'complaint_not_found';
  end if;

  if v_before.status = v_status then
    return v_before;
  end if;

  update public.support_complaints
  set status = v_status,
      escalated_at = case
        when v_status = 'escalated' then coalesce(escalated_at, now())
        else null
      end,
      closed_at = case
        when v_status in ('resolved', 'closed') then coalesce(closed_at, now())
        else null
      end,
      updated_at = now()
  where id = p_complaint_id
  returning * into v_after;

  insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
  values (
    p_actor_id,
    'set_support_complaint_status',
    'support_complaints',
    p_complaint_id::text,
    to_jsonb(v_before),
    to_jsonb(v_after)
  );

  return v_after;
end;
$function$;

revoke all on function public.admin_set_support_complaint_status_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_support_complaint_status_as(uuid, uuid, text) to service_role;

create or replace function public.admin_delete_merchant_as(
  p_actor_id uuid,
  p_merchant_id uuid,
  p_reason text default 'Deleted from Saarly Admin Web'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_merchant public.merchants%rowtype;
  v_order_count bigint;
  v_fulfillment_count bigint;
  v_payment_count bigint;
  v_commission_count bigint;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;

  if length(v_reason) < 3 then
    raise exception 'reason_required';
  end if;

  select * into v_merchant
  from public.merchants
  where id = p_merchant_id
  for update;

  if not found then
    raise exception 'merchant_not_found';
  end if;

  select count(*) into v_order_count
  from public.orders where merchant_id = p_merchant_id;

  select count(*) into v_fulfillment_count
  from public.order_merchant_fulfillments where merchant_id = p_merchant_id;

  select count(*) into v_payment_count
  from public.payment_transactions where merchant_id = p_merchant_id;

  select count(*) into v_commission_count
  from public.merchant_commissions where merchant_id = p_merchant_id;

  if v_order_count + v_fulfillment_count + v_payment_count + v_commission_count > 0 then
    raise exception 'merchant_has_financial_or_order_history';
  end if;

  insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
  values (
    p_actor_id,
    'delete_merchant',
    'merchants',
    p_merchant_id::text,
    to_jsonb(v_merchant),
    jsonb_build_object('deleted', true, 'reason', v_reason)
  );

  update public.users
  set role = 'buyer'::public.app_role,
      updated_at = now()
  where id = v_merchant.user_id
    and role = 'merchant'::public.app_role;

  delete from public.merchants where id = p_merchant_id;

  return jsonb_build_object(
    'id', p_merchant_id,
    'user_id', v_merchant.user_id,
    'deleted', true
  );
end;
$function$;

revoke all on function public.admin_delete_merchant_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_delete_merchant_as(uuid, uuid, text) to service_role;
