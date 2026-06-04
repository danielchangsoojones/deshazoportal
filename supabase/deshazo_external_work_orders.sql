create table if not exists public.deshazo_external_work_orders (
  work_order_id bigint primary key,
  job_no text,
  sales_order_no text,
  job_type text,
  status_id bigint,
  status_name text,
  order_status text,
  customer_id bigint,
  customer_location_id bigint,
  customer_location_name text,
  service_location_id bigint,
  service_location_name text,
  bill_to_name text,
  bill_to_city text,
  bill_to_state text,
  bill_to_zip_code text,
  customer_po_no text,
  customer_work_order text,
  comment text,
  dispatch_notes text,
  svc_comment_text text,
  start_date date,
  end_date date,
  order_date date,
  svc_request_date date,
  completed_at timestamptz,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deshazo_external_inspection_reports (
  work_order_id bigint primary key references public.deshazo_external_work_orders (work_order_id) on delete cascade,
  job_no text,
  job_type text,
  raw_payload jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deshazo_external_general_work (
  id uuid primary key default gen_random_uuid(),
  work_order_id bigint not null references public.deshazo_external_inspection_reports (work_order_id) on delete cascade,
  item_index integer not null,
  work_date date,
  trip_number integer,
  technician text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (work_order_id, item_index)
);

create table if not exists public.deshazo_external_report_cranes (
  id uuid primary key default gen_random_uuid(),
  work_order_id bigint not null references public.deshazo_external_inspection_reports (work_order_id) on delete cascade,
  work_order_crane_id bigint,
  crane_index integer not null,
  crane_id bigint,
  contact_code text,
  description text,
  location text,
  service_status text,
  structure_type text,
  structure_manufacturer text,
  structure_capacity text,
  structure_model text,
  structure_serial_number text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (work_order_id, crane_index)
);

create table if not exists public.deshazo_external_report_hoists (
  id uuid primary key default gen_random_uuid(),
  crane_row_id uuid not null references public.deshazo_external_report_cranes (id) on delete cascade,
  hoist_index integer not null,
  hoist_type text,
  with_trolley boolean,
  manufacturer text,
  capacity text,
  model text,
  serial_number text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (crane_row_id, hoist_index)
);

create table if not exists public.deshazo_external_report_inspections (
  id uuid primary key default gen_random_uuid(),
  crane_row_id uuid not null references public.deshazo_external_report_cranes (id) on delete cascade,
  inspection_index integer not null,
  external_inspection_id bigint,
  inspection_type text,
  status text,
  inspection_date date,
  completed_at timestamptz,
  remarks jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (crane_row_id, inspection_index)
);

create table if not exists public.deshazo_external_report_sections (
  id uuid primary key default gen_random_uuid(),
  inspection_row_id uuid not null references public.deshazo_external_report_inspections (id) on delete cascade,
  section_index integer not null,
  external_section_id bigint,
  section_name text,
  section_order integer,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (inspection_row_id, section_index)
);

create table if not exists public.deshazo_external_report_points (
  id uuid primary key default gen_random_uuid(),
  section_row_id uuid not null references public.deshazo_external_report_sections (id) on delete cascade,
  point_index integer not null,
  external_point_id bigint,
  point_name text,
  condition text,
  point_order integer,
  notes text,
  point_value text,
  remarks jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (section_row_id, point_index)
);

create table if not exists public.deshazo_external_report_media (
  id uuid primary key default gen_random_uuid(),
  work_order_id bigint not null references public.deshazo_external_inspection_reports (work_order_id) on delete cascade,
  parent_table text not null,
  parent_row_id uuid,
  media_index integer not null,
  external_media_id text,
  media_type text not null default 'photo',
  content text,
  label text,
  source_created_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deshazo_external_report_notes (
  id uuid primary key default gen_random_uuid(),
  work_order_id bigint not null references public.deshazo_external_inspection_reports (work_order_id) on delete cascade,
  parent_table text not null,
  parent_row_id uuid,
  note_index integer not null,
  external_note_id text,
  note_type text,
  note text,
  author text,
  source_created_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deshazo_external_report_materials (
  id uuid primary key default gen_random_uuid(),
  work_order_id bigint not null references public.deshazo_external_inspection_reports (work_order_id) on delete cascade,
  parent_table text not null,
  parent_row_id uuid,
  material_index integer not null,
  external_material_id text,
  title text,
  description text,
  quantity numeric,
  cost_dollar numeric,
  amount_cents integer,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.deshazo_external_sync_runs (
  id uuid primary key default gen_random_uuid(),
  sync_type text not null,
  status text not null default 'running',
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  page integer,
  page_size integer,
  total_count integer,
  total_pages integer,
  work_orders_seen integer not null default 0,
  reports_seen integer not null default 0,
  checkpoint_updated_since timestamptz,
  error_message text,
  raw_summary jsonb not null default '{}'::jsonb
);

create table if not exists public.deshazo_external_sync_run_items (
  id uuid primary key default gen_random_uuid(),
  sync_run_id uuid references public.deshazo_external_sync_runs (id) on delete cascade,
  sync_type text not null,
  status text not null default 'running',
  work_order_id bigint,
  job_no text,
  d_number text,
  job_type text,
  customer_name text,
  customer_location_name text,
  service_location_name text,
  start_date date,
  end_date date,
  comment text,
  source_updated_at timestamptz,
  work_order_saved boolean not null default false,
  inspection_report_saved boolean not null default false,
  quote_item_id uuid,
  quote_item_action text,
  quote_item_saved boolean not null default false,
  quote_item_skipped boolean not null default false,
  error_message text,
  raw_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.deshazo_external_sync_run_items
  add column if not exists job_type text,
  add column if not exists customer_name text,
  add column if not exists customer_location_name text,
  add column if not exists service_location_name text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists comment text;

create table if not exists public.deshazo_external_sync_checkpoints (
  sync_name text primary key,
  last_successful_sync_at timestamptz,
  last_source_updated_at timestamptz,
  last_page integer,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists deshazo_external_work_orders_source_updated_idx
  on public.deshazo_external_work_orders (source_updated_at desc);

create index if not exists deshazo_external_work_orders_job_no_idx
  on public.deshazo_external_work_orders (job_no);

create index if not exists deshazo_external_work_orders_customer_location_idx
  on public.deshazo_external_work_orders (customer_location_id);

create index if not exists deshazo_external_report_cranes_work_order_idx
  on public.deshazo_external_report_cranes (work_order_id, crane_index);

create index if not exists deshazo_external_report_points_condition_idx
  on public.deshazo_external_report_points (condition);

create index if not exists deshazo_external_report_media_work_order_idx
  on public.deshazo_external_report_media (work_order_id, parent_table);

create index if not exists deshazo_external_sync_run_items_run_idx
  on public.deshazo_external_sync_run_items (sync_run_id, created_at desc);

create index if not exists deshazo_external_sync_run_items_work_order_idx
  on public.deshazo_external_sync_run_items (work_order_id, created_at desc);

create or replace function public.touch_deshazo_external_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists deshazo_external_work_orders_touch_updated_at
  on public.deshazo_external_work_orders;

create trigger deshazo_external_work_orders_touch_updated_at
before insert or update on public.deshazo_external_work_orders
for each row
execute function public.touch_deshazo_external_updated_at();

drop trigger if exists deshazo_external_inspection_reports_touch_updated_at
  on public.deshazo_external_inspection_reports;

create trigger deshazo_external_inspection_reports_touch_updated_at
before insert or update on public.deshazo_external_inspection_reports
for each row
execute function public.touch_deshazo_external_updated_at();

alter table public.deshazo_external_work_orders enable row level security;
alter table public.deshazo_external_inspection_reports enable row level security;
alter table public.deshazo_external_general_work enable row level security;
alter table public.deshazo_external_report_cranes enable row level security;
alter table public.deshazo_external_report_hoists enable row level security;
alter table public.deshazo_external_report_inspections enable row level security;
alter table public.deshazo_external_report_sections enable row level security;
alter table public.deshazo_external_report_points enable row level security;
alter table public.deshazo_external_report_media enable row level security;
alter table public.deshazo_external_report_notes enable row level security;
alter table public.deshazo_external_report_materials enable row level security;
alter table public.deshazo_external_sync_runs enable row level security;
alter table public.deshazo_external_sync_run_items enable row level security;
alter table public.deshazo_external_sync_checkpoints enable row level security;

grant usage on schema public to authenticated, service_role;

grant select on table public.deshazo_external_work_orders to authenticated;
grant select on table public.deshazo_external_inspection_reports to authenticated;
grant select on table public.deshazo_external_general_work to authenticated;
grant select on table public.deshazo_external_report_cranes to authenticated;
grant select on table public.deshazo_external_report_hoists to authenticated;
grant select on table public.deshazo_external_report_inspections to authenticated;
grant select on table public.deshazo_external_report_sections to authenticated;
grant select on table public.deshazo_external_report_points to authenticated;
grant select on table public.deshazo_external_report_media to authenticated;
grant select on table public.deshazo_external_report_notes to authenticated;
grant select on table public.deshazo_external_report_materials to authenticated;
grant select on table public.deshazo_external_sync_runs to authenticated;
grant select on table public.deshazo_external_sync_run_items to authenticated;
grant select on table public.deshazo_external_sync_checkpoints to authenticated;

grant select, insert, update, delete on table public.deshazo_external_work_orders to service_role;
grant select, insert, update, delete on table public.deshazo_external_inspection_reports to service_role;
grant select, insert, update, delete on table public.deshazo_external_general_work to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_cranes to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_hoists to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_inspections to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_sections to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_points to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_media to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_notes to service_role;
grant select, insert, update, delete on table public.deshazo_external_report_materials to service_role;
grant select, insert, update, delete on table public.deshazo_external_sync_runs to service_role;
grant select, insert, update, delete on table public.deshazo_external_sync_run_items to service_role;
grant select, insert, update, delete on table public.deshazo_external_sync_checkpoints to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deshazo_external_work_orders'
      and policyname = 'Authenticated users can read Deshazo external work orders'
  ) then
    create policy "Authenticated users can read Deshazo external work orders"
      on public.deshazo_external_work_orders
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'deshazo_external_inspection_reports'
      and policyname = 'Authenticated users can read Deshazo external inspection reports'
  ) then
    create policy "Authenticated users can read Deshazo external inspection reports"
      on public.deshazo_external_inspection_reports
      for select
      to authenticated
      using (true);
  end if;
end
$$;

drop policy if exists "Authenticated users can read Deshazo external general work"
  on public.deshazo_external_general_work;

create policy "Authenticated users can read Deshazo external general work"
  on public.deshazo_external_general_work
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report cranes"
  on public.deshazo_external_report_cranes;

create policy "Authenticated users can read Deshazo external report cranes"
  on public.deshazo_external_report_cranes
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report hoists"
  on public.deshazo_external_report_hoists;

create policy "Authenticated users can read Deshazo external report hoists"
  on public.deshazo_external_report_hoists
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report inspections"
  on public.deshazo_external_report_inspections;

create policy "Authenticated users can read Deshazo external report inspections"
  on public.deshazo_external_report_inspections
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report sections"
  on public.deshazo_external_report_sections;

create policy "Authenticated users can read Deshazo external report sections"
  on public.deshazo_external_report_sections
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report points"
  on public.deshazo_external_report_points;

create policy "Authenticated users can read Deshazo external report points"
  on public.deshazo_external_report_points
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report media"
  on public.deshazo_external_report_media;

create policy "Authenticated users can read Deshazo external report media"
  on public.deshazo_external_report_media
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report notes"
  on public.deshazo_external_report_notes;

create policy "Authenticated users can read Deshazo external report notes"
  on public.deshazo_external_report_notes
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external report materials"
  on public.deshazo_external_report_materials;

create policy "Authenticated users can read Deshazo external report materials"
  on public.deshazo_external_report_materials
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external sync checkpoints"
  on public.deshazo_external_sync_checkpoints;

create policy "Authenticated users can read Deshazo external sync checkpoints"
  on public.deshazo_external_sync_checkpoints
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external sync runs"
  on public.deshazo_external_sync_runs;

create policy "Authenticated users can read Deshazo external sync runs"
  on public.deshazo_external_sync_runs
  for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can read Deshazo external sync run items"
  on public.deshazo_external_sync_run_items;

create policy "Authenticated users can read Deshazo external sync run items"
  on public.deshazo_external_sync_run_items
  for select
  to authenticated
  using (true);
