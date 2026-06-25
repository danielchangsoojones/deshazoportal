insert into storage.buckets (id, name, public, allowed_mime_types)
values ('jobs-quoting-pdfs', 'jobs-quoting-pdfs', false, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.jobs_quoting_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  source_file_name text not null,
  source_file_size bigint not null default 0,
  status text not null default 'queued',
  extend_workflow_run_id text,
  extend_workflow_url text,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jobs_quoting_runs_source_file_name_not_blank
    check (char_length(btrim(source_file_name)) > 0)
);

create table if not exists public.jobs_quoting_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.jobs_quoting_runs (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  editable_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  document_name text not null,
  job_number text,
  job_type text,
  d_number text,
  deshazo_external_inspection_report_work_order_id bigint references public.deshazo_external_inspection_reports (work_order_id) on delete set null,
  split_type text,
  split_identifier text,
  repair_count integer not null default 0,
  safety_count integer not null default 0,
  extend_file_id text,
  pdf_url text,
  pdf_bucket text not null default 'jobs-quoting-pdfs',
  pdf_storage_path text,
  pdf_file_name text,
  pdf_file_size bigint,
  pdf_content_type text not null default 'application/pdf',
  extraction_data jsonb not null default '{}'::jsonb,
  report_name text,
  source_document_name text,
  report_data jsonb not null default '{}'::jsonb,
  repair_sections jsonb not null default '[]'::jsonb,
  cost_sections jsonb not null default '[]'::jsonb,
  block_visibility jsonb not null default '{}'::jsonb,
  estimate_note_visibility jsonb not null default '{}'::jsonb,
  repair_section_visibility jsonb not null default '{}'::jsonb,
  page_layout_visibility jsonb not null default '{}'::jsonb,
  equipment_rental_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jobs_quoting_items_document_name_not_blank
    check (char_length(btrim(document_name)) > 0),
  constraint jobs_quoting_items_repair_count_nonnegative
    check (repair_count >= 0),
  constraint jobs_quoting_items_safety_count_nonnegative
    check (safety_count >= 0),
  constraint jobs_quoting_items_pdf_content_type
    check (pdf_content_type = 'application/pdf')
);

