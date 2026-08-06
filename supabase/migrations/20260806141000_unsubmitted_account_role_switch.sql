create or replace function public.set_my_unsubmitted_account_role(p_role text)
returns public.users
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_target_role text := lower(btrim(coalesce(p_role, '')));
  v_user public.users%rowtype;
begin
  if v_user_id is null then
    raise exception 'missing_session' using errcode = '42501';
  end if;
  if v_target_role not in ('buyer', 'merchant') then
    raise exception 'unsupported_profile_role';
  end if;

  select * into v_user
  from public.users
  where id = v_user_id
  for update;

  if v_user.id is null then
    raise exception 'profile_not_found';
  end if;
  if v_user.role in ('admin'::public.app_role, 'support_agent'::public.app_role) then
    raise exception 'profile_role_change_not_allowed';
  end if;
  if v_user.role::text = v_target_role then
    return v_user;
  end if;

  -- Account type can only be corrected before either side of the account has
  -- created real work or submitted a merchant registration for admin review.
  if exists (
    select 1 from public.merchants m where m.user_id = v_user_id
  ) or exists (
    select 1 from public.quote_requests q where q.buyer_id = v_user_id
  ) or exists (
    select 1 from public.orders o where o.buyer_id = v_user_id
  ) then
    raise exception 'account_type_already_committed';
  end if;

  update public.users
  set role = v_target_role::public.app_role,
      updated_at = now()
  where id = v_user_id
  returning * into v_user;

  return v_user;
end;
$function$;

revoke all on function public.set_my_unsubmitted_account_role(text) from public;
grant execute on function public.set_my_unsubmitted_account_role(text) to authenticated;
