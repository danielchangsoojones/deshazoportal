create table if not exists public.customer_facilities (
  customer text not null,
  location_value text not null,
  location_label text not null,
  is_active boolean not null default true,
  inactive_reason text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_facilities_customer_not_blank
    check (char_length(btrim(customer)) > 0),
  constraint customer_facilities_location_value_not_blank
    check (char_length(btrim(location_value)) > 0),
  constraint customer_facilities_location_label_not_blank
    check (char_length(btrim(location_label)) > 0),
  primary key (customer, location_value)
);

create index if not exists customer_facilities_customer_active_idx
  on public.customer_facilities (customer, is_active, location_label);

create or replace function public.touch_customer_facilities_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists customer_facilities_touch_updated_at
  on public.customer_facilities;

create trigger customer_facilities_touch_updated_at
before insert or update on public.customer_facilities
for each row
execute function public.touch_customer_facilities_updated_at();

alter table public.customer_facilities enable row level security;

grant usage on schema public to authenticated, service_role;
grant select on table public.customer_facilities to authenticated;
grant select, insert, update, delete on table public.customer_facilities to service_role;

drop policy if exists "Authenticated users can read customer facilities"
  on public.customer_facilities;

create policy "Authenticated users can read customer facilities"
  on public.customer_facilities
  for select
  to authenticated
  using (true);

insert into public.customer_facilities (
  customer,
  location_value,
  location_label,
  is_active,
  inactive_reason
)
values
  ('wabash', 'apollo_beach_fl', 'Apollo Beach, FL', true, null),
  ('wabash', 'cadiz_ky', 'Cadiz, KY', true, null),
  ('wabash', 'cleburne_tx', 'Cleburne, TX', true, null),
  ('wabash', 'elroy_wi', 'Elroy, WI', true, null),
  ('wabash', 'fond_du_lac_wi', 'Fond du Lac, WI', true, null),
  ('wabash', 'goshen_in', 'Goshen, IN', false, 'No longer part of Wabash'),
  ('wabash', 'griffin_ga', 'Griffin, GA', true, null),
  ('wabash', 'groveport_oh', 'Groveport, OH', true, null),
  ('wabash', 'harrison_ak', 'Harrison, AK', true, null),
  ('wabash', 'harrison_ar', 'Harrison, AR', true, null),
  ('wabash', 'jonestown_pa', 'Jonestown, PA', true, null),
  ('wabash', 'ligonier_in', 'Ligonier, IN', false, 'No longer part of Wabash'),
  ('wabash', 'little_falls_mn', 'Little Falls, MN', true, null),
  ('wabash', 'maustin_wi', 'Maustin, WI', true, null),
  ('wabash', 'mauston_wi', 'Mauston, WI', true, null),
  ('wabash', 'moreno_valley_ca', 'Moreno Valley, CA', true, null),
  ('wabash', 'new_lisbon_wi', 'New Lisbon, WI', true, null),
  ('wabash', 'perris_ca', 'Perris, CA', true, null)
on conflict (customer, location_value) do update
set
  location_label = excluded.location_label,
  is_active = excluded.is_active,
  inactive_reason = excluded.inactive_reason;
