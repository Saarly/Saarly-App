-- Applied to production on 2026-07-29.
create index if not exists admin_notification_templates_created_by_idx
  on public.admin_notification_templates (created_by)
  where created_by is not null;
