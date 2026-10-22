-- Notifications: "@sam liked your Peri-Salted Chips", "@sam commented: …",
-- "@sam started following you". Each one is a row for the person it is for; the
-- app shows them under the bell on the Feed. If the person's phone has
-- registered for push notifications, the same message is also sent to their
-- lock screen through Expo's free push service.

create extension if not exists pg_net;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,   -- who it's for
  actor_id uuid not null references public.profiles on delete cascade,  -- who did it
  kind text not null check (kind in ('like', 'comment', 'follow')),
  review_id uuid references public.reviews on delete cascade,
  comment_id uuid references public.review_comments on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_inbox on public.notifications (user_id, created_at desc);
alter table public.notifications enable row level security;
create policy "see your own notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "mark your own notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "clear your own notifications" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Phones that want push notifications (one person can have several).
create table public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles on delete cascade,
  updated_at timestamptz not null default now()
);
create index push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy "remove your own phone" on public.push_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- The app calls this after sign-in. A phone belongs to whoever signed in on it last.
create function public.register_push_token(push_token text) returns void
language sql security definer set search_path = '' as $$
  insert into public.push_tokens (token, user_id) values (push_token, (select auth.uid()))
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
$$;
revoke execute on function public.register_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;

-- Create the notification row. Nobody is notified about their own actions, or by
-- someone they have blocked.
create function public.notify(recipient uuid, actor uuid, what text, rid uuid, cid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if recipient is null or recipient = actor then return; end if;
  if exists (select 1 from public.blocks b where b.blocker_id = recipient and b.blocked_id = actor) then return; end if;
  insert into public.notifications (user_id, actor_id, kind, review_id, comment_id) values (recipient, actor, what, rid, cid);
end;
$$;

create function public.notify_like() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select r.user_id from public.reviews r where r.id = new.review_id), new.user_id, 'like', new.review_id, null);
  else
    -- Unliked: take the notification back if it hasn't been seen yet.
    delete from public.notifications n
    where n.kind = 'like' and n.review_id = old.review_id and n.actor_id = old.user_id and n.read_at is null;
  end if;
  return null;
end;
$$;
create trigger notify_like after insert or delete on public.review_likes
  for each row execute function public.notify_like();

create function public.notify_comment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify((select r.user_id from public.reviews r where r.id = new.review_id), new.user_id, 'comment', new.review_id, new.id);
  return null;
end;
$$;
create trigger notify_comment after insert on public.review_comments
  for each row execute function public.notify_comment();

create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.following_id, new.follower_id, 'follow', null, null);
  else
    delete from public.notifications n
    where n.kind = 'follow' and n.user_id = old.following_id and n.actor_id = old.follower_id and n.read_at is null;
  end if;
  return null;
end;
$$;
create trigger notify_follow after insert or delete on public.follows
  for each row execute function public.notify_follow();

-- Send each new notification to the person's phones through Expo's push service.
-- A failure here never stops the like, comment or follow from saving.
create function public.send_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who text;
  dish text;
  said text;
  msg text;
  messages jsonb;
begin
  select '@' || p.username into who from public.profiles p where p.id = new.actor_id;
  select d.name into dish from public.reviews r join public.dishes d on d.id = r.dish_id where r.id = new.review_id;
  select left(c.body, 80) into said from public.review_comments c where c.id = new.comment_id;
  msg := case new.kind
    when 'like' then who || ' liked your ' || coalesce(dish, 'review')
    when 'comment' then who || ' commented on your ' || coalesce(dish, 'review') || ': ' || coalesce(said, '')
    else who || ' started following you'
  end;
  select jsonb_agg(jsonb_build_object(
    'to', t.token, 'title', 'Foodalise', 'body', msg, 'sound', 'default',
    'data', jsonb_build_object('kind', new.kind, 'review_id', new.review_id, 'actor_id', new.actor_id)))
  into messages
  from public.push_tokens t where t.user_id = new.user_id;
  if messages is null then return null; end if;
  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    body := messages,
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
  );
  return null;
exception when others then
  return null;
end;
$$;
create trigger send_push after insert on public.notifications
  for each row execute function public.send_push();

-- Unread count for the bell.
create function public.unread_notifications() returns integer
language sql stable set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = (select auth.uid()) and read_at is null;
$$;
