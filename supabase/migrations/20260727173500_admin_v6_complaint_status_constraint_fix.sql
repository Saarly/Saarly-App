-- Keep complaint status transitions compatible with the existing escalation constraint.
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
  values (p_actor_id, 'set_support_complaint_status', 'support_complaints', p_complaint_id::text, to_jsonb(v_before), to_jsonb(v_after));

  return v_after;
end;
$function$;

revoke all on function public.admin_set_support_complaint_status_as(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_support_complaint_status_as(uuid, uuid, text) to service_role;
