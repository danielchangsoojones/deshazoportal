create index if not exists deshazo_external_work_orders_customer_wo_idx
  on public.deshazo_external_work_orders (lower(trim(coalesce(customer, bill_to_name, ''))), work_order_id);

create index if not exists deshazo_external_work_orders_wabash_wo_idx
  on public.deshazo_external_work_orders (work_order_id)
  where lower(trim(coalesce(customer, bill_to_name, ''))) = 'wabash';

create index if not exists deshazo_external_report_cranes_wo_contact_idx
  on public.deshazo_external_report_cranes (work_order_id, contact_code);

create index if not exists deshazo_external_report_cranes_wo_contact_expr_idx
  on public.deshazo_external_report_cranes (work_order_id, upper(trim(contact_code)), id)
  where nullif(trim(contact_code), '') is not null;

create index if not exists deshazo_external_report_inspections_crane_latest_idx
  on public.deshazo_external_report_inspections (crane_row_id, inspection_date desc, completed_at desc, id desc);

create index if not exists deshazo_external_report_sections_inspection_idx
  on public.deshazo_external_report_sections (inspection_row_id);

create index if not exists deshazo_external_report_points_section_condition_idx
  on public.deshazo_external_report_points (section_row_id, condition);

create index if not exists deshazo_external_report_points_section_condition_expr_idx
  on public.deshazo_external_report_points (section_row_id, upper(trim(condition)));

drop function if exists public.get_wabash_location_risk_report(integer);

