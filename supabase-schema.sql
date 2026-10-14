create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  background_image_url text,
  profile_status text check (char_length(profile_status) <= 120),
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists background_image_url text,
  add column if not exists profile_status text
  check (char_length(profile_status) <= 120);

create table if not exists public.user_login_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  last_login date not null
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  content text not null,
  created_at timestamptz not null default now(),
  likes_count integer not null default 0 check (likes_count >= 0)
);

alter table public.posts
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists comments_count integer not null default 0;

create table if not exists public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followed_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);

create index if not exists follows_followed_idx
  on public.follows (followed_id, created_at desc);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, recipient_id),
  check (requester_id <> recipient_id)
);

create index if not exists friend_requests_recipient_status_idx
  on public.friend_requests (recipient_id, status, created_at desc);
create index if not exists friend_requests_requester_status_idx
  on public.friend_requests (requester_id, status, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  type text not null,
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  drop constraint if exists notifications_type_allowed;
alter table public.notifications
  add constraint notifications_type_allowed
  check (type in (
    'login', 'new_member', 'like', 'comment', 'follow',
    'friend_request', 'friend_request_accepted', 'direct_message',
    'app_install'
  ));

create index if not exists notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notifications'
    ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'friend_requests'
    ) then
    alter publication supabase_realtime add table public.friend_requests;
  end if;
end;
$$;

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username text not null,
  content text not null check (char_length(content) between 1 and 2000),
  parent_comment_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.comments
  add column if not exists parent_comment_id uuid references public.comments(id) on delete cascade;

create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at asc);
create index if not exists comments_parent_created_idx
  on public.comments (parent_comment_id, created_at asc)
  where parent_comment_id is not null;

create or replace function public.validate_comment_parent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_comment_id is not null and not exists (
    select 1
    from public.comments as parent
    where parent.id = new.parent_comment_id
      and parent.post_id = new.post_id
      and parent.parent_comment_id is null
  ) then
    raise exception 'Replies must target a top-level comment on the same post';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_comment_parent_before_insert on public.comments;
create trigger validate_comment_parent_before_insert
  before insert or update of parent_comment_id, post_id
  on public.comments
  for each row execute function public.validate_comment_parent();

revoke all on function public.validate_comment_parent() from public;

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  read_at timestamptz,
  reply_to_id uuid references public.direct_messages(id) on delete set null,
  check (sender_id <> recipient_id)
);

alter table public.direct_messages
  add column if not exists edited_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists reply_to_id uuid references public.direct_messages(id) on delete set null,
  add column if not exists voice_path text,
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.direct_messages
  alter column content drop not null,
  drop constraint if exists direct_messages_content_check,
  drop constraint if exists direct_messages_voice_content_check,
  drop constraint if exists direct_messages_attachment_check;

alter table public.direct_messages
  add constraint direct_messages_voice_content_check
  check (
    (
      content is not null
      and char_length(content) between 1 and 2000
      and voice_path is null
    )
    or (
      content is null
      and voice_path is not null
      and media_path is null
      and split_part(voice_path, '/', 1) = sender_id::text
    )
    or (
      voice_path is null
      and media_path is not null
      and media_type in ('image', 'video')
      and split_part(media_path, '/', 1) = sender_id::text
      and (content is null or char_length(content) between 1 and 2000)
    )
  );

alter table public.direct_messages
  add constraint direct_messages_attachment_check
  check (
    (media_path is null and media_type is null)
    or (media_path is not null and media_type in ('image', 'video'))
  );

