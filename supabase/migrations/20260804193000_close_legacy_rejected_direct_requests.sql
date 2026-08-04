update public.rfq_requests r
set status = 'closed'::public.rfq_status,
    updated_at = now()
where r.delivery_type = 'direct'::public.quote_request_delivery_type
  and r.status = 'open'::public.rfq_status
  and exists (
    select 1 from public.rfq_responses rr
    where rr.rfq_request_id = r.id
      and rr.status = 'rejected'::public.rfq_response_status
  )
  and not exists (
    select 1 from public.rfq_responses rr
    where rr.rfq_request_id = r.id
      and rr.status = 'submitted'::public.rfq_response_status
  );
