create index if not exists admin_email_events_document_rejection_idx
  on public.admin_email_events (event_type, target_id, status)
  where event_type in ('merchant_document_rejected', 'branch_document_rejected');
