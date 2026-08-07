create table if not exists public.deshazo_invoice_spend_invoices (
  id uuid primary key default gen_random_uuid(),
  customer text not null,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  source_document_bucket text,
  source_document_file_path text,
  source_document_name text,
  original_file_name text,
  extend_file_id text,
  extend_workflow_run_id text,
  extend_workflow_url text,
  status text not null default 'queued',
  error_message text,
  invoice_number text,
  invoice_date date,
  customer_number text,
  po_number text,
  job_number text,
  work_order_id bigint references public.deshazo_external_work_orders (work_order_id) on delete set null,
  ship_to_name text,
  ship_to_address text,
  location_label text,
  invoice_total numeric(12, 2) not null default 0,
  extracted_d_numbers text[] not null default '{}',
  allocation_status text not null default 'pending',
  raw_extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deshazo_invoice_spend_invoices_customer_not_blank
    check (char_length(btrim(customer)) > 0),
  constraint deshazo_invoice_spend_invoices_total_nonnegative
    check (invoice_total >= 0),
  constraint deshazo_invoice_spend_invoices_allocation_status
    check (allocation_status in ('pending', 'allocated', 'unmapped', 'needs_review', 'failed'))
);

alter table public.deshazo_invoice_spend_invoices
  add column if not exists uploaded_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  add column if not exists source_document_bucket text,
  add column if not exists source_document_file_path text,
  add column if not exists source_document_name text,
  add column if not exists original_file_name text,
  add column if not exists extend_file_id text,
  add column if not exists extend_workflow_run_id text,
  add column if not exists extend_workflow_url text,
  add column if not exists status text not null default 'queued',
  add column if not exists error_message text,
  add column if not exists customer_number text,
  add column if not exists po_number text,
  add column if not exists job_number text,
  add column if not exists work_order_id bigint references public.deshazo_external_work_orders (work_order_id) on delete set null,
  add column if not exists ship_to_name text,
  add column if not exists ship_to_address text,
  add column if not exists location_label text,
  add column if not exists extracted_d_numbers text[] not null default '{}',
  add column if not exists allocation_status text not null default 'pending',
  add column if not exists raw_extraction jsonb not null default '{}'::jsonb;

create unique index if not exists deshazo_invoice_spend_invoices_customer_invoice_idx
  on public.deshazo_invoice_spend_invoices (customer, invoice_number)
  where invoice_number is not null;

create unique index if not exists deshazo_invoice_spend_invoices_workflow_run_idx
  on public.deshazo_invoice_spend_invoices (extend_workflow_run_id)
  where extend_workflow_run_id is not null;

create index if not exists deshazo_invoice_spend_invoices_customer_date_idx
  on public.deshazo_invoice_spend_invoices (customer, invoice_date desc);

create index if not exists deshazo_invoice_spend_invoices_customer_job_idx
  on public.deshazo_invoice_spend_invoices (customer, job_number)
  where job_number is not null;

create table if not exists public.deshazo_invoice_spend_allocations (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.deshazo_invoice_spend_invoices (id) on delete cascade,
  customer text not null,
  invoice_number text,
  invoice_date date,
  job_number text,
  work_order_id bigint references public.deshazo_external_work_orders (work_order_id) on delete set null,
  crane_row_id uuid references public.deshazo_external_report_cranes (id) on delete set null,
  d_number text,
  crane_description text,
  crane_location text,
  location_label text,
  allocation_method text not null,
  allocation_count integer not null default 1,
  invoice_total numeric(12, 2) not null default 0,
  allocated_amount numeric(12, 2) not null default 0,
  source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  source_document_bucket text,
  source_document_file_path text,
  source_document_name text,
  raw_crane_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint deshazo_invoice_spend_allocations_customer_not_blank
    check (char_length(btrim(customer)) > 0),
  constraint deshazo_invoice_spend_allocations_method
    check (allocation_method in ('direct_d_number', 'job_number_fallback', 'manual', 'unmapped')),
  constraint deshazo_invoice_spend_allocations_count_positive
    check (allocation_count > 0),
  constraint deshazo_invoice_spend_allocations_amount_nonnegative
    check (invoice_total >= 0 and allocated_amount >= 0)
);

alter table public.deshazo_invoice_spend_allocations
  add column if not exists invoice_number text,
  add column if not exists invoice_date date,
  add column if not exists job_number text,
  add column if not exists work_order_id bigint references public.deshazo_external_work_orders (work_order_id) on delete set null,
  add column if not exists crane_row_id uuid references public.deshazo_external_report_cranes (id) on delete set null,
  add column if not exists d_number text,
  add column if not exists crane_description text,
  add column if not exists crane_location text,
  add column if not exists location_label text,
  add column if not exists allocation_count integer not null default 1,
  add column if not exists invoice_total numeric(12, 2) not null default 0,
  add column if not exists source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  add column if not exists source_document_bucket text,
  add column if not exists source_document_file_path text,
  add column if not exists source_document_name text,
  add column if not exists raw_crane_payload jsonb not null default '{}'::jsonb;

create unique index if not exists deshazo_invoice_spend_allocations_invoice_d_number_idx
  on public.deshazo_invoice_spend_allocations (invoice_id, d_number)
  where d_number is not null;

create index if not exists deshazo_invoice_spend_allocations_customer_location_idx
  on public.deshazo_invoice_spend_allocations (customer, location_label);

create index if not exists deshazo_invoice_spend_allocations_customer_d_number_idx
  on public.deshazo_invoice_spend_allocations (customer, d_number);

create index if not exists deshazo_invoice_spend_allocations_customer_date_idx
  on public.deshazo_invoice_spend_allocations (customer, invoice_date desc);

create or replace function public.set_deshazo_invoice_spend_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists deshazo_invoice_spend_invoices_updated_at_trigger
  on public.deshazo_invoice_spend_invoices;

create trigger deshazo_invoice_spend_invoices_updated_at_trigger
before insert or update on public.deshazo_invoice_spend_invoices
for each row
execute function public.set_deshazo_invoice_spend_updated_at();

drop trigger if exists deshazo_invoice_spend_allocations_updated_at_trigger
  on public.deshazo_invoice_spend_allocations;

create trigger deshazo_invoice_spend_allocations_updated_at_trigger
before insert or update on public.deshazo_invoice_spend_allocations
for each row
execute function public.set_deshazo_invoice_spend_updated_at();

alter table public.deshazo_invoice_spend_invoices enable row level security;
alter table public.deshazo_invoice_spend_allocations enable row level security;

grant usage on schema public to authenticated, service_role;
grant select on table public.deshazo_invoice_spend_invoices to authenticated;
grant select on table public.deshazo_invoice_spend_allocations to authenticated;
grant select, insert, update, delete on table public.deshazo_invoice_spend_invoices to service_role;
grant select, insert, update, delete on table public.deshazo_invoice_spend_allocations to service_role;

drop policy if exists "Authenticated users can read invoice spend invoices"
  on public.deshazo_invoice_spend_invoices;

create policy "Authenticated users can read invoice spend invoices"
  on public.deshazo_invoice_spend_invoices
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read invoice spend allocations"
  on public.deshazo_invoice_spend_allocations;

create policy "Authenticated users can read invoice spend allocations"
  on public.deshazo_invoice_spend_allocations
  for select
  to authenticated
  using (true);