create table if not exists public.group_chats (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.group_chats
  add column if not exists avatar_url text;

create table if not exists public.group_chat_members (
  group_id uuid not null references public.group_chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.group_chats(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  reply_to_id uuid
);

alter table public.group_messages
  add column if not exists reply_to_id uuid;

do $$
declare
  reply_column_number smallint;
  reply_constraint record;
begin
  select attnum into reply_column_number
  from pg_attribute
  where attrelid = 'public.group_messages'::regclass
    and attname = 'reply_to_id'
    and not attisdropped;

  for reply_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.group_messages'::regclass
      and contype = 'f'
      and conkey = array[reply_column_number]::smallint[]
  loop
    execute format(
      'alter table public.group_messages drop constraint %I',
      reply_constraint.conname
    );
  end loop;

  alter table public.group_messages
    add constraint group_messages_reply_to_id_fkey
    foreign key (reply_to_id)
    references public.group_messages(id)
    on delete set null;
end;
$$;

alter table public.group_messages
  add column if not exists voice_path text,
  add column if not exists media_path text,
  add column if not exists media_type text;

alter table public.group_messages
  alter column content drop not null,
  drop constraint if exists group_messages_content_check,
  drop constraint if exists group_messages_voice_content_check,
  drop constraint if exists group_messages_attachment_check;

alter table public.group_messages
  add constraint group_messages_voice_content_check
  check (
    (
      content is not null
      and char_length(content) between 1 and 2000
      and voice_path is null
    )
    or (
      content is null
      and voice_path is not null
      and media_path is null
      and split_part(voice_path, '/', 1) = sender_id::text
    )
    or (
      voice_path is null
      and media_path is not null
      and media_type in ('image', 'video')
      and split_part(media_path, '/', 1) = sender_id::text
      and (content is null or char_length(content) between 1 and 2000)
    )
  );

alter table public.group_messages
  add constraint group_messages_attachment_check
  check (
    (media_path is null and media_type is null)
    or (media_path is not null and media_type in ('image', 'video'))
  );

create or replace function public.validate_direct_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1
    from public.direct_messages as replied
    where replied.id = new.reply_to_id
      and (
        (replied.sender_id = new.sender_id and replied.recipient_id = new.recipient_id)
        or (replied.recipient_id = new.sender_id and replied.sender_id = new.recipient_id)
      )
  ) then
    raise exception 'Reply target is not part of this conversation';
  end if;
  return new;
end;
$$;

create or replace function public.validate_group_message_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1
    from public.group_messages as replied
    where replied.id = new.reply_to_id
      and replied.group_id = new.group_id
  ) then
    raise exception 'Reply target is not part of this group';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_direct_message_reply on public.direct_messages;
create trigger validate_direct_message_reply
  before insert on public.direct_messages
  for each row execute procedure public.validate_direct_message_reply();

drop trigger if exists validate_group_message_reply on public.group_messages;
create trigger validate_group_message_reply
  before insert on public.group_messages
  for each row execute procedure public.validate_group_message_reply();

create index if not exists group_chat_members_user_idx
  on public.group_chat_members (user_id, group_id);
create index if not exists group_messages_group_created_idx
  on public.group_messages (group_id, created_at desc);

create or replace function public.mark_all_direct_messages_read()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.direct_messages
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
$$;

create or replace function public.clear_old_read_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications
  where read_at < now() - interval '5 minutes';
$$;

create or replace function public.delete_read_app_install_notification(p_notification_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notifications
  where id = p_notification_id
    and recipient_id = auth.uid()
    and type = 'app_install'
    and read_at <= now() - interval '5 minutes';
$$;

create or replace function public.cleanup_expired_messages()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.direct_messages
  where created_at < now() - interval '30 days';

  delete from public.group_messages
  where created_at < now() - interval '30 days';

  delete from public.notifications
  where read_at < now() - interval '5 minutes';
end;
$$;

revoke all on function public.mark_all_direct_messages_read() from public;
grant execute on function public.mark_all_direct_messages_read() to authenticated;
revoke all on function public.clear_old_read_notifications() from public;
grant execute on function public.clear_old_read_notifications() to authenticated;
revoke all on function public.delete_read_app_install_notification(uuid) from public;
grant execute on function public.delete_read_app_install_notification(uuid) to authenticated;
revoke all on function public.cleanup_expired_messages() from public;
grant execute on function public.cleanup_expired_messages() to authenticated;

create index if not exists direct_messages_sender_created_idx
  on public.direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_recipient_created_idx
  on public.direct_messages (recipient_id, created_at desc);
create index if not exists direct_messages_retention_idx
  on public.direct_messages (created_at);
create index if not exists group_messages_retention_idx
  on public.group_messages (created_at);
create index if not exists notifications_read_at_retention_idx
  on public.notifications (read_at)
  where read_at is not null;

create table if not exists public.direct_message_reactions (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🔥', '😮')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '😂', '🔥', '😮')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.direct_message_reactions
  drop constraint if exists direct_message_reactions_emoji_check;
alter table public.direct_message_reactions
  add constraint direct_message_reactions_emoji_check
  check (char_length(emoji) between 1 and 16);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'direct_messages'
    ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_message_reactions'
    ) then
    alter publication supabase_realtime add table public.direct_message_reactions;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'group_messages'
    ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'group_message_reactions'
    ) then
    alter publication supabase_realtime add table public.group_message_reactions;
  end if;
