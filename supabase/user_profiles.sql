create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  phone text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_profiles_name_not_blank
    check (char_length(btrim(name)) > 0),
  constraint user_profiles_email_not_blank
    check (char_length(btrim(email)) > 0)
);

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  new.name := btrim(new.name);
  new.email := btrim(new.email);
  new.phone := btrim(coalesce(new.phone, ''));
  return new;
end;
$$;

drop trigger if exists user_profiles_updated_at_trigger
  on public.user_profiles;

create trigger user_profiles_updated_at_trigger
before insert or update on public.user_profiles
for each row
execute function public.set_user_profiles_updated_at();

alter table public.user_profiles enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.user_profiles to authenticated;
grant select, insert, update, delete on table public.user_profiles to service_role;

do $$
begin
  drop policy if exists "Users can read their profile"
    on public.user_profiles;

  create policy "Users can read their profile"
    on public.user_profiles
    for select
    to authenticated
    using ((select auth.uid()) = user_id);

  drop policy if exists "Users can insert their profile"
    on public.user_profiles;

  create policy "Users can insert their profile"
    on public.user_profiles
    for insert
    to authenticated
    with check ((select auth.uid()) = user_id);

  drop policy if exists "Users can update their profile"
    on public.user_profiles;

  create policy "Users can update their profile"
    on public.user_profiles
    for update
    to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);
end
$$;

insert into public.user_profiles (user_id, name, email, phone)
select id, 'Jeffrey R. Melton', 'jmelton@deshazo.com', '513-903-6405-C'
from auth.users
where lower(email) = 'jmelton@deshazo.com'
on conflict (user_id) do update
set name = excluded.name,
    email = excluded.email,
    phone = excluded.phone;

notify pgrst, 'reload schema';
