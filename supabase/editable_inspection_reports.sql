alter table public.jobs_quoting_items
  add column if not exists report_name text,
  add column if not exists source_document_name text,
  add column if not exists report_data jsonb not null default '{}'::jsonb,
  add column if not exists repair_sections jsonb not null default '[]'::jsonb,
  add column if not exists cost_sections jsonb not null default '[]'::jsonb,
  add column if not exists block_visibility jsonb not null default '{}'::jsonb,
  add column if not exists estimate_note_visibility jsonb not null default '{}'::jsonb,
  add column if not exists repair_section_visibility jsonb not null default '{}'::jsonb,
  add column if not exists text_boxes jsonb not null default '[]'::jsonb,
  add column if not exists equipment_rental_settings jsonb not null default '{}'::jsonb;

do $$
begin
  if to_regclass('public.editable_inspection_reports') is not null then
    execute $migration$
      update public.jobs_quoting_items quote_item
      set report_name = editable_report.report_name,
          source_document_name = editable_report.source_document_name,
          job_number = coalesce(editable_report.job_number, quote_item.job_number),
          report_data = editable_report.report_data,
          repair_sections = editable_report.repair_sections,
          cost_sections = editable_report.cost_sections,
          block_visibility = editable_report.block_visibility,
          estimate_note_visibility = editable_report.estimate_note_visibility,
          repair_section_visibility = editable_report.repair_section_visibility,
          text_boxes = editable_report.text_boxes,
          equipment_rental_settings = editable_report.equipment_rental_settings
      from public.editable_inspection_reports editable_report
      where editable_report.jobs_quoting_item_id = quote_item.id
        and (
          quote_item.report_name is null
          or editable_report.updated_at >= quote_item.updated_at
        )
    $migration$;
  end if;
end
$$;

drop table if exists public.editable_inspection_reports;
drop function if exists public.set_editable_inspection_reports_updated_at();

notify pgrst, 'reload schema';
