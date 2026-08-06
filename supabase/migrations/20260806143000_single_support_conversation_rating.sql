-- One active support complaint per user, user-controlled closing, and post-chat rating.

-- Keep the most recently active complaint and archive older simultaneous ones.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by updated_at desc, created_at desc, id desc
    ) as position
  from public.chat_conversations
  where status <> 'closed'::public.support_chat_status
)
update public.chat_conversations c
set status = 'closed'::public.support_chat_status,
    closed_at = coalesce(c.closed_at, now()),
    closed_reason = coalesce(c.closed_reason, 'consolidated_to_single_active_complaint'),
    updated_at = now()
from ranked r
where c.id = r.id
  and r.position > 1;

create unique index if not exists chat_conversations_one_open_per_user_idx
  on public.chat_conversations (user_id)
  where status <> 'closed'::public.support_chat_status;

create or replace function public.create_support_conversation(
  p_title text,
  p_locale text default 'ar'::text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_locale text := case when p_locale = 'en' then 'en' else 'ar' end;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select c.id
    into v_conversation_id
  from public.chat_conversations c
  where c.user_id = v_user_id
    and c.status <> 'closed'::public.support_chat_status
  order by c.updated_at desc
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  if char_length(v_title) < 15 then
    raise exception 'support_title_too_short';
  end if;

  insert into public.chat_conversations (
    user_id,
    status,
    title,
    locale,
    last_message_at
  ) values (
    v_user_id,
    'bot'::public.support_chat_status,
    v_title,
    v_locale,
    now()
  )
  returning id into v_conversation_id;

  insert into public.chat_messages (
    conversation_id,
    sender_type,
    body,
    metadata
  ) values (
    v_conversation_id,
    'bot'::public.chat_sender_type,
    case
      when v_locale = 'en'
        then 'Welcome to Saarly support. Write the details of your complaint and we will help you.'
      else 'مرحبًا بك في دعم سعرلي. اكتب تفاصيل شكواك وسنعمل على مساعدتك.'
    end,
    jsonb_build_object('kind', 'support_greeting')
  );

  return v_conversation_id;
exception
  when unique_violation then
    select c.id
      into v_conversation_id
    from public.chat_conversations c
    where c.user_id = v_user_id
      and c.status <> 'closed'::public.support_chat_status
    order by c.updated_at desc
    limit 1;
    if v_conversation_id is null then raise; end if;
    return v_conversation_id;
end;
$function$;

create or replace function public.close_my_support_conversation(
  p_conversation_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_locale text;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  select case when c.locale = 'en' then 'en' else 'ar' end
    into v_locale
  from public.chat_conversations c
  where c.id = p_conversation_id
    and c.user_id = v_user_id
  for update;

  if v_locale is null then
    raise exception 'support_conversation_not_found' using errcode = '42501';
  end if;

  update public.chat_conversations
  set status = 'closed'::public.support_chat_status,
      closed_at = coalesce(closed_at, now()),
      closed_reason = coalesce(closed_reason, 'closed_by_user'),
      updated_at = now(),
      last_message_at = now()
  where id = p_conversation_id
    and status <> 'closed'::public.support_chat_status;

  if found then
    insert into public.chat_messages (
      conversation_id,
      sender_type,
      body,
      metadata
    ) values (
      p_conversation_id,
      'system'::public.chat_sender_type,
      case
        when v_locale = 'en' then 'The user ended this support conversation.'
        else 'أنهى المستخدم محادثة الدعم.'
      end,
      jsonb_build_object('kind', 'conversation_closed_by_user')
    );
  end if;

  return p_conversation_id;
end;
$function$;

grant execute on function public.close_my_support_conversation(uuid) to authenticated;
revoke all on function public.close_my_support_conversation(uuid) from anon;

create table if not exists public.support_conversation_ratings (
  id uuid primary key default extensions.gen_random_uuid(),
  conversation_id uuid not null unique references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  sentiment text not null check (sentiment in ('positive', 'negative')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_conversation_ratings enable row level security;

revoke all on table public.support_conversation_ratings from anon, authenticated;
grant select on table public.support_conversation_ratings to authenticated;

drop policy if exists support_ratings_select_own_or_staff on public.support_conversation_ratings;
create policy support_ratings_select_own_or_staff
on public.support_conversation_ratings
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin()
  or private.is_active_support_agent(auth.uid())
);

create or replace function public.submit_my_support_conversation_rating(
  p_conversation_id uuid,
  p_stars integer,
  p_sentiment text,
  p_comment text default null
)
returns public.support_conversation_ratings
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_sentiment text := lower(btrim(coalesce(p_sentiment, '')));
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_result public.support_conversation_ratings;
begin
  if v_user_id is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if p_stars not between 1 and 5 then
    raise exception 'support_rating_stars_invalid';
  end if;
  if v_sentiment not in ('positive', 'negative') then
    raise exception 'support_rating_sentiment_invalid';
  end if;
  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'support_rating_comment_too_long';
  end if;
  if not exists (
    select 1
    from public.chat_conversations c
    where c.id = p_conversation_id
      and c.user_id = v_user_id
      and c.status = 'closed'::public.support_chat_status
  ) then
    raise exception 'closed_support_conversation_not_found' using errcode = '42501';
  end if;

  insert into public.support_conversation_ratings (
    conversation_id,
    user_id,
    stars,
    sentiment,
    comment
  ) values (
    p_conversation_id,
    v_user_id,
    p_stars,
    v_sentiment,
    v_comment
  )
  on conflict (conversation_id) do update
  set stars = excluded.stars,
      sentiment = excluded.sentiment,
      comment = excluded.comment,
      updated_at = now()
  where public.support_conversation_ratings.user_id = v_user_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'support_rating_update_denied' using errcode = '42501';
  end if;
  return v_result;
end;
$function$;

grant execute on function public.submit_my_support_conversation_rating(uuid, integer, text, text) to authenticated;
revoke all on function public.submit_my_support_conversation_rating(uuid, integer, text, text) from anon;
