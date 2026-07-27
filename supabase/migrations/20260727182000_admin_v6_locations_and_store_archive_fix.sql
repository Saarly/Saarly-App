-- Admin Web V6: reliable locations and safe operational store deletion.
-- Applied to production on 2026-07-27. Keep this file for source control only;
-- do not re-run it manually on the same project.

alter table public.merchants
  add column if not exists is_archived boolean not null default false,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.users(id) on delete set null,
  add column if not exists archive_reason text;

create or replace view public.admin_active_merchants_readable
with (security_invoker = true)
as
select readable.*
from public.admin_merchants_readable readable
join public.merchants m on m.id = readable.id
where not m.is_archived;

grant select on public.admin_active_merchants_readable to authenticated, service_role;

create or replace function public.admin_upsert_city_location_as(
  p_actor_id uuid,
  p_id uuid,
  p_place_kind text,
  p_country_ar text,
  p_country_en text,
  p_name_ar text,
  p_name_en text,
  p_governorate_ar text,
  p_governorate_en text,
  p_currency_code text,
  p_currency_name_ar text,
  p_currency_name_en text,
  p_display_order integer,
  p_is_active boolean
)
returns public.cities
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_kind text := lower(btrim(coalesce(p_place_kind, 'city')));
  v_country_ar text := btrim(coalesce(p_country_ar, ''));
  v_country_en text := btrim(coalesce(p_country_en, ''));
  v_name_ar text := btrim(coalesce(p_name_ar, ''));
  v_name_en text := btrim(coalesce(p_name_en, ''));
  v_governorate_ar text := btrim(coalesce(p_governorate_ar, ''));
  v_governorate_en text := btrim(coalesce(p_governorate_en, ''));
  v_before public.cities%rowtype;
  v_after public.cities%rowtype;
  v_duplicate_id uuid;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;

  if v_kind not in ('country', 'governorate', 'city') then
    raise exception 'invalid_location_kind';
  end if;
  if v_country_ar = '' then raise exception 'country_required'; end if;
  if v_country_en = '' then v_country_en := v_country_ar; end if;

  if v_kind = 'country' then
    v_name_ar := v_country_ar;
    v_name_en := v_country_en;
    v_governorate_ar := '__country__';
    v_governorate_en := '__country__';
  elsif v_kind = 'governorate' then
    if v_governorate_ar = '' then v_governorate_ar := v_name_ar; end if;
    if v_governorate_ar = '' then raise exception 'governorate_required'; end if;
    if v_governorate_en = '' then v_governorate_en := coalesce(nullif(v_name_en, ''), v_governorate_ar); end if;
    v_name_ar := v_governorate_ar;
    v_name_en := v_governorate_en;
  else
    if v_governorate_ar = '' then raise exception 'governorate_required'; end if;
    if v_governorate_en = '' then v_governorate_en := v_governorate_ar; end if;
    if v_name_ar = '' then raise exception 'city_required'; end if;
    if v_name_en = '' then v_name_en := v_name_ar; end if;
  end if;

  select c.id into v_duplicate_id
  from public.cities c
  where (p_id is null or c.id <> p_id)
    and private.saarly_offer_match_key(c.country_ar) = private.saarly_offer_match_key(v_country_ar)
    and private.saarly_offer_match_key(c.governorate_ar) = private.saarly_offer_match_key(v_governorate_ar)
    and private.saarly_offer_match_key(c.name_ar) = private.saarly_offer_match_key(v_name_ar)
  limit 1;
  if v_duplicate_id is not null then raise exception 'location_already_exists'; end if;

  if p_id is null then
    insert into public.cities(
      country_ar, country_en, name_ar, name_en, governorate_ar, governorate_en,
      currency_code, currency_name_ar, currency_name_en, display_order, is_active
    ) values (
      v_country_ar, v_country_en, v_name_ar, v_name_en, v_governorate_ar, v_governorate_en,
      upper(coalesce(nullif(btrim(p_currency_code), ''), 'EGP')),
      coalesce(nullif(btrim(p_currency_name_ar), ''), 'جنيه مصري'),
      coalesce(nullif(btrim(p_currency_name_en), ''), 'Egyptian pound'),
      greatest(coalesce(p_display_order, 0), 0), coalesce(p_is_active, true)
    ) returning * into v_after;

    insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
    values (p_actor_id, 'create_city_location', 'cities', v_after.id::text, null, to_jsonb(v_after));
  else
    select * into v_before from public.cities where id = p_id for update;
    if not found then raise exception 'location_not_found'; end if;

    update public.cities
    set country_ar = v_country_ar,
        country_en = v_country_en,
        name_ar = v_name_ar,
        name_en = v_name_en,
        governorate_ar = v_governorate_ar,
        governorate_en = v_governorate_en,
        currency_code = upper(coalesce(nullif(btrim(p_currency_code), ''), currency_code, 'EGP')),
        currency_name_ar = coalesce(nullif(btrim(p_currency_name_ar), ''), currency_name_ar, 'جنيه مصري'),
        currency_name_en = coalesce(nullif(btrim(p_currency_name_en), ''), currency_name_en, 'Egyptian pound'),
        display_order = greatest(coalesce(p_display_order, 0), 0),
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning * into v_after;

    insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
    values (p_actor_id, 'update_city_location', 'cities', p_id::text, to_jsonb(v_before), to_jsonb(v_after));
  end if;

  return v_after;
