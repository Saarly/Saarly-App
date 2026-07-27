-- Reliable exact lookup for admin team account creation.
-- Service-role only: prevents exposing auth.users to browser clients.
create or replace function public.admin_auth_user_lookup_by_email_as(p_email text)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select case
    when u.id is null then null
    else jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'phone', u.phone,
      'app_metadata', coalesce(u.raw_app_meta_data, '{}'::jsonb),
      'user_metadata', coalesce(u.raw_user_meta_data, '{}'::jsonb),
      'deleted_at', u.deleted_at
    )
  end
  from (select 1) seed
  left join lateral (
    select au.id, au.email, au.phone, au.raw_app_meta_data, au.raw_user_meta_data, au.deleted_at
    from auth.users au
    where lower(btrim(coalesce(au.email, ''))) = lower(btrim(coalesce(p_email, '')))
    order by (au.deleted_at is null) desc, au.updated_at desc
    limit 1
  ) u on true;
$function$;

revoke all on function public.admin_auth_user_lookup_by_email_as(text) from public, anon, authenticated;
grant execute on function public.admin_auth_user_lookup_by_email_as(text) to service_role;
