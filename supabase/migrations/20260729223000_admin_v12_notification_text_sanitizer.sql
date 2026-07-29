-- Already applied to production project fyffdppaujafpalzdcsa on 2026-07-29.
create unique index if not exists admin_notification_templates_name_exact_unique
  on public.admin_notification_templates (name);

create or replace function private.sanitize_admin_broadcast_text()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.type = 'admin_broadcast' then
    new.title_ar := btrim(regexp_replace(translate(coalesce(new.title_ar, ''), U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670\200B\200C\200D\200E\200F\FEFF', ''), '[[:space:]]+', ' ', 'g'));
    new.body_ar := btrim(regexp_replace(translate(coalesce(new.body_ar, ''), U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670\200B\200C\200D\200E\200F\FEFF', ''), '[[:space:]]+', ' ', 'g'));
    new.title_en := btrim(regexp_replace(translate(coalesce(new.title_en, ''), U&'\200B\200C\200D\200E\200F\FEFF', ''), '[[:space:]]+', ' ', 'g'));
    new.body_en := btrim(regexp_replace(translate(coalesce(new.body_en, ''), U&'\200B\200C\200D\200E\200F\FEFF', ''), '[[:space:]]+', ' ', 'g'));
  end if;
  return new;
end;
$function$;

drop trigger if exists notifications_sanitize_admin_broadcast on public.notifications;
create trigger notifications_sanitize_admin_broadcast
before insert or update of title_ar, title_en, body_ar, body_en, type
on public.notifications
for each row execute function private.sanitize_admin_broadcast_text();
