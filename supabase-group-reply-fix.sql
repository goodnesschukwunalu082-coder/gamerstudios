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

notify pgrst, 'reload schema';
