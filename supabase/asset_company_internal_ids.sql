create extension if not exists pgcrypto;

create table if not exists public.asset_company_internal_ids (
  unit_id text primary key,
  unique_company_internal_id text not null check (char_length(btrim(unique_company_internal_id)) > 0),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by uuid not null references auth.users (id) on delete restrict,
  updated_by_name text not null default '',
  updated_by_email text not null default ''
);

create table if not exists public.asset_company_internal_id_history (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  previous_value text,
  new_value text not null,
  changed_at timestamptz not null default timezone('utc', now()),
  changed_by uuid not null references auth.users (id) on delete restrict,
  changed_by_name text not null default '',
  changed_by_email text not null default ''
);

create index if not exists asset_company_internal_id_history_unit_id_changed_at_idx
  on public.asset_company_internal_id_history (unit_id, changed_at desc);

create or replace function public.log_asset_company_internal_id_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or old.unique_company_internal_id is distinct from new.unique_company_internal_id then
    insert into public.asset_company_internal_id_history (
      unit_id,
      previous_value,
      new_value,
      changed_by,
      changed_by_name,
      changed_by_email
    )
    values (
      new.unit_id,
      case when tg_op = 'INSERT' then null else old.unique_company_internal_id end,
      new.unique_company_internal_id,
      new.updated_by,
      new.updated_by_name,
      new.updated_by_email
    );
  end if;

  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists asset_company_internal_ids_history_trigger on public.asset_company_internal_ids;

create trigger asset_company_internal_ids_history_trigger
before insert or update on public.asset_company_internal_ids
for each row
execute function public.log_asset_company_internal_id_history();

alter table public.asset_company_internal_ids enable row level security;
alter table public.asset_company_internal_id_history enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.asset_company_internal_ids to authenticated;
grant select on table public.asset_company_internal_id_history to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_company_internal_ids'
      and policyname = 'Authenticated users can read company internal ids'
  ) then
    create policy "Authenticated users can read company internal ids"
      on public.asset_company_internal_ids
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_company_internal_ids'
      and policyname = 'Authenticated users can insert company internal ids'
  ) then
    create policy "Authenticated users can insert company internal ids"
      on public.asset_company_internal_ids
      for insert
      to authenticated
      with check (auth.uid() = updated_by);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_company_internal_ids'
      and policyname = 'Authenticated users can update company internal ids'
  ) then
    create policy "Authenticated users can update company internal ids"
      on public.asset_company_internal_ids
      for update
      to authenticated
      using (true)
      with check (auth.uid() = updated_by);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_company_internal_id_history'
      and policyname = 'Authenticated users can read company internal id history'
  ) then
    create policy "Authenticated users can read company internal id history"
      on public.asset_company_internal_id_history
      for select
      to authenticated
      using (true);
  end if;
end
$$;
