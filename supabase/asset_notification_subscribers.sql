create table if not exists public.asset_notification_subscribers (
  unit_id text not null,
  email text not null check (
    char_length(btrim(email)) > 0
    and email = lower(btrim(email))
    and position('@' in email) > 1
  ),
  new_reports boolean not null default true,
  repair_done boolean not null default true,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_by_name text not null default '',
  updated_by_email text not null default '',
  primary key (unit_id, email)
);

create or replace function public.touch_asset_notification_subscribers_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists asset_notification_subscribers_touch_updated_at on public.asset_notification_subscribers;

create trigger asset_notification_subscribers_touch_updated_at
before insert or update on public.asset_notification_subscribers
for each row
execute function public.touch_asset_notification_subscribers_updated_at();

alter table public.asset_notification_subscribers enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.asset_notification_subscribers to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notification_subscribers'
      and policyname = 'Authenticated users can read asset notification subscribers'
  ) then
    create policy "Authenticated users can read asset notification subscribers"
      on public.asset_notification_subscribers
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notification_subscribers'
      and policyname = 'Authenticated users can insert asset notification subscribers'
  ) then
    create policy "Authenticated users can insert asset notification subscribers"
      on public.asset_notification_subscribers
      for insert
      to authenticated
      with check (auth.uid() = updated_by);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notification_subscribers'
      and policyname = 'Authenticated users can update asset notification subscribers'
  ) then
    create policy "Authenticated users can update asset notification subscribers"
      on public.asset_notification_subscribers
      for update
      to authenticated
      using (true)
      with check (auth.uid() = updated_by);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notification_subscribers'
      and policyname = 'Authenticated users can delete asset notification subscribers'
  ) then
    create policy "Authenticated users can delete asset notification subscribers"
      on public.asset_notification_subscribers
      for delete
      to authenticated
      using (true);
  end if;
end
$$;
