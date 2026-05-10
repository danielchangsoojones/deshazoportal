insert into storage.buckets (id, name, public, allowed_mime_types)
values ('editable-inspection-documents', 'editable-inspection-documents', false, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.editable_inspection_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_name text not null,
  description text not null default '',
  bucket_id text not null default 'editable-inspection-documents',
  file_path text not null,
  original_file_name text not null,
  file_size bigint not null default 0,
  content_type text not null default 'application/pdf',
  source text not null default 'Uploaded PDF',
  stable_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint editable_inspection_documents_name_not_blank
    check (char_length(btrim(document_name)) > 0),
  constraint editable_inspection_documents_file_path_not_blank
    check (char_length(btrim(file_path)) > 0),
  constraint editable_inspection_documents_pdf_content_type
    check (content_type = 'application/pdf')
);

create unique index if not exists editable_inspection_documents_user_file_path_key
  on public.editable_inspection_documents (user_id, file_path);

create unique index if not exists editable_inspection_documents_user_stable_key_idx
  on public.editable_inspection_documents (user_id, stable_key)
  where stable_key is not null;

create index if not exists editable_inspection_documents_user_created_idx
  on public.editable_inspection_documents (user_id, created_at desc);

create or replace function public.set_editable_inspection_documents_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists editable_inspection_documents_updated_at_trigger
  on public.editable_inspection_documents;

create trigger editable_inspection_documents_updated_at_trigger
before insert or update on public.editable_inspection_documents
for each row
execute function public.set_editable_inspection_documents_updated_at();

alter table public.editable_inspection_documents enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.editable_inspection_documents to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_documents'
      and policyname = 'Authenticated users can read their editable inspection documents'
  ) then
    create policy "Authenticated users can read their editable inspection documents"
      on public.editable_inspection_documents
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_documents'
      and policyname = 'Authenticated users can insert their editable inspection documents'
  ) then
    create policy "Authenticated users can insert their editable inspection documents"
      on public.editable_inspection_documents
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_documents'
      and policyname = 'Authenticated users can update their editable inspection documents'
  ) then
    create policy "Authenticated users can update their editable inspection documents"
      on public.editable_inspection_documents
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_documents'
      and policyname = 'Authenticated users can delete their editable inspection documents'
  ) then
    create policy "Authenticated users can delete their editable inspection documents"
      on public.editable_inspection_documents
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can read their editable inspection PDFs'
  ) then
    create policy "Authenticated users can read their editable inspection PDFs"
      on storage.objects
      for select
      to authenticated
      using (
        bucket_id = 'editable-inspection-documents'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload their editable inspection PDFs'
  ) then
    create policy "Authenticated users can upload their editable inspection PDFs"
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'editable-inspection-documents'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can update their editable inspection PDFs'
  ) then
    create policy "Authenticated users can update their editable inspection PDFs"
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'editable-inspection-documents'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      )
      with check (
        bucket_id = 'editable-inspection-documents'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can delete their editable inspection PDFs'
  ) then
    create policy "Authenticated users can delete their editable inspection PDFs"
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'editable-inspection-documents'
        and (storage.foldername(name))[1] = (select auth.uid())::text
      );
  end if;
end
$$;
