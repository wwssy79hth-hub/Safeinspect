-- ============================================================
-- SafeInspect — Feature groups (range labels)
-- Point features placed as a run (e.g. a row of davit bases)
-- share a group_id: the map suppresses their individual labels
-- and shows one range label ("DB-001 to DB-005") instead,
-- matching the Anchor Safe drawing convention.
-- ============================================================

alter table public.plan_features
  add column group_id uuid;

create index idx_plan_features_group
  on public.plan_features(site_plan_id, group_id)
  where group_id is not null;
