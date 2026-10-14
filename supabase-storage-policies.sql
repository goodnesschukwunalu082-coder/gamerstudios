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
    )
  );