end;
$$;

update public.posts as posts
set comments_count = (
  select count(*)::integer
  from public.comments as comments
  where comments.post_id = posts.id
)
where posts.comments_count <> (
  select count(*)::integer
  from public.comments as comments
  where comments.post_id = posts.id
);

alter table public.profiles enable row level security;
alter table public.user_login_streaks enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.follows enable row level security;
alter table public.friend_requests enable row level security;
alter table public.notifications enable row level security;
alter table public.comments enable row level security;
alter table public.direct_messages enable row level security;
alter table public.direct_message_reactions enable row level security;
alter table public.group_chats enable row level security;
alter table public.group_chat_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_message_reactions enable row level security;

grant select on public.profiles to authenticated;
grant insert (id, username, avatar_url, background_image_url, profile_status) on public.profiles to authenticated;
grant update (username, avatar_url, background_image_url, profile_status) on public.profiles to authenticated;
revoke all on public.user_login_streaks from anon, authenticated;
grant select, insert, delete on public.posts to authenticated;
grant select on public.post_likes to authenticated;
grant select on public.follows to authenticated;
grant select on public.friend_requests to authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant select, insert on public.comments to authenticated;
grant select, insert, update (content, edited_at), delete on public.direct_messages to authenticated;
grant select, insert, update (emoji), delete on public.direct_message_reactions to authenticated;
grant select, insert, update (emoji), delete on public.group_message_reactions to authenticated;
grant select, insert, delete on public.group_chats to authenticated;
grant update (avatar_url) on public.group_chats to authenticated;
grant select, insert, delete on public.group_chat_members to authenticated;
grant select, insert, delete on public.group_messages to authenticated;
drop policy if exists "Profiles are readable by authenticated users" on public.profiles;
create policy "Profiles are readable by authenticated users"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Posts are readable by authenticated users" on public.posts;
create policy "Posts are readable by authenticated users"
  on public.posts for select to authenticated using (true);

drop policy if exists "Users can create their own posts" on public.posts;
create policy "Users can create their own posts"
  on public.posts for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read their own likes" on public.post_likes;
create policy "Users can read their own likes"
  on public.post_likes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read follows they created" on public.follows;
create policy "Users can read follows they created"
  on public.follows for select to authenticated
  using (auth.uid() = follower_id);

drop policy if exists "Users can read friend requests they participate in" on public.friend_requests;
create policy "Users can read friend requests they participate in"
  on public.friend_requests for select to authenticated
  using (auth.uid() = requester_id or auth.uid() = recipient_id);

drop policy if exists "Users can read their own notifications" on public.notifications;
create policy "Users can read their own notifications"
  on public.notifications for select to authenticated
  using (auth.uid() = recipient_id);

drop policy if exists "Users can mark their own notifications read" on public.notifications;
create policy "Users can mark their own notifications read"
  on public.notifications for update to authenticated
  using (auth.uid() = recipient_id)
  with check (auth.uid() = recipient_id);

drop policy if exists "Comments are readable by authenticated users" on public.comments;
create policy "Comments are readable by authenticated users"
  on public.comments for select to authenticated using (true);

drop policy if exists "Users can create their own comments" on public.comments;
create policy "Users can create their own comments"
  on public.comments for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Participants can read their direct messages" on public.direct_messages;
create policy "Participants can read their direct messages"
  on public.direct_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "Users can send direct messages as themselves" on public.direct_messages;
