create table if not exists public.editable_inspection_menu_items (
  user_id uuid primary key references auth.users (id) on delete cascade,
  menu_sections jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint editable_inspection_menu_items_sections_array
    check (jsonb_typeof(menu_sections) = 'array')
);

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
grant select, insert, update on table public.editable_inspection_menu_items to authenticated;

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
      using (auth.uid() = user_id);
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
      with check (auth.uid() = user_id);
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
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
