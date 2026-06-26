create index if not exists deshazo_external_report_inspections_inspection_date_idx
  on public.deshazo_external_report_inspections (inspection_date desc)
  where inspection_date is not null;

create index if not exists deshazo_external_report_inspections_completed_at_idx
  on public.deshazo_external_report_inspections (completed_at desc)
  where inspection_date is null and completed_at is not null;

create index if not exists deshazo_external_report_points_repair_section_idx
  on public.deshazo_external_report_points (section_row_id)
  where condition ilike 'repair%';

create index if not exists deshazo_external_work_orders_customer_lower_idx
  on public.deshazo_external_work_orders (lower(customer));

create or replace function public.get_top_crane_repair_items(
  p_days integer default 30,
  p_limit integer default 10,
  p_customer text default null
)
returns table (
  rank integer,
  crane_id text,
  crane_description text,
  crane_location text,
  customer text,
  customer_location text,
  latest_report_date date,
  repair_item_count integer,
  work_order_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      (current_date - greatest(coalesce(p_days, 30), 1))::date as cutoff_date,
      (current_date - greatest(coalesce(p_days, 30), 1))::timestamptz as cutoff_at,
      nullif(lower(trim(p_customer)), '') as customer_filter
  ),
  recent_crane_reports as materialized (
    select
      i.id as inspection_row_id,
      coalesce(nullif(trim(c.contact_code), ''), 'Unassigned') as crane_id,
      nullif(trim(c.description), '') as crane_description,
      nullif(trim(c.location), '') as crane_location,
      nullif(trim(coalesce(wo.customer, wo.bill_to_name)), '') as customer,
      nullif(trim(coalesce(wo.customer_location_name, wo.service_location_name)), '') as customer_location,
      coalesce(i.inspection_date, i.completed_at::date, wo.completed_at::date, wo.end_date, wo.start_date) as report_date,
      wo.work_order_id
    from params
    join public.deshazo_external_report_inspections i
      on (
        i.inspection_date >= params.cutoff_date
        or (i.inspection_date is null and i.completed_at >= params.cutoff_at)
      )
    join public.deshazo_external_report_cranes c
      on c.id = i.crane_row_id
    join public.deshazo_external_work_orders wo
      on wo.work_order_id = c.work_order_id
    where
      (params.customer_filter is null or lower(coalesce(wo.customer, wo.bill_to_name)) = params.customer_filter)
  ),
  repair_points as (
    select
      r.crane_id,
      max(r.crane_description) as crane_description,
      max(r.crane_location) as crane_location,
      max(r.customer) as customer,
      max(r.customer_location) as customer_location,
      max(r.report_date) as latest_report_date,
      count(p.id)::integer as repair_item_count,
      count(distinct r.work_order_id)::integer as work_order_count
    from recent_crane_reports r
    join public.deshazo_external_report_sections s
      on s.inspection_row_id = r.inspection_row_id
    join public.deshazo_external_report_points p
      on p.section_row_id = s.id
      and p.condition ilike 'repair%'
    group by r.crane_id
  ),
  ranked as (
    select
      row_number() over (
        order by repair_item_count desc, latest_report_date desc nulls last, crane_id
      )::integer as rank,
      crane_id,
      crane_description,
      crane_location,
      customer,
      customer_location,
      latest_report_date,
      repair_item_count,
      work_order_count
    from repair_points
  )
  select *
  from ranked
  where rank <= greatest(coalesce(p_limit, 10), 1)
  order by rank;
$$;

grant execute on function public.get_top_crane_repair_items(integer, integer, text) to authenticated;
grant execute on function public.get_top_crane_repair_items(integer, integer, text) to service_role;