end;
$function$;

revoke all on function public.admin_upsert_city_location_as(uuid,uuid,text,text,text,text,text,text,text,text,text,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.admin_upsert_city_location_as(uuid,uuid,text,text,text,text,text,text,text,text,text,text,integer,boolean) to service_role;

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
  v_has_history boolean;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then
    raise exception 'admin_permission_required';
  end if;
  if length(v_reason) < 3 then raise exception 'reason_required'; end if;

  select * into v_merchant
  from public.merchants
  where id = p_merchant_id
  for update;
  if not found then raise exception 'merchant_not_found'; end if;

  select count(*) into v_order_count from public.orders where merchant_id = p_merchant_id;
  select count(*) into v_fulfillment_count from public.order_merchant_fulfillments where merchant_id = p_merchant_id;
  select count(*) into v_payment_count from public.payment_transactions where merchant_id = p_merchant_id;
  select count(*) into v_commission_count from public.merchant_commissions where merchant_id = p_merchant_id;
  v_has_history := v_order_count + v_fulfillment_count + v_payment_count + v_commission_count > 0;

  if not v_has_history then
    insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
    values (p_actor_id, 'delete_merchant', 'merchants', p_merchant_id::text, to_jsonb(v_merchant), jsonb_build_object('deleted', true, 'reason', v_reason));

    update public.users set role = 'buyer'::public.app_role, updated_at = now()
    where id = v_merchant.user_id and role = 'merchant'::public.app_role;
    delete from public.merchants where id = p_merchant_id;

    return jsonb_build_object('id', p_merchant_id, 'user_id', v_merchant.user_id, 'deleted', true, 'archived', false);
  end if;

  update public.merchants
  set is_archived = true,
      archived_at = now(),
      archived_by = p_actor_id,
      archive_reason = v_reason,
      manually_suspended_at = coalesce(manually_suspended_at, now()),
      suspended_by = p_actor_id,
      suspension_reason = 'تم حذف المتجر من النظام التشغيلي: ' || v_reason,
      approval_status = 'rejected'::public.approval_status,
      rejection_reason = 'تم حذف المتجر من النظام التشغيلي: ' || v_reason,
      founder_badge_enabled = false,
      trusted_badge_enabled = false,
      updated_at = now()
  where id = p_merchant_id;

  update public.products set is_active = false, updated_at = now() where merchant_id = p_merchant_id;
  update public.branches
  set approval_status = 'rejected'::public.approval_status,
      rejection_reason = 'المتجر الرئيسي محذوف من النظام التشغيلي',
      delivery_enabled = false,
      craftsman_available = false,
      updated_at = now()
  where merchant_id = p_merchant_id;
  update public.merchant_staff_members set is_active = false, updated_at = now() where merchant_id = p_merchant_id;
  update public.users set role = 'buyer'::public.app_role, updated_at = now()
  where id = v_merchant.user_id and role = 'merchant'::public.app_role;

  insert into public.audit_logs(actor_id, action, target_table, target_id, old_data, new_data)
  values (
    p_actor_id, 'archive_merchant_with_history', 'merchants', p_merchant_id::text,
    to_jsonb(v_merchant),
    jsonb_build_object(
      'archived', true, 'reason', v_reason,
      'orders_count', v_order_count,
      'fulfillments_count', v_fulfillment_count,
      'payment_count', v_payment_count,
      'commission_count', v_commission_count
    )
  );

  return jsonb_build_object(
    'id', p_merchant_id,
    'user_id', v_merchant.user_id,
    'deleted', true,
    'archived', true,
    'history_preserved', true,
    'orders_count', v_order_count,
    'fulfillments_count', v_fulfillment_count,
    'payment_count', v_payment_count,
    'commission_count', v_commission_count
  );
end;
$function$;

revoke all on function public.admin_delete_merchant_as(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_delete_merchant_as(uuid,uuid,text) to service_role;
