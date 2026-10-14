alter table public.profiles
  add column if not exists background_image_url text;

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;
grant update (background_image_url) on public.profiles to authenticated;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

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

drop policy if exists "Users can upload their own profile backgrounds" on storage.objects;
create policy "Users can upload their own profile backgrounds"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'game assets'
    and (storage.foldername(name))[1] = 'background-pictures'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own profile backgrounds" on storage.objects;
create policy "Users can update their own profile backgrounds"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'game assets'
    and (storage.foldername(name))[1] = 'background-pictures'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'game assets'
    and (storage.foldername(name))[1] = 'background-pictures'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own profile backgrounds" on storage.objects;
create policy "Users can delete their own profile backgrounds"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'game assets'
    and (storage.foldername(name))[1] = 'background-pictures'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';

select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'background_image_url';
