do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'editable_inspection_menu_items'
      and column_name = 'menu_sections'
  ) then
    if to_regclass('public.editable_inspection_menu_item_sections_legacy') is null then
      alter table public.editable_inspection_menu_items
        rename to editable_inspection_menu_item_sections_legacy;
    else
      drop table public.editable_inspection_menu_items;
    end if;
  end if;
end
$$;

create table if not exists public.editable_inspection_menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  section_title text not null,
  label text not null,
  description text not null,
  rate numeric(12, 2) not null default 0,
  source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  source_document_name text,
  source_document_bucket text,
  source_document_file_path text,
  display_order integer not null default 0,
  sync_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint editable_inspection_menu_items_section_title_not_blank
    check (char_length(btrim(section_title)) > 0),
  constraint editable_inspection_menu_items_label_not_blank
    check (char_length(btrim(label)) > 0),
  constraint editable_inspection_menu_items_description_not_blank
    check (char_length(btrim(description)) > 0),
  constraint editable_inspection_menu_items_display_order_not_negative
    check (display_order >= 0)
);

alter table public.editable_inspection_menu_items
  add column if not exists source_document_id uuid references public.editable_inspection_documents (id) on delete set null,
  add column if not exists source_document_name text,
  add column if not exists source_document_bucket text,
  add column if not exists source_document_file_path text;

do $$
begin
  if to_regclass('public.editable_inspection_menu_item_sections_legacy') is not null then
    insert into public.editable_inspection_menu_items (
      id,
      user_id,
      section_title,
      label,
      description,
      rate,
      display_order,
      sync_token,
      created_at,
      updated_at
    )
    select
      case
        when item.value->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then (item.value->>'id')::uuid
        else gen_random_uuid()
      end,
      legacy.user_id,
      section.value->>'title',
      item.value->>'label',
      item.value->>'description',
      coalesce(nullif(regexp_replace(item.value->>'rate', '[^0-9.-]', '', 'g'), ''), '0')::numeric(12, 2),
      item.ordinality::integer - 1,
      gen_random_uuid(),
      legacy.updated_at,
      legacy.updated_at
    from public.editable_inspection_menu_item_sections_legacy legacy
    cross join lateral jsonb_array_elements(legacy.menu_sections) section(value)
    cross join lateral jsonb_array_elements(coalesce(section.value->'items', '[]'::jsonb)) with ordinality item(value, ordinality)
    where jsonb_typeof(legacy.menu_sections) = 'array'
      and jsonb_typeof(coalesce(section.value->'items', '[]'::jsonb)) = 'array'
      and section.value->>'title' is not null
      and item.value->>'label' is not null
      and item.value->>'description' is not null
      and not exists (
        select 1
        from public.editable_inspection_menu_items existing_item
        where existing_item.user_id = legacy.user_id
      );
  end if;
end
$$;

drop table if exists public.editable_inspection_menu_item_sections_legacy;

create index if not exists editable_inspection_menu_items_user_section_order_idx
  on public.editable_inspection_menu_items (user_id, section_title, display_order);

create index if not exists editable_inspection_menu_items_user_label_idx
  on public.editable_inspection_menu_items (user_id, label);

create index if not exists editable_inspection_menu_items_user_sync_token_idx
  on public.editable_inspection_menu_items (user_id, sync_token);

create index if not exists editable_inspection_menu_items_user_source_document_idx
  on public.editable_inspection_menu_items (user_id, source_document_id);

create or replace function public.set_editable_inspection_menu_items_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists editable_inspection_menu_items_updated_at_trigger
  on public.editable_inspection_menu_items;

create trigger editable_inspection_menu_items_updated_at_trigger
before insert or update on public.editable_inspection_menu_items
for each row
execute function public.set_editable_inspection_menu_items_updated_at();

alter table public.editable_inspection_menu_items enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.editable_inspection_menu_items to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_menu_items'
      and policyname = 'Authenticated users can read their inspection menu items'
  ) then
    create policy "Authenticated users can read their inspection menu items"
      on public.editable_inspection_menu_items
      for select
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_menu_items'
      and policyname = 'Authenticated users can insert their inspection menu items'
  ) then
    create policy "Authenticated users can insert their inspection menu items"
      on public.editable_inspection_menu_items
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_menu_items'
      and policyname = 'Authenticated users can update their inspection menu items'
  ) then
    create policy "Authenticated users can update their inspection menu items"
      on public.editable_inspection_menu_items
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'editable_inspection_menu_items'
      and policyname = 'Authenticated users can delete their inspection menu items'
  ) then
    create policy "Authenticated users can delete their inspection menu items"
      on public.editable_inspection_menu_items
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;
