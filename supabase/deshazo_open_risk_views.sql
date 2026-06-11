create or replace view public.deshazo_open_risk_latest_assets as
with wabash_inspections as (
  select
    upper(trim(c.contact_code)) as unit_id,
    concat_ws(' ', upper(trim(c.contact_code)), nullif(trim(c.description), '')) as unit_name,
    coalesce(nullif(trim(w.customer_location_name), ''), nullif(trim(w.service_location_name), '')) as warehouse_location,
    nullif(trim(c.location), '') as interior_location,
    i.id as inspection_row_id,
    i.inspection_date,
    i.completed_at,
    row_number() over (
      partition by upper(trim(c.contact_code))
      order by i.inspection_date desc nulls last, i.completed_at desc nulls last, i.id desc
    ) as latest_rank
  from public.deshazo_external_work_orders w
  join public.deshazo_external_report_cranes c
    on c.work_order_id = w.work_order_id
  join public.deshazo_external_report_inspections i
    on i.crane_row_id = c.id
  where
    coalesce(w.customer, w.bill_to_name, '') ilike '%wabash%'
    and nullif(trim(c.contact_code), '') is not null
),
latest_assets as (
  select *
  from wabash_inspections
  where latest_rank = 1
)
select
  unit_id,
  unit_name,
  warehouse_location,
  interior_location,
  inspection_row_id,
  inspection_date,
  completed_at
from latest_assets;

create or replace view public.deshazo_open_risk_latest_issue_rows as
with actionable_points as (
  select
    a.unit_id,
    a.unit_name,
    a.warehouse_location,
    a.interior_location,
    a.inspection_row_id,
    a.inspection_date,
    a.completed_at,
    lower(coalesce(nullif(trim(p.point_name), ''), 'uncategorized')) as category,
    case
      when upper(trim(p.condition)) = 'MONITOR' then 'monitor'
      else 'safety'
    end as safety_category,
    case
      when lower(coalesce(s.section_name, '')) like '%hoist%' then
        concat('hoist_', row_number() over (
          partition by a.inspection_row_id, s.id, lower(coalesce(nullif(trim(p.point_name), ''), 'uncategorized'))
          order by coalesce(p.point_index, 0), p.id
        ))
      when lower(coalesce(s.section_name, '')) like '%cranestructuretype%' then 'bridge_1'
      else concat(
        regexp_replace(lower(coalesce(nullif(trim(s.section_name), ''), 'component')), '[^a-z0-9]+', '_', 'g'),
        '_1'
      )
    end as component_type,
    coalesce((
      select string_agg(
        case
          when remark_text.value is null or remark_text.value = '' then null
          when remark_text.value ~ '[.!?]$' then remark_text.value
          else remark_text.value || '.'
        end,
        ' '
        order by remark_text.ordinality
      )
      from (
        select
          nullif(trim(coalesce(
            case
              when jsonb_typeof(remark_item.value) = 'object' then
                coalesce(
                  remark_item.value ->> 'Remark',
                  remark_item.value ->> 'remark',
                  remark_item.value ->> 'content',
                  remark_item.value ->> 'notes',
                  remark_item.value ->> 'value',
                  remark_item.value ->> 'text'
                )
              when remark_item.value is null then ''
              else trim(both '"' from remark_item.value::text)
            end,
            ''
          )), '') as value,
          remark_item.ordinality
      from jsonb_array_elements(
        case
          when p.remarks is null then '[]'::jsonb
          when jsonb_typeof(p.remarks) = 'array' then p.remarks
          else jsonb_build_array(p.remarks)
        end
      ) with ordinality as remark_item(value, ordinality)
      ) remark_text
    ), '') as remarks,
    coalesce(s.section_order, s.section_index, 0) as section_sort,
    coalesce(p.point_index, 0) as point_sort
  from public.deshazo_open_risk_latest_assets a
  join public.deshazo_external_report_sections s
    on s.inspection_row_id = a.inspection_row_id
  join public.deshazo_external_report_points p
    on p.section_row_id = s.id
  where upper(trim(p.condition)) in ('REPAIR', 'MONITOR', 'DO NOT OPERATE / SAFETY')
)
select
  unit_id,
  unit_name,
  warehouse_location,
  interior_location,
  inspection_row_id,
  inspection_date,
  completed_at,
  category,
  safety_category,
  component_type,
  remarks,
  section_sort,
  point_sort,
  1 as remark_sort
