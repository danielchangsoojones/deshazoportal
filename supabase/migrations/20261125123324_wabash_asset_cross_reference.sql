create table if not exists public.wabash_asset_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  storage_path text not null,
  file_sha256 text not null,
  sheet_names text[] not null default '{}',
  source_row_count integer not null default 0,
  is_duplicate boolean not null default false,
  duplicate_of_import_id uuid references public.wabash_asset_imports(id) on delete set null,
  imported_by uuid references auth.users(id) on delete set null,
  imported_at timestamptz not null default timezone('utc', now()),
  constraint wabash_asset_imports_sha256_check check (file_sha256 ~ '^[a-f0-9]{64}$')
);

create table if not exists public.wabash_asset_cross_references (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.wabash_asset_imports(id) on delete cascade,
  sheet_name text not null,
  source_row_number integer not null,
  plant text,
  wabash_asset_number text,
  equipment_type text,
  structural_support text,
  below_hook_device_type text,
  serial_number text,
  rated_capacity text,
  location text,
  certification text,
  d_number text,
  candidate_d_numbers text[] not null default '{}',
  match_status text not null default 'unmatched',
  match_method text,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint wabash_asset_cross_references_status_check
    check (match_status in ('confirmed', 'candidate', 'review', 'unmatched')),
  constraint wabash_asset_cross_references_source_row_key
    unique (import_id, sheet_name, source_row_number)
);

create index if not exists wabash_asset_cross_references_plant_idx
  on public.wabash_asset_cross_references (plant);
create index if not exists wabash_asset_cross_references_asset_number_idx
  on public.wabash_asset_cross_references (wabash_asset_number);
create index if not exists wabash_asset_cross_references_d_number_idx
  on public.wabash_asset_cross_references (d_number);
create index if not exists wabash_asset_cross_references_status_idx
  on public.wabash_asset_cross_references (match_status);
create index if not exists wabash_asset_imports_sha_idx
  on public.wabash_asset_imports (file_sha256);

alter table public.wabash_asset_imports enable row level security;
alter table public.wabash_asset_cross_references enable row level security;

grant select on public.wabash_asset_imports, public.wabash_asset_cross_references to authenticated;
grant insert, update, delete on public.wabash_asset_imports, public.wabash_asset_cross_references to authenticated;

drop policy if exists "Authenticated users can read Wabash asset imports" on public.wabash_asset_imports;
create policy "Authenticated users can read Wabash asset imports"
  on public.wabash_asset_imports for select to authenticated using (true);

drop policy if exists "Developers can manage Wabash asset imports" on public.wabash_asset_imports;
create policy "Developers can manage Wabash asset imports"
  on public.wabash_asset_imports for all to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'))
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));

drop policy if exists "Authenticated users can read Wabash asset cross references" on public.wabash_asset_cross_references;
create policy "Authenticated users can read Wabash asset cross references"
  on public.wabash_asset_cross_references for select to authenticated using (true);

drop policy if exists "Developers can manage Wabash asset cross references" on public.wabash_asset_cross_references;
create policy "Developers can manage Wabash asset cross references"
  on public.wabash_asset_cross_references for all to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'))
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wabash-asset-cross-reference', 'wabash-asset-cross-reference', false, 20971520,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated users can read Wabash asset source workbooks" on storage.objects;
create policy "Authenticated users can read Wabash asset source workbooks"
  on storage.objects for select to authenticated using (bucket_id = 'wabash-asset-cross-reference');

drop policy if exists "Developers can upload Wabash asset source workbooks" on storage.objects;
create policy "Developers can upload Wabash asset source workbooks"
  on storage.objects for insert to authenticated with check (
    bucket_id = 'wabash-asset-cross-reference'
    and exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer')
  );
