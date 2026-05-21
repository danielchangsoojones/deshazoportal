create table if not exists public.editable_inspection_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  jobs_quoting_item_id uuid references public.jobs_quoting_items (id) on delete set null,
  report_name text not null,
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
  constraint editable_inspection_reports_name_not_blank
    check (char_length(btrim(report_name)) > 0)
);

create index if not exists editable_inspection_reports_user_updated_idx
  on public.editable_inspection_reports (user_id, updated_at desc);

create index if not exists editable_inspection_reports_user_jobs_quoting_item_idx
  on public.editable_inspection_reports (user_id, jobs_quoting_item_id)
  where jobs_quoting_item_id is not null;

create or replace function public.set_editable_inspection_reports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists editable_inspection_reports_updated_at_trigger
  on public.editable_inspection_reports;

create trigger editable_inspection_reports_updated_at_trigger
before insert or update on public.editable_inspection_reports
for each row
execute function public.set_editable_inspection_reports_updated_at();

alter table public.editable_inspection_reports enable row level security;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on table public.editable_inspection_reports to authenticated;
grant select, insert, update, delete on table public.editable_inspection_reports to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_reports'
      and policyname = 'Authenticated users can read their editable inspection reports'
  ) then
    create policy "Authenticated users can read their editable inspection reports"
      on public.editable_inspection_reports
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_reports'
      and policyname = 'Authenticated users can insert their editable inspection reports'
  ) then
    create policy "Authenticated users can insert their editable inspection reports"
      on public.editable_inspection_reports
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_reports'
      and policyname = 'Authenticated users can update their editable inspection reports'
  ) then
    create policy "Authenticated users can update their editable inspection reports"
      on public.editable_inspection_reports
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_reports'
      and policyname = 'Authenticated users can delete their editable inspection reports'
  ) then
    create policy "Authenticated users can delete their editable inspection reports"
      on public.editable_inspection_reports
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