create policy "Users can send direct messages as themselves"
  on public.direct_messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and auth.uid() <> recipient_id
  );

drop policy if exists "Senders can edit their own direct messages" on public.direct_messages;
create policy "Senders can edit their own direct messages"
  on public.direct_messages for update to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

drop policy if exists "Senders can delete their own direct messages" on public.direct_messages;
create policy "Senders can delete their own direct messages"
  on public.direct_messages for delete to authenticated
  using (auth.uid() = sender_id);

drop policy if exists "Participants can read direct message reactions" on public.direct_message_reactions;
create policy "Participants can read direct message reactions"
  on public.direct_message_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.direct_messages as message
      where message.id = message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
    )
  );

drop policy if exists "Participants can react to direct messages" on public.direct_message_reactions;
create policy "Participants can react to direct messages"
  on public.direct_message_reactions for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.direct_messages as message
      where message.id = message_id
        and (auth.uid() = message.sender_id or auth.uid() = message.recipient_id)
    )
  );

drop policy if exists "Users can update their own direct message reactions" on public.direct_message_reactions;
create policy "Users can update their own direct message reactions"
  on public.direct_message_reactions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own direct message reactions" on public.direct_message_reactions;
create policy "Users can delete their own direct message reactions"
  on public.direct_message_reactions for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Group members can read their groups" on public.group_chats;
create policy "Group members can read their groups"
  on public.group_chats for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.group_chat_members as member
      where member.group_id = group_chats.id and member.user_id = auth.uid()
    )
  );

drop policy if exists "Users can create groups" on public.group_chats;
create policy "Users can create groups"
  on public.group_chats for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Group creators can update their group picture" on public.group_chats;
create policy "Group creators can update their group picture"
  on public.group_chats for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists "Group creators can delete their groups" on public.group_chats;
create policy "Group creators can delete their groups"
  on public.group_chats for delete to authenticated
  using (created_by = auth.uid());

drop policy if exists "Group members can read membership" on public.group_chat_members;
create policy "Group members can read membership"
  on public.group_chat_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Group creator can add members" on public.group_chat_members;
create policy "Group creator can add members"
  on public.group_chat_members for insert to authenticated
  with check (exists (
    select 1 from public.group_chats as chat
    where chat.id = group_id and chat.created_by = auth.uid()
  ));

drop policy if exists "Users can leave groups" on public.group_chat_members;
create policy "Users can leave groups"
  on public.group_chat_members for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Group members can read group messages" on public.group_messages;
create policy "Group members can read group messages"
  on public.group_messages for select to authenticated
  using (exists (
    select 1 from public.group_chat_members as member
    where member.group_id = group_messages.group_id and member.user_id = auth.uid()
  ));

drop policy if exists "Group members can send group messages" on public.group_messages;
create policy "Group members can send group messages"
  on public.group_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.group_chat_members as member
      where member.group_id = group_messages.group_id and member.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own group messages" on public.group_messages;
create policy "Users can delete their own group messages"
  on public.group_messages for delete to authenticated
  using (sender_id = auth.uid());

drop policy if exists "Group members can read group message reactions" on public.group_message_reactions;
create policy "Group members can read group message reactions"
  on public.group_message_reactions for select to authenticated
  using (exists (
    select 1
    from public.group_messages as message
    join public.group_chat_members as member on member.group_id = message.group_id
    where message.id = group_message_reactions.message_id
      and member.user_id = auth.uid()
  ));

drop policy if exists "Group members can add their own reactions" on public.group_message_reactions;
create policy "Group members can add their own reactions"
  on public.group_message_reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.group_messages as message
      join public.group_chat_members as member on member.group_id = message.group_id
      where message.id = group_message_reactions.message_id
        and member.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their group reactions" on public.group_message_reactions;
create policy "Users can update their group reactions"
  on public.group_message_reactions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their group reactions" on public.group_message_reactions;
create policy "Users can delete their group reactions"
  on public.group_message_reactions for delete to authenticated
  using (user_id = auth.uid());