create function public.get_wabash_location_risk_report(
  p_limit integer default 20
)
returns table (
  rank integer,
  location text,
  location_value text,
  safety_issue_count integer,
  monitor_issue_count integer,
  total_open_issues integer,
  asset_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
  with latest_assets as materialized (
    select distinct on (upper(trim(c.contact_code)))
      upper(trim(c.contact_code)) as unit_id,
      coalesce(
        nullif(trim(concat_ws(
          ', ',
          nullif(trim(w.raw_payload #>> '{customerLocation,shipToCity}'), ''),
          nullif(trim(w.raw_payload #>> '{customerLocation,shipToState}'), '')
        )), ''),
        nullif(trim(w.customer_location_name), ''),
        nullif(trim(w.service_location_name), ''),
        'Unassigned'
      ) as location,
      i.id as inspection_row_id
    from public.deshazo_external_work_orders w
    join public.deshazo_external_report_cranes c
      on c.work_order_id = w.work_order_id
    join public.deshazo_external_report_inspections i
      on i.crane_row_id = c.id
    where
      lower(trim(coalesce(w.customer, w.bill_to_name, ''))) = 'wabash'
      and nullif(trim(c.contact_code), '') is not null
    order by
      upper(trim(c.contact_code)),
      i.inspection_date desc nulls last,
      i.completed_at desc nulls last,
      i.id desc
  ),
  location_aliases as (
    select *
    from (values
      ('apollo_beach', 'Apollo Beach, FL', 'apollo_beach_fl'),
      ('apollo_beach_fl', 'Apollo Beach, FL', 'apollo_beach_fl'),
      ('cadiz', 'Cadiz, KY', 'cadiz_ky'),
      ('cadiz_ky', 'Cadiz, KY', 'cadiz_ky'),
      ('cleburne', 'Cleburne, TX', 'cleburne_tx'),
      ('cleburne_tx', 'Cleburne, TX', 'cleburne_tx'),
      ('elroy', 'Elroy, WI', 'elroy_wi'),
      ('elroy_wi', 'Elroy, WI', 'elroy_wi'),
      ('fond_du_lac', 'Fond du Lac, WI', 'fond_du_lac_wi'),
      ('fond_du_lac_wi', 'Fond du Lac, WI', 'fond_du_lac_wi'),
      ('goshen', 'Goshen, IN', 'goshen_in'),
      ('goshen_in', 'Goshen, IN', 'goshen_in'),
      ('griffin', 'Griffin, GA', 'griffin_ga'),
      ('griffin_ga', 'Griffin, GA', 'griffin_ga'),
      ('griffin_georgia', 'Griffin, GA', 'griffin_ga'),
      ('groveport', 'Groveport, OH', 'groveport_oh'),
      ('groveport_oh', 'Groveport, OH', 'groveport_oh'),
      ('harrison', 'Harrison, AK', 'harrison_ak'),
      ('harrison_ak', 'Harrison, AK', 'harrison_ak'),
      ('jonestown', 'Jonestown, PA', 'jonestown_pa'),
      ('jonestown_pa', 'Jonestown, PA', 'jonestown_pa'),
      ('ligonier', 'Ligonier, IN', 'ligonier_in'),
      ('ligonier_in', 'Ligonier, IN', 'ligonier_in'),
      ('little_falls', 'Little Falls, MN', 'little_falls_mn'),
      ('little_falls_mn', 'Little Falls, MN', 'little_falls_mn'),
      ('mauston', 'Mauston, WI', 'mauston_wi'),
      ('mauston_wi', 'Mauston, WI', 'mauston_wi'),
      ('moreno_valley', 'Moreno Valley, CA', 'moreno_valley_ca'),
      ('moreno_valley_ca', 'Moreno Valley, CA', 'moreno_valley_ca'),
      ('new_lisbon', 'New Lisbon, WI', 'new_lisbon_wi'),
      ('new_lisbon_wi', 'New Lisbon, WI', 'new_lisbon_wi'),
      ('perris', 'Perris, CA', 'perris_ca'),
      ('perris_ca', 'Perris, CA', 'perris_ca')
    ) as aliases(alias_value, location_label, location_value)
  ),
  issue_counts as (
    select
      la.inspection_row_id,
      count(*) filter (where upper(trim(p.condition)) in ('REPAIR', 'DO NOT OPERATE / SAFETY'))::integer as safety_issue_count,
      count(*) filter (where upper(trim(p.condition)) = 'MONITOR')::integer as monitor_issue_count
    from latest_assets la
    join public.deshazo_external_report_sections s
      on s.inspection_row_id = la.inspection_row_id
    join public.deshazo_external_report_points p
      on p.section_row_id = s.id
    where upper(trim(p.condition)) in ('REPAIR', 'MONITOR', 'DO NOT OPERATE / SAFETY')
    group by la.inspection_row_id
  ),
  location_assets as (
    select
      coalesce(alias.location_label, la.location) as location,
      coalesce(alias.location_value, location_keys.raw_location_value) as location_value,
      coalesce(ic.safety_issue_count, 0)::integer as safety_issue_count,
      coalesce(ic.monitor_issue_count, 0)::integer as monitor_issue_count
    from latest_assets la
    cross join lateral (
      select trim(both '_' from regexp_replace(lower(la.location), '[^a-z0-9]+', '_', 'g')) as raw_location_value
    ) location_keys
    left join location_aliases alias
      on alias.alias_value = location_keys.raw_location_value
    left join issue_counts ic
      on ic.inspection_row_id = la.inspection_row_id
  ),
  location_totals as (
    select
      trim(both '_' from location_value) as location_value,
      max(location) as location,
      sum(safety_issue_count)::integer as safety_issue_count,
      sum(monitor_issue_count)::integer as monitor_issue_count,
      (sum(safety_issue_count) + sum(monitor_issue_count))::integer as total_open_issues,
      count(*)::integer as asset_count
    from location_assets
    group by trim(both '_' from location_value)
    having sum(safety_issue_count) + sum(monitor_issue_count) > 0
  ),
  ranked as (
    select
      row_number() over (
        order by safety_issue_count desc, total_open_issues desc, location
      )::integer as rank,
      location,
      location_value,
      safety_issue_count,
      monitor_issue_count,
      total_open_issues,
      asset_count
    from location_totals
  )
  select *
  from ranked
  where rank <= greatest(coalesce(p_limit, 20), 1)
  order by rank;
$$;

grant execute on function public.get_wabash_location_risk_report(integer) to authenticated;
grant execute on function public.get_wabash_location_risk_report(integer) to service_role;
