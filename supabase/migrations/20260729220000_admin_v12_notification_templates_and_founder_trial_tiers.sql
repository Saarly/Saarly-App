-- Already applied to production project fyffdppaujafpalzdcsa on 2026-07-29.
-- Kept here so the repository remains the source of truth.
create table if not exists public.admin_notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  audience text not null default 'all' check (audience in ('all','buyers','merchants','specific')),
  title_ar text not null,
  title_en text not null default '',
  body_ar text not null,
  body_en text not null default '',
  destination_id text not null default 'buyer_orders',
  deep_link text not null default 'saarly://buyer/orders',
  target_country_ar text,
  target_governorate_ar text,
  target_city_ar text,
  user_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists admin_notification_templates_name_unique
  on public.admin_notification_templates (lower(name));
create index if not exists admin_notification_templates_updated_at_idx
  on public.admin_notification_templates (updated_at desc);
alter table public.admin_notification_templates enable row level security;
revoke all on public.admin_notification_templates from anon, authenticated;

update public.feature_flags
set configuration = coalesce(configuration, '{}'::jsonb) || jsonb_build_object(
  'founder_trial_tiers',
  coalesce(configuration->'founder_trial_tiers', jsonb_build_array(
    jsonb_build_object('from', 1, 'to', coalesce((configuration->>'founder_limit')::int, 100), 'days', coalesce((configuration->>'founder_free_days')::int, 180)),
    jsonb_build_object('from', coalesce((configuration->>'founder_limit')::int, 100) + 1, 'to', null, 'days', coalesce((configuration->>'standard_free_days')::int, 60))
  ))
), updated_at = now()
where key = 'monetization_enabled';

create or replace function private.founder_trial_days_for_number(p_founder_number integer)
returns integer language plpgsql stable security definer set search_path = '' as $function$
declare v_configuration jsonb := '{}'::jsonb; v_tier jsonb; v_days integer;
begin
  if p_founder_number is null or p_founder_number < 1 then return 0; end if;
  select coalesce(configuration, '{}'::jsonb) into v_configuration
  from public.feature_flags where key = 'monetization_enabled';
  for v_tier in select value from jsonb_array_elements(coalesce(v_configuration->'founder_trial_tiers', '[]'::jsonb))
                order by coalesce((value->>'from')::integer, 1)
  loop
    if p_founder_number >= coalesce((v_tier->>'from')::integer, 1)
       and ((v_tier->>'to') is null or p_founder_number <= (v_tier->>'to')::integer) then
      return greatest(0, coalesce((v_tier->>'days')::integer, 0));
    end if;
  end loop;
  if p_founder_number <= coalesce((v_configuration->>'founder_limit')::integer, 100) then
    return greatest(0, coalesce((v_configuration->>'founder_free_days')::integer, 180));
  end if;
  return greatest(0, coalesce((v_configuration->>'standard_free_days')::integer, 60));
end;
$function$;

create or replace function private.apply_founder_trial_tier_on_assignment()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_days integer; v_start timestamptz;
begin
  if new.founder_number is null then return new; end if;
  v_days := private.founder_trial_days_for_number(new.founder_number);
  v_start := coalesce(new.founder_number_assigned_at, new.free_trial_starts_at, now());
  update public.merchants
  set free_trial_starts_at = coalesce(free_trial_starts_at, v_start),
      free_trial_ends_at = v_start + make_interval(days => v_days), updated_at = now()
  where id = new.id;
  return new;
end;
$function$;

drop trigger if exists merchants_founder_trial_tier_after_insert on public.merchants;
create trigger merchants_founder_trial_tier_after_insert after insert on public.merchants
for each row when (new.founder_number is not null)
execute function private.apply_founder_trial_tier_on_assignment();
drop trigger if exists merchants_founder_trial_tier_after_assignment on public.merchants;
create trigger merchants_founder_trial_tier_after_assignment after update of founder_number on public.merchants
for each row when (old.founder_number is null and new.founder_number is not null)
execute function private.apply_founder_trial_tier_on_assignment();

update public.notifications
set title_ar = translate(title_ar, U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670', ''),
    body_ar = translate(body_ar, U&'\0640\064B\064C\064D\064E\064F\0650\0651\0652\0653\0654\0655\0656\0657\0658\0659\065A\065B\065C\065D\065E\065F\0670', '')
where type = 'admin_broadcast'
  and (title_ar ~ '[ًٌٍَُِّْـ]' or body_ar ~ '[ًٌٍَُِّْـ]');