from actionable_points;

create or replace view public.deshazo_open_risk_asset_summaries as
with issue_counts as (
  select
    unit_id,
    count(*) filter (where safety_category = 'safety') as safety_issue_count,
    count(*) filter (where safety_category = 'monitor') as monitor_issue_count
  from public.deshazo_open_risk_latest_issue_rows
  group by unit_id
)
select
  a.unit_id,
  a.unit_name,
  a.warehouse_location,
  a.interior_location,
  a.inspection_date,
  coalesce(ic.safety_issue_count, 0)::int as safety_issue_count,
  coalesce(ic.monitor_issue_count, 0)::int as monitor_issue_count,
  (coalesce(ic.safety_issue_count, 0) + coalesce(ic.monitor_issue_count, 0))::int as total_issue_count
from public.deshazo_open_risk_latest_assets a
left join issue_counts ic
  on ic.unit_id = a.unit_id;

create or replace view public.deshazo_open_risk_issue_rows as
with wabash_inspections as (
  select
    upper(trim(c.contact_code)) as unit_id,
    i.id as inspection_row_id,
    i.inspection_date,
    i.completed_at
  from public.deshazo_external_work_orders w
  join public.deshazo_external_report_cranes c
    on c.work_order_id = w.work_order_id
  join public.deshazo_external_report_inspections i
    on i.crane_row_id = c.id
  where
    coalesce(w.customer, w.bill_to_name, '') ilike '%wabash%'
    and nullif(trim(c.contact_code), '') is not null
)
select
  wi.unit_id,
  wi.inspection_row_id,
  wi.inspection_date,
  wi.completed_at,
  lower(coalesce(nullif(trim(p.point_name), ''), 'uncategorized')) as category,
  case
    when upper(trim(p.condition)) = 'MONITOR' then 'monitor'
    else 'safety'
  end as safety_category,
  coalesce(
    case
      when jsonb_typeof(remark_item.value) = 'object' then
        coalesce(
          remark_item.value ->> 'Remark',
          remark_item.value ->> 'remark',
          remark_item.value ->> 'content',
          remark_item.value ->> 'notes',
          remark_item.value ->> 'value',
          remark_item.value ->> 'text'
        )
      when remark_item.value is null then ''
      else trim(both '"' from remark_item.value::text)
    end,
    ''
  ) as remarks
from wabash_inspections wi
join public.deshazo_external_report_sections s
  on s.inspection_row_id = wi.inspection_row_id
join public.deshazo_external_report_points p
  on p.section_row_id = s.id
cross join lateral jsonb_array_elements(
  case
    when p.remarks is null then '[{}]'::jsonb
    when jsonb_typeof(p.remarks) = 'array' and jsonb_array_length(p.remarks) > 0 then p.remarks
    when jsonb_typeof(p.remarks) = 'array' then '[{}]'::jsonb
    else jsonb_build_array(p.remarks)
  end
) with ordinality as remark_item(value, ordinality)
where upper(trim(p.condition)) in ('REPAIR', 'MONITOR', 'DO NOT OPERATE / SAFETY');

grant select on public.deshazo_open_risk_latest_assets to authenticated;
grant select on public.deshazo_open_risk_latest_issue_rows to authenticated;
grant select on public.deshazo_open_risk_asset_summaries to authenticated;
grant select on public.deshazo_open_risk_issue_rows to authenticated;
