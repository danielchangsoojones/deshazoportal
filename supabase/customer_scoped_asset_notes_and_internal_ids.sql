create extension if not exists pgcrypto;

create table if not exists public.asset_notes (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  author_id uuid not null references auth.users (id) on delete restrict,
  author_name text not null default '',
  author_email text not null default '',
  note_text text not null check (char_length(btrim(note_text)) > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.asset_company_internal_ids (
  unit_id text not null,
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

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'asset_notes'
      and column_name = 'customer'
  ) then
    alter table public.asset_notes add column customer text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'asset_company_internal_ids'
      and column_name = 'customer'
  ) then
    alter table public.asset_company_internal_ids add column customer text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'asset_company_internal_id_history'
      and column_name = 'customer'
  ) then
    alter table public.asset_company_internal_id_history add column customer text;
  end if;
end
$$;

do $$
begin
  execute 'update public.asset_notes set customer = ''legacy'' where customer is null or btrim(customer) = ''''';
  execute 'alter table public.asset_notes alter column customer set default ''legacy''';
  execute 'alter table public.asset_notes alter column customer set not null';

  execute 'update public.asset_company_internal_ids set customer = ''legacy'' where customer is null or btrim(customer) = ''''';
  execute 'alter table public.asset_company_internal_ids alter column customer set default ''legacy''';
  execute 'alter table public.asset_company_internal_ids alter column customer set not null';

  execute 'update public.asset_company_internal_id_history set customer = ''legacy'' where customer is null or btrim(customer) = ''''';
  execute 'alter table public.asset_company_internal_id_history alter column customer set default ''legacy''';
  execute 'alter table public.asset_company_internal_id_history alter column customer set not null';
end
$$;

drop index if exists public.asset_notes_customer_unit_id_created_at_idx;
create index asset_notes_customer_unit_id_created_at_idx
  on public.asset_notes (customer, unit_id, created_at desc);

drop index if exists public.asset_company_internal_id_history_unit_id_changed_at_idx;
drop index if exists public.asset_company_internal_id_history_customer_unit_id_changed_at_idx;
create index asset_company_internal_id_history_customer_unit_id_changed_at_idx
  on public.asset_company_internal_id_history (customer, unit_id, changed_at desc);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.asset_company_internal_ids'::regclass
      and conname = 'asset_company_internal_ids_pkey'
  ) then
    alter table public.asset_company_internal_ids
      drop constraint asset_company_internal_ids_pkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.asset_company_internal_ids'::regclass
      and conname = 'asset_company_internal_ids_customer_unit_id_key'
  ) then
    alter table public.asset_company_internal_ids
      add constraint asset_company_internal_ids_customer_unit_id_key unique (customer, unit_id);
  end if;
end
$$;

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
      customer,
      previous_value,
      new_value,
      changed_by,
      changed_by_name,
      changed_by_email
    )
    values (
      new.unit_id,
      new.customer,
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

alter table public.asset_notes enable row level security;
alter table public.asset_company_internal_ids enable row level security;
alter table public.asset_company_internal_id_history enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.asset_notes to authenticated;
grant select, insert, update on table public.asset_company_internal_ids to authenticated;
grant select on table public.asset_company_internal_id_history to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notes'
      and policyname = 'Authenticated users can read asset notes'
  ) then
    create policy "Authenticated users can read asset notes"
      on public.asset_notes
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notes'
      and policyname = 'Authenticated users can insert asset notes'
  ) then
    create policy "Authenticated users can insert asset notes"
      on public.asset_notes
      for insert
      to authenticated
      with check (auth.uid() = author_id);
  end if;
end
$$;
