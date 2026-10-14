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

notify pgrst, 'reload schema';