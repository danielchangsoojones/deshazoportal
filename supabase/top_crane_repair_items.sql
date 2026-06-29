drop function if exists public.get_top_crane_repair_items(integer, integer, text);

create function public.get_top_crane_repair_items(
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
  latest_work_order_id bigint,
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
      nullif(lower(trim(p_customer)), '') as customer_filter
  ),
  recent_reports as materialized (
    select
      wo.work_order_id,
      nullif(trim(coalesce(wo.customer, wo.bill_to_name)), '') as customer,
      nullif(trim(coalesce(wo.customer_location_name, wo.service_location_name)), '') as customer_location,
      coalesce(
        nullif(ir.raw_payload->>'inspectionDate', '')::date,
        wo.completed_at::date,
        wo.end_date,
        wo.start_date,
        ir.synced_at::date
      ) as report_date,
      ir.raw_payload
    from params
    join public.deshazo_external_work_orders wo
      on coalesce(wo.completed_at::date, wo.end_date, wo.start_date) >= params.cutoff_date
    join public.deshazo_external_inspection_reports ir
      on ir.work_order_id = wo.work_order_id
    where
      (params.customer_filter is null or lower(coalesce(wo.customer, wo.bill_to_name)) = params.customer_filter)
  ),
  crane_reports as materialized (
    select
      rr.work_order_id,
      rr.customer,
      rr.customer_location,
      rr.report_date,
      crane_item.value as crane_payload,
      coalesce(
        nullif(trim(crane_item.value #>> '{crane,contactCode}'), ''),
        nullif(trim(crane_item.value #>> '{crane,description}'), ''),
        'Unassigned'
      ) as crane_id,
      nullif(trim(crane_item.value #>> '{crane,description}'), '') as crane_description,
      nullif(trim(crane_item.value #>> '{crane,location}'), '') as crane_location
    from recent_reports rr
    cross join lateral jsonb_array_elements(coalesce(rr.raw_payload->'cranes', '[]'::jsonb)) as crane_item(value)
  ),
  repair_items as (
    select
      cr.work_order_id,
      cr.customer,
      cr.customer_location,
      cr.report_date,
      cr.crane_id,
      cr.crane_description,
      cr.crane_location
    from crane_reports cr
    cross join lateral jsonb_array_elements(coalesce(cr.crane_payload->'inspections', '[]'::jsonb)) as inspection_item(value)
    cross join lateral jsonb_array_elements(coalesce(inspection_item.value->'sections', '[]'::jsonb)) as section_item(value)
    cross join lateral jsonb_array_elements(coalesce(section_item.value->'points', '[]'::jsonb)) as point_item(value)
    where lower(trim(coalesce(point_item.value->>'condition', point_item.value->>'value', ''))) like 'repair%'
  ),
  repair_points as (
    select
      crane_id,
      max(crane_description) as crane_description,
      max(crane_location) as crane_location,
      max(customer) as customer,
      max(customer_location) as customer_location,
      max(report_date) as latest_report_date,
      (array_agg(work_order_id order by report_date desc nulls last, work_order_id desc))[1] as latest_work_order_id,
      count(*)::integer as repair_item_count,
      count(distinct work_order_id)::integer as work_order_count
    from repair_items
    group by crane_id
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
      latest_work_order_id,
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
