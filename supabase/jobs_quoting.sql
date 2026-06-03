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
  editable_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  document_name text not null,
  job_number text,
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
  text_boxes jsonb not null default '[]'::jsonb,
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

alter table public.jobs_quoting_items
  add column if not exists job_number text,
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
  add column if not exists text_boxes jsonb not null default '[]'::jsonb,
  add column if not exists equipment_rental_settings jsonb not null default '{}'::jsonb;

alter table public.jobs_quoting_runs
  alter column user_id drop not null;

alter table public.jobs_quoting_items
  alter column user_id drop not null;

update public.jobs_quoting_items
set job_number = nullif(btrim(coalesce(extraction_data #>> '{job_number,value}', extraction_data ->> 'job_number')), '')
where job_number is null
  and nullif(btrim(coalesce(extraction_data #>> '{job_number,value}', extraction_data ->> 'job_number')), '') is not null;

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
execute function public.set_jobs_quoting_updated_at();

alter table public.jobs_quoting_runs enable row level security;
alter table public.jobs_quoting_items enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.jobs_quoting_runs to authenticated;
grant select, insert, update, delete on table public.jobs_quoting_items to authenticated;
grant select, insert, update, delete on table public.jobs_quoting_runs to service_role;
grant select, insert, update, delete on table public.jobs_quoting_items to service_role;
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
