-- Already applied to production project fyffdppaujafpalzdcsa on 2026-07-29.
create or replace function public.admin_apply_founder_trial_tiers_as(p_actor_id uuid)
returns integer language plpgsql security definer set search_path = '' as $function$
declare v_count integer := 0;
begin
  if p_actor_id is null or not private.is_admin_user(p_actor_id) then raise exception 'admin_permission_required'; end if;
  update public.merchants m
  set free_trial_starts_at = coalesce(m.free_trial_starts_at, m.founder_number_assigned_at, now()),
      free_trial_ends_at = greatest(coalesce(m.admin_extension_until, '-infinity'::timestamptz),
        coalesce(m.founder_number_assigned_at, m.free_trial_starts_at, now()) + make_interval(days => private.founder_trial_days_for_number(m.founder_number))),
      updated_at = now()
  where m.founder_number is not null and not coalesce(m.is_test_account, false) and m.free_trial_stopped_at is null;
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id, action, target_table, target_id, new_data)
  values (p_actor_id, 'apply_founder_trial_tiers', 'merchants', 'founder_numbered', jsonb_build_object('updated_merchants', v_count));
  return v_count;
end;
$function$;
revoke all on function public.admin_apply_founder_trial_tiers_as(uuid) from public;
grant execute on function public.admin_apply_founder_trial_tiers_as(uuid) to authenticated, service_role;
