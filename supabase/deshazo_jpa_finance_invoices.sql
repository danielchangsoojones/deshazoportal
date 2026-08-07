create table if not exists public.deshazo_jpa_finance_invoices (
  id uuid primary key default gen_random_uuid(),
  import_period date not null,
  source_month text,
  source_file_name text,
  source_sheet_name text,
  source_row_number integer,
  customer text not null,
  job_no text not null,
  work_order_id bigint references public.deshazo_external_work_orders (work_order_id) on delete set null,
  customer_location_name text,
  service_location_name text,
  location_label text,
  parts_revenue numeric(12, 2) not null default 0,
  service_revenue numeric(12, 2) not null default 0,
  total_revenue numeric(12, 2) generated always as (parts_revenue + service_revenue) stored,
  raw_payload jsonb not null default '{}'::jsonb,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.deshazo_jpa_finance_invoices
  add column if not exists source_month text,
  add column if not exists source_file_name text,
  add column if not exists source_sheet_name text,
  add column if not exists source_row_number integer,
  add column if not exists customer_location_name text,
  add column if not exists service_location_name text,
  add column if not exists location_label text,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

alter table public.deshazo_jpa_finance_invoices
  drop constraint if exists deshazo_jpa_finance_revenue_nonnegative;

create index if not exists deshazo_jpa_finance_invoices_customer_period_idx
  on public.deshazo_jpa_finance_invoices (customer, import_period desc);

create index if not exists deshazo_jpa_finance_invoices_job_no_idx
  on public.deshazo_jpa_finance_invoices (job_no);

create index if not exists deshazo_jpa_finance_invoices_work_order_idx
  on public.deshazo_jpa_finance_invoices (work_order_id);

create unique index if not exists deshazo_jpa_finance_invoices_source_row_idx
  on public.deshazo_jpa_finance_invoices (
    source_file_name,
    source_sheet_name,
    source_row_number,
    customer,
    job_no
  );

create or replace function public.touch_deshazo_jpa_finance_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists deshazo_jpa_finance_invoices_touch_updated_at
  on public.deshazo_jpa_finance_invoices;

create trigger deshazo_jpa_finance_invoices_touch_updated_at
before insert or update on public.deshazo_jpa_finance_invoices
for each row
execute function public.touch_deshazo_jpa_finance_updated_at();

alter table public.deshazo_jpa_finance_invoices enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update on table public.deshazo_jpa_finance_invoices to authenticated;
grant select, insert, update, delete on table public.deshazo_jpa_finance_invoices to service_role;
grant select on table public.user_tags to authenticated;

drop policy if exists "Authenticated users can read JPA finance invoices"
  on public.deshazo_jpa_finance_invoices;

create policy "Authenticated users can read JPA finance invoices"
  on public.deshazo_jpa_finance_invoices
  for select
  to authenticated
  using (true);

drop policy if exists "Developer users can insert JPA finance invoices"
  on public.deshazo_jpa_finance_invoices;

create policy "Developer users can insert JPA finance invoices"
  on public.deshazo_jpa_finance_invoices
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_tags
      where user_tags.user_id = (select auth.uid())
        and lower(btrim(user_tags.tag)) = 'developer'
    )
  );

drop policy if exists "Developer users can update JPA finance invoices"
  on public.deshazo_jpa_finance_invoices;

create policy "Developer users can update JPA finance invoices"
  on public.deshazo_jpa_finance_invoices
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_tags
      where user_tags.user_id = (select auth.uid())
        and lower(btrim(user_tags.tag)) = 'developer'
    )
  )
  with check (
    exists (
      select 1
      from public.user_tags
      where user_tags.user_id = (select auth.uid())
        and lower(btrim(user_tags.tag)) = 'developer'
    )
  );
