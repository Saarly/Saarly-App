do $block$
declare
  v_response record;
  v_branch_id uuid;
begin
  for v_response in
    select rr.id, rr.rfq_request_id, rr.merchant_id
    from public.rfq_responses rr
    where rr.branch_id is null
  loop
    begin
      v_branch_id := private.resolve_rfq_response_branch(
        v_response.rfq_request_id,
        v_response.merchant_id,
        null
      );
      update public.rfq_responses
      set branch_id = v_branch_id,
          updated_at = now()
      where id = v_response.id and branch_id is null;
    exception when others then
      null;
    end;
  end loop;
end;
$block$;