create or replace function public.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
begin
  select username into sender_name
  from public.profiles
  where id = new.sender_id;

  insert into public.notifications (recipient_id, actor_id, type, message)
  values (
    new.recipient_id,
    new.sender_id,
    'direct_message',
    coalesce(sender_name, 'A gamer') || ' sent you a message'
  );
  return new;
end;
$$;

drop trigger if exists on_direct_message_created_notify_recipient on public.direct_messages;
create trigger on_direct_message_created_notify_recipient
  after insert on public.direct_messages
  for each row execute procedure public.notify_direct_message();

create or replace function public.send_friend_request(p_recipient_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  existing_request public.friend_requests%rowtype;
  requester_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in to add a gamer';
  end if;
  if p_recipient_id = current_user_id then
    raise exception 'You cannot add yourself';
  end if;
  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'Gamer not found';
  end if;

  select * into existing_request
  from public.friend_requests
  where (
    (requester_id = current_user_id and recipient_id = p_recipient_id)
    or (requester_id = p_recipient_id and recipient_id = current_user_id)
  )
    and status in ('pending', 'accepted')
  limit 1
  for update;

  if found then
    if existing_request.status = 'accepted' then
      return jsonb_build_object('status', 'friends');
    end if;
    return jsonb_build_object(
      'status',
      case when existing_request.requester_id = current_user_id
        then 'request_sent'
        else 'request_received'
      end
    );
  end if;

  select username into requester_name
  from public.profiles
  where id = current_user_id;

  select * into existing_request
  from public.friend_requests
  where requester_id = current_user_id and recipient_id = p_recipient_id
  for update;

  if found then
    update public.friend_requests
    set status = 'pending', created_at = now(), updated_at = now()
    where id = existing_request.id;
  else
    insert into public.friend_requests (requester_id, recipient_id)
    values (current_user_id, p_recipient_id);
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message)
  values (
    p_recipient_id,
    current_user_id,
    'friend_request',
    coalesce(requester_name, 'A gamer') || ' sent you a friend request'
  );

  return jsonb_build_object('status', 'request_sent');
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_to_friend_request(p_request_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_request public.friend_requests%rowtype;
  recipient_name text;
begin
  if current_user_id is null then
    raise exception 'Sign in to respond to friend requests';
  end if;

  select * into target_request
  from public.friend_requests
  where id = p_request_id
  for update;
  if not found or target_request.recipient_id <> current_user_id then
    raise exception 'Friend request not found';
  end if;
  if target_request.status <> 'pending' then
    raise exception 'This friend request has already been handled';
  end if;

  update public.friend_requests
  set status = case when p_accept then 'accepted' else 'declined' end,
      updated_at = now()
  where id = p_request_id;

  if p_accept then
    select username into recipient_name
    from public.profiles
    where id = current_user_id;
    insert into public.notifications (recipient_id, actor_id, type, message)
    values (
      target_request.requester_id,
      current_user_id,
      'friend_request_accepted',
      coalesce(recipient_name, 'A gamer') || ' accepted your friend request'
    );
  end if;

  return jsonb_build_object(
    'status',
    case when p_accept then 'accepted' else 'declined' end
  );
end;
$$;

revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Gamer'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
    set username = excluded.username,
        avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.create_profile_for_user();

create or replace function public.notify_new_user_about_app_install()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, message)
  values (
    new.id,
    new.id,
    'app_install',
    'Install Gamer Studio on your device for quick access?'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_install_prompt on auth.users;
create trigger on_auth_user_created_app_install_prompt
  after insert on auth.users
  for each row execute procedure public.notify_new_user_about_app_install();

drop trigger if exists on_auth_user_metadata_updated on auth.users;
create trigger on_auth_user_metadata_updated
  after update of raw_user_meta_data on auth.users
  for each row execute procedure public.create_profile_for_user();

insert into public.profiles (id, username, avatar_url)
select
  auth_users.id,
  coalesce(
    nullif(auth_users.raw_user_meta_data ->> 'display_name', ''),
    nullif(auth_users.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(auth_users.email, ''), '@', 1), ''),
    'Gamer'
  ),
  auth_users.raw_user_meta_data ->> 'avatar_url'
