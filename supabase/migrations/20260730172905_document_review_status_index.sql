create index if not exists merchant_documents_current_review_lookup_idx
  on public.merchant_documents (merchant_id, branch_id, kind, status)
  where superseded_by is null;
