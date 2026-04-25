create extension if not exists pgcrypto;

create table if not exists public.asset_notification_events (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  event_type text not null check (event_type in ('new_report', 'repair_completed')),
  event_key text not null check (char_length(btrim(event_key)) > 0),
  event_label text not null default '',
  document_type text not null default '',
  inspection_date text not null default '',
  document_url text not null default '',
  first_seen_at timestamptz not null default timezone('utc', now()),
  first_sent_at timestamptz,
  last_status text not null default 'seen',
  recipient_count integer not null default 0 check (recipient_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  unique (unit_id, event_type, event_key)
);

create index if not exists asset_notification_events_unit_id_event_type_idx
  on public.asset_notification_events (unit_id, event_type, first_seen_at desc);

alter table public.asset_notification_events enable row level security;

grant usage on schema public to authenticated;
grant select on table public.asset_notification_events to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'asset_notification_events'
      and policyname = 'Authenticated users can read asset notification events'
  ) then
    create policy "Authenticated users can read asset notification events"
      on public.asset_notification_events
      for select
      to authenticated
      using (true);
  end if;
end
$$;