from auth.users as auth_users
on conflict (id) do nothing;

update public.profiles as profiles
set username = coalesce(
      auth_users.raw_user_meta_data ->> 'display_name',
      auth_users.raw_user_meta_data ->> 'name',
      profiles.username
    ),
    avatar_url = coalesce(
      auth_users.raw_user_meta_data ->> 'avatar_url',
      profiles.avatar_url
    )
from auth.users as auth_users
where profiles.id = auth_users.id
  and (
    profiles.username is distinct from coalesce(
      auth_users.raw_user_meta_data ->> 'display_name',
      auth_users.raw_user_meta_data ->> 'name',
      profiles.username
    )
    or profiles.avatar_url is distinct from coalesce(
      auth_users.raw_user_meta_data ->> 'avatar_url',
      profiles.avatar_url
    )
  );

create or replace function public.search_gamers(search_term text default '')
returns table (id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    auth_users.id,
    coalesce(
      nullif(btrim(profiles.username), ''),
      nullif(btrim(auth_users.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(auth_users.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_users.email, ''), '@', 1), ''),
      'Gamer'
    ) as username,
    coalesce(profiles.avatar_url, auth_users.raw_user_meta_data ->> 'avatar_url') as avatar_url
  from auth.users as auth_users
  left join public.profiles as profiles on profiles.id = auth_users.id
  where auth.uid() is not null
    and auth_users.id <> auth.uid()
    and auth_users.last_sign_in_at is not null
    and (
      nullif(btrim(search_term), '') is null
      or position(
        lower(btrim(search_term)) in lower(concat_ws(
          ' ',
          profiles.username,
          auth_users.raw_user_meta_data ->> 'display_name',
          auth_users.raw_user_meta_data ->> 'name',
          split_part(coalesce(auth_users.email, ''), '@', 1)
        ))
      ) > 0
    )
  order by 2;
$$;

revoke all on function public.search_gamers(text) from public;
grant execute on function public.search_gamers(text) to authenticated;

create or replace function public.notify_new_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, message)
  select profiles.id, new.id, 'new_member', new.username || ' joined Gamer Studio'
  from public.profiles as profiles
  where profiles.id <> new.id;
  return new;
end;
$$;

drop trigger if exists on_profile_created_notify_members on public.profiles;
create trigger on_profile_created_notify_members
  after insert on public.profiles
  for each row execute procedure public.notify_new_member();

create or replace function public.record_login_notification()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Sign in to create a login notification';
  end if;

  insert into public.notifications (recipient_id, actor_id, type, message)
  values (current_user_id, current_user_id, 'login', 'You signed in to Gamer Studio');
end;
$$;

revoke all on function public.record_login_notification() from public;
grant execute on function public.record_login_notification() to authenticated;

create or replace function public.record_login_streak()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  streak_count integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to record a login streak';
  end if;

  insert into public.user_login_streaks (user_id, current_streak, last_login)
  values (current_user_id, 1, current_date)
  on conflict (user_id) do update
  set current_streak = case
        when public.user_login_streaks.last_login = current_date
          then public.user_login_streaks.current_streak
        when public.user_login_streaks.last_login = current_date - 1
          then public.user_login_streaks.current_streak + 1
        else 1
      end,
      last_login = current_date
  returning current_streak into streak_count;

  return streak_count;
end;
$$;

revoke all on function public.record_login_streak() from public;
grant execute on function public.record_login_streak() to authenticated;

