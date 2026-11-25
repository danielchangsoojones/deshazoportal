drop policy if exists "Developers can manage Wabash asset imports" on public.wabash_asset_imports;
create policy "Developers can insert Wabash asset imports"
  on public.wabash_asset_imports for insert to authenticated
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));
create policy "Developers can update Wabash asset imports"
  on public.wabash_asset_imports for update to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'))
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));
create policy "Developers can delete Wabash asset imports"
  on public.wabash_asset_imports for delete to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));

drop policy if exists "Developers can manage Wabash asset cross references" on public.wabash_asset_cross_references;
create policy "Developers can insert Wabash asset cross references"
  on public.wabash_asset_cross_references for insert to authenticated
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));
create policy "Developers can update Wabash asset cross references"
  on public.wabash_asset_cross_references for update to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'))
  with check (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));
create policy "Developers can delete Wabash asset cross references"
  on public.wabash_asset_cross_references for delete to authenticated
  using (exists (select 1 from public.user_tags where user_tags.user_id = (select auth.uid()) and lower(btrim(user_tags.tag)) = 'developer'));