create table if not exists public.jobs_quoting_item_results (
  id uuid primary key default gen_random_uuid(),
  job_quote_item_id uuid not null references public.jobs_quoting_items (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  quote_total_amount numeric(12, 2) not null default 0,
  win_status text not null default 'pending',
  amount_won numeric(12, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint jobs_quoting_item_results_item_key
    unique (job_quote_item_id),
  constraint jobs_quoting_item_results_quote_total_nonnegative
    check (quote_total_amount >= 0),
  constraint jobs_quoting_item_results_amount_won_nonnegative
    check (amount_won is null or amount_won >= 0),
  constraint jobs_quoting_item_results_win_status
    check (win_status in ('won', 'lost', 'pending')),
  constraint jobs_quoting_item_results_amount_won_for_won
    check (win_status = 'won' or amount_won is null)
);

alter table public.jobs_quoting_items
  add column if not exists job_number text,
  add column if not exists job_type text,
  add column if not exists d_number text,
  add column if not exists uploaded_by_user_id uuid references auth.users (id) on delete set null,
  add column if not exists deshazo_external_inspection_report_work_order_id bigint references public.deshazo_external_inspection_reports (work_order_id) on delete set null,
  add column if not exists pdf_bucket text not null default 'jobs-quoting-pdfs',
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_file_name text,
  add column if not exists pdf_file_size bigint,
  add column if not exists pdf_content_type text not null default 'application/pdf',
  add column if not exists report_name text,
  add column if not exists source_document_name text,
  add column if not exists report_data jsonb not null default '{}'::jsonb,
  add column if not exists repair_sections jsonb not null default '[]'::jsonb,
  add column if not exists cost_sections jsonb not null default '[]'::jsonb,
  add column if not exists block_visibility jsonb not null default '{}'::jsonb,
  add column if not exists estimate_note_visibility jsonb not null default '{}'::jsonb,
  add column if not exists repair_section_visibility jsonb not null default '{}'::jsonb,
  add column if not exists page_layout_visibility jsonb not null default '{}'::jsonb,
  add column if not exists equipment_rental_settings jsonb not null default '{}'::jsonb;

update public.jobs_quoting_items
set page_layout_visibility = jsonb_build_object(
  'blockVisibility', block_visibility,
  'estimateNoteVisibility', estimate_note_visibility,
  'repairSectionVisibility', repair_section_visibility
)
where page_layout_visibility = '{}'::jsonb
  and (
    block_visibility <> '{}'::jsonb
    or estimate_note_visibility <> '{}'::jsonb
    or repair_section_visibility <> '{}'::jsonb
  );

alter table public.jobs_quoting_runs
  alter column user_id drop not null;

alter table public.jobs_quoting_items
  alter column user_id drop not null;

update public.jobs_quoting_items
set job_number = nullif(btrim(coalesce(extraction_data #>> '{job_number,value}', extraction_data ->> 'job_number')), '')
where job_number is null
  and nullif(btrim(coalesce(extraction_data #>> '{job_number,value}', extraction_data ->> 'job_number')), '') is not null;

update public.jobs_quoting_items
set job_type = nullif(btrim(coalesce(
  extraction_data #>> '{job_type,value}',
  extraction_data #>> '{inspection_type,value}',
  extraction_data ->> 'job_type',
  extraction_data ->> 'inspection_type'
)), '')
where job_type is null
  and nullif(btrim(coalesce(
    extraction_data #>> '{job_type,value}',
    extraction_data #>> '{inspection_type,value}',
    extraction_data ->> 'job_type',
    extraction_data ->> 'inspection_type'
  )), '') is not null;

update public.jobs_quoting_items
set d_number = nullif(btrim(coalesce(extraction_data #>> '{d_number,value}', extraction_data ->> 'd_number')), '')
where d_number is null
  and nullif(btrim(coalesce(extraction_data #>> '{d_number,value}', extraction_data ->> 'd_number')), '') is not null;

update public.jobs_quoting_items
set uploaded_by_user_id = user_id
where uploaded_by_user_id is null
  and user_id is not null;

create unique index if not exists jobs_quoting_items_run_extend_file_key
  on public.jobs_quoting_items (run_id, extend_file_id)
  where extend_file_id is not null;

create index if not exists jobs_quoting_runs_user_created_idx
  on public.jobs_quoting_runs (user_id, created_at desc);

create index if not exists jobs_quoting_items_user_priority_idx
  on public.jobs_quoting_items (user_id, repair_count desc, safety_count desc, created_at desc);

create index if not exists jobs_quoting_items_user_job_number_idx
  on public.jobs_quoting_items (user_id, job_number)
  where job_number is not null;

create index if not exists jobs_quoting_items_user_job_type_idx
  on public.jobs_quoting_items (user_id, job_type)
  where job_type is not null;

create index if not exists jobs_quoting_items_user_d_number_idx
  on public.jobs_quoting_items (user_id, d_number)
  where d_number is not null;

create index if not exists jobs_quoting_item_results_status_idx
  on public.jobs_quoting_item_results (win_status, updated_at desc);

create index if not exists jobs_quoting_item_results_user_idx
  on public.jobs_quoting_item_results (user_id, updated_at desc);

create or replace function public.set_jobs_quoting_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create or replace function public.set_jobs_quoting_item_defaults()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  extracted_d_number text;
  extracted_job_type text;
begin
  new.updated_at := timezone('utc', now());
  extracted_d_number := nullif(btrim(coalesce(new.extraction_data #>> '{d_number,value}', new.extraction_data ->> 'd_number')), '');
  extracted_job_type := nullif(btrim(coalesce(
    new.extraction_data #>> '{job_type,value}',
    new.extraction_data #>> '{inspection_type,value}',
    new.extraction_data ->> 'job_type',
    new.extraction_data ->> 'inspection_type'
  )), '');

  if tg_op = 'UPDATE' and new.job_type is distinct from old.job_type then
    new.job_type := nullif(btrim(new.job_type), '');
  elsif nullif(btrim(new.job_type), '') is not null then
    new.job_type := nullif(btrim(new.job_type), '');
  elsif extracted_job_type is not null then
    new.job_type := extracted_job_type;
  else
    new.job_type := null;
  end if;

  if tg_op = 'UPDATE' and new.d_number is distinct from old.d_number then
    new.d_number := nullif(btrim(new.d_number), '');
  elsif nullif(btrim(new.d_number), '') is not null then
    new.d_number := nullif(btrim(new.d_number), '');
  elsif extracted_d_number is not null then
    new.d_number := extracted_d_number;
  else
    new.d_number := null;
  end if;

  return new;
end;
$$;

drop trigger if exists jobs_quoting_runs_updated_at_trigger
  on public.jobs_quoting_runs;

create trigger jobs_quoting_runs_updated_at_trigger
before insert or update on public.jobs_quoting_runs
for each row
execute function public.set_jobs_quoting_updated_at();

drop trigger if exists jobs_quoting_items_updated_at_trigger
  on public.jobs_quoting_items;

create trigger jobs_quoting_items_updated_at_trigger
before insert or update on public.jobs_quoting_items
for each row
execute function public.set_jobs_quoting_item_defaults();

drop trigger if exists jobs_quoting_item_results_updated_at_trigger
  on public.jobs_quoting_item_results;

create trigger jobs_quoting_item_results_updated_at_trigger
before insert or update on public.jobs_quoting_item_results
for each row
execute function public.set_jobs_quoting_updated_at();

alter table public.jobs_quoting_runs enable row level security;
alter table public.jobs_quoting_items enable row level security;
alter table public.jobs_quoting_item_results enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.jobs_quoting_runs to authenticated;
grant select, insert, update, delete on table public.jobs_quoting_items to authenticated;
grant select, insert, update, delete on table public.jobs_quoting_item_results to authenticated;
grant select, insert, update, delete on table public.jobs_quoting_runs to service_role;
grant select, insert, update, delete on table public.jobs_quoting_items to service_role;
grant select, insert, update, delete on table public.jobs_quoting_item_results to service_role;
grant select, insert, update, delete on table public.editable_inspection_documents to service_role;

create or replace view public.user_tag_display_names as
select
  user_id,
  display_name
from public.user_tags;

grant select on public.user_tag_display_names to authenticated;

do $$
begin
  drop policy if exists "Authenticated users can read their quote runs"
    on public.jobs_quoting_runs;
  drop policy if exists "Authenticated users can read all quote runs"
    on public.jobs_quoting_runs;

  create policy "Authenticated users can read all quote runs"
    on public.jobs_quoting_runs
    for select
    to authenticated
    using (true);

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs_quoting_runs'
      and policyname = 'Authenticated users can insert their quote runs'
  ) then
    create policy "Authenticated users can insert their quote runs"
      on public.jobs_quoting_runs
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  drop policy if exists "Authenticated users can update their quote runs"
    on public.jobs_quoting_runs;
  drop policy if exists "Authenticated users can update owned or shared quote runs"
    on public.jobs_quoting_runs;

  create policy "Authenticated users can update owned or shared quote runs"
    on public.jobs_quoting_runs
    for update
    to authenticated
    using (user_id is null or (select auth.uid()) = user_id)
    with check (user_id is null or (select auth.uid()) = user_id);

  drop policy if exists "Authenticated users can read their quote items"
    on public.jobs_quoting_items;
  drop policy if exists "Authenticated users can read all quote items"
    on public.jobs_quoting_items;

  create policy "Authenticated users can read all quote items"
    on public.jobs_quoting_items
    for select
    to authenticated
    using (true);

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'jobs_quoting_items'
      and policyname = 'Authenticated users can insert their quote items'
  ) then
    create policy "Authenticated users can insert their quote items"
      on public.jobs_quoting_items
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  drop policy if exists "Authenticated users can update their quote items"
    on public.jobs_quoting_items;
  drop policy if exists "Authenticated users can update owned or shared quote items"
    on public.jobs_quoting_items;

  create policy "Authenticated users can update owned or shared quote items"
    on public.jobs_quoting_items
    for update
    to authenticated
    using (user_id is null or (select auth.uid()) = user_id)
    with check (user_id is null or (select auth.uid()) = user_id);

  drop policy if exists "Authenticated users can delete owned or shared quote items"
    on public.jobs_quoting_items;

  create policy "Authenticated users can delete owned or shared quote items"
    on public.jobs_quoting_items
    for delete
    to authenticated
    using (user_id is null or (select auth.uid()) = user_id);

  drop policy if exists "Authenticated users can read all quote item results"
    on public.jobs_quoting_item_results;

  create policy "Authenticated users can read all quote item results"
    on public.jobs_quoting_item_results
    for select
    to authenticated
    using (true);

  drop policy if exists "Authenticated users can insert quote item results"
    on public.jobs_quoting_item_results;

  create policy "Authenticated users can insert quote item results"
    on public.jobs_quoting_item_results
    for insert
    to authenticated
    with check (user_id is null or (select auth.uid()) = user_id);

  drop policy if exists "Authenticated users can update quote item results"
    on public.jobs_quoting_item_results;

  create policy "Authenticated users can update quote item results"
    on public.jobs_quoting_item_results
    for update
    to authenticated
    using (user_id is null or (select auth.uid()) = user_id)
    with check (user_id is null or (select auth.uid()) = user_id);

  drop policy if exists "Authenticated users can delete quote item results"
    on public.jobs_quoting_item_results;

  create policy "Authenticated users can delete quote item results"
    on public.jobs_quoting_item_results
    for delete
    to authenticated
    using (user_id is null or (select auth.uid()) = user_id);
end
$$;

do $$
begin
  drop policy if exists "Authenticated users can read their jobs quoting PDFs"
    on storage.objects;
  drop policy if exists "Authenticated users can read all jobs quoting PDFs"
    on storage.objects;

  create policy "Authenticated users can read all jobs quoting PDFs"
    on storage.objects
    for select
    to authenticated
    using (bucket_id = 'jobs-quoting-pdfs');

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload their jobs quoting PDFs'
  ) then
    create policy "Authenticated users can upload their jobs quoting PDFs"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'jobs-quoting-pdfs'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update their jobs quoting PDFs'
  ) then
    create policy "Authenticated users can update their jobs quoting PDFs"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'jobs-quoting-pdfs'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'jobs-quoting-pdfs'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete their jobs quoting PDFs'
  ) then
    create policy "Authenticated users can delete their jobs quoting PDFs"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'jobs-quoting-pdfs'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end
$$;

notify pgrst, 'reload schema';