create or replace function public.toggle_follow(p_followed_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  did_follow boolean;
  followed_username text;
begin
  if current_user_id is null then
    raise exception 'Sign in to follow gamers';
  end if;
  if p_followed_id = current_user_id then
    raise exception 'You cannot follow yourself';
  end if;

  select profiles.username into followed_username
  from public.profiles as profiles
  where profiles.id = p_followed_id
  for update;
  if not found then
    raise exception 'Gamer not found';
  end if;

  if exists (
    select 1 from public.follows
    where follower_id = current_user_id and followed_id = p_followed_id
  ) then
    delete from public.follows
    where follower_id = current_user_id and followed_id = p_followed_id;
    did_follow := false;
  else
    insert into public.follows (follower_id, followed_id)
    values (current_user_id, p_followed_id);
    did_follow := true;
    insert into public.notifications (recipient_id, actor_id, type, message)
    values (
      p_followed_id,
      current_user_id,
      'follow',
      coalesce(
        (select profiles.username from public.profiles as profiles where profiles.id = current_user_id),
        'A gamer'
      ) || ' started following you'
    );
  end if;

  return jsonb_build_object('following', did_follow);
end;
$$;

revoke all on function public.toggle_follow(uuid) from public;
grant execute on function public.toggle_follow(uuid) to authenticated;

create or replace function public.notify_comment_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.username := coalesce(
    (select profiles.username from public.profiles as profiles where profiles.id = new.user_id),
    'Gamer'
  );

  insert into public.notifications (recipient_id, actor_id, post_id, type, message)
  select posts.user_id, new.user_id, new.post_id, 'comment',
         new.username || ' commented on your post'
  from public.posts as posts
  where posts.id = new.post_id
    and posts.user_id <> new.user_id;
  return new;
end;
$$;

drop trigger if exists on_comment_created_notify_post_owner on public.comments;
create trigger on_comment_created_notify_post_owner
  before insert on public.comments
  for each row execute procedure public.notify_comment_created();

create or replace function public.increment_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.posts
  set comments_count = comments_count + 1
  where id = new.post_id;
  return new;
end;
$$;

drop trigger if exists on_comment_created_increment_post_count on public.comments;
create trigger on_comment_created_increment_post_count
  after insert on public.comments
  for each row execute procedure public.increment_post_comment_count();

create or replace function public.toggle_post_like(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  did_like boolean;
  updated_count integer;
begin
  if current_user_id is null then
    raise exception 'Sign in to like posts';
  end if;

  perform 1 from public.posts where id = p_post_id for update;
  if not found then
    raise exception 'Post not found';
  end if;

  if exists (
    select 1 from public.post_likes
    where post_id = p_post_id and user_id = current_user_id
  ) then
    delete from public.post_likes
    where post_id = p_post_id and user_id = current_user_id;
    did_like := false;
    update public.posts
      set likes_count = greatest(likes_count - 1, 0)
      where id = p_post_id
      returning likes_count into updated_count;
  else
    insert into public.post_likes (post_id, user_id)
    values (p_post_id, current_user_id);
    did_like := true;
    update public.posts
      set likes_count = likes_count + 1
      where id = p_post_id
      returning likes_count into updated_count;
    insert into public.notifications (recipient_id, actor_id, post_id, type, message)
    select posts.user_id, current_user_id, posts.id, 'like',
           coalesce(
             (select profiles.username from public.profiles as profiles where profiles.id = current_user_id),
             'Someone'
           ) || ' liked your post'
    from public.posts as posts
    where posts.id = p_post_id
      and posts.user_id <> current_user_id;
  end if;

  return jsonb_build_object('liked', did_like, 'likesCount', updated_count);
end;
$$;

revoke all on function public.toggle_post_like(uuid) from public;
grant execute on function public.toggle_post_like(uuid) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'game assets',
  'game assets',
  true,
  5242880,
  array['image/*', 'video/*']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can view game asset images" on storage.objects;
create policy "Anyone can view game asset images"
  on storage.objects for select
  using (bucket_id = 'game assets');

drop policy if exists "Users can upload their own profile images" on storage.objects;
create policy "Users can upload their own profile images"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'game assets'
    and (
      (
        (storage.foldername(name))[1] = 'profile-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'posts'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'background-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'group-pictures'
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and exists (
          select 1 from public.group_chats as chat
          where chat.id::text = (storage.foldername(name))[2]
            and chat.created_by = (select auth.uid())
        )
      )
    )
  );

drop policy if exists "Users can update their own profile images" on storage.objects;
create policy "Users can update their own profile images"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'game assets'
    and (
      (
        (storage.foldername(name))[1] = 'profile-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'posts'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'background-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'group-pictures'
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and exists (
          select 1 from public.group_chats as chat
          where chat.id::text = (storage.foldername(name))[2]
            and chat.created_by = (select auth.uid())
        )
      )
    )
  )
  with check (
    bucket_id = 'game assets'
    and (
      (
        (storage.foldername(name))[1] = 'profile-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'posts'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'group-pictures'
        and (storage.foldername(name))[3] = (select auth.uid())::text
        and exists (
          select 1 from public.group_chats as chat
          where chat.id::text = (storage.foldername(name))[2]
            and chat.created_by = (select auth.uid())
        )
      )
    )
  );

