alter table public.comments
  add column if not exists parent_comment_id uuid
  references public.comments(id) on delete cascade;

grant select, insert on public.comments to authenticated;

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

notify pgrst, 'reload schema';

select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'comments'
  and column_name = 'parent_comment_id';
