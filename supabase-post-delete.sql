grant delete on public.posts to authenticated;

drop policy if exists "Users can delete their own posts" on public.posts;
create policy "Users can delete their own posts"
  on public.posts for delete to authenticated
  using (auth.uid() = user_id);