drop policy if exists "Users can delete their own profile images" on storage.objects;
create policy "Users can delete their own profile images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game assets'
    and (
      (
        (storage.foldername(name))[1] = 'profile-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'posts'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
      or (
        (storage.foldername(name))[1] = 'background-pictures'
        and (storage.foldername(name))[2] = (select auth.uid())::text
      )
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'voice-notes',
  'voice-notes',
  false,
  10485760,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'message-media',
  'message-media',
  false,
  20971520,
  array['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'video/webm', 'video/mp4', 'video/quicktime']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_read_message_media(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_object_name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.direct_messages as message
      where message.media_path = p_object_name
        and auth.uid() in (message.sender_id, message.recipient_id)
    )
    or exists (
      select 1
      from public.group_messages as message
      join public.group_chat_members as member on member.group_id = message.group_id
      where message.media_path = p_object_name
        and member.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.can_read_message_media(text) from public;
grant execute on function public.can_read_message_media(text) to authenticated;

drop policy if exists "Conversation members can read message media" on storage.objects;
create policy "Conversation members can read message media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'message-media'
    and public.can_read_message_media(name)
  );

drop policy if exists "Users can upload their own message media" on storage.objects;
create policy "Users can upload their own message media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own message media" on storage.objects;
create policy "Users can delete their own message media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'message-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Conversation members can listen to voice notes" on storage.objects;
create or replace function public.can_read_voice_note(p_object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    split_part(p_object_name, '/', 1) = auth.uid()::text
    or exists (
      select 1
      from public.direct_messages as message
      where message.voice_path = p_object_name
        and auth.uid() in (message.sender_id, message.recipient_id)
    )
    or exists (
      select 1
      from public.group_messages as message
      join public.group_chat_members as member on member.group_id = message.group_id
      where message.voice_path = p_object_name
        and member.user_id = auth.uid()
    )
  );
$$;

revoke all on function public.can_read_voice_note(text) from public;
grant execute on function public.can_read_voice_note(text) to authenticated;

create policy "Conversation members can listen to voice notes"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and public.can_read_voice_note(name)
  );

drop policy if exists "Users can upload their own voice notes" on storage.objects;
create policy "Users can upload their own voice notes"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own voice notes" on storage.objects;
create policy "Users can delete their own voice notes"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

do $$
declare
  cleanup_job_count integer;
begin
  begin
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  exception
    when insufficient_privilege or undefined_file then
      raise notice 'pg_cron is unavailable; run public.cleanup_expired_messages() from a scheduled Supabase job.';
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute 'select count(*) from cron.job where jobname = $1'
        into cleanup_job_count
        using 'gamer-studio-expired-data';
      if cleanup_job_count = 0 then
        execute 'select cron.schedule($1, $2, $3)'
          using 'gamer-studio-expired-data',
            '* * * * *',
            'select public.cleanup_expired_messages();';
      else
        execute 'select cron.unschedule(jobid) from cron.job where jobname = $1'
          using 'gamer-studio-expired-data';
        execute 'select cron.schedule($1, $2, $3)'
          using 'gamer-studio-expired-data',
            '* * * * *',
            'select public.cleanup_expired_messages();';
      end if;
    exception
      when insufficient_privilege or undefined_function or undefined_table or invalid_schema_name then
        raise notice 'Could not schedule automatic cleanup with pg_cron; schedule public.cleanup_expired_messages() every minute in Supabase.';
    end;
  end if;
end;
$$;

notify pgrst, 'reload schema';
