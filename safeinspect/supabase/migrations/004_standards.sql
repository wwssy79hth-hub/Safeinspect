-- ============================================================
-- SafeInspect — Migration 004: Standards as data
--
-- Extraction plan item 2 (docs/heighttrack-comparison-review.md §6).
-- Ports HeightTrack's standards model: editions, asset classes
-- and inspection rules are rows with effective dates, so a
-- standards revision is an INSERT, not a deploy.
--
-- Context: AS/NZS 1891.4 was revised in 2025 (first revision
-- since 2009) with changed inspection intervals. SafeInspect
-- previously hard-coded "AS/NZS 1891.4:2009" strings across the
-- schema and client.
--
-- ⚠ The seeded rules below are drawn from Standards Australia's
--   published summary of the 2025 revision and industry
--   guidance, NOT the (paywalled) standard text. Every row is
--   marked unverified (verified_by / verified_at null). Have a
--   competent person confirm intervals and test methods before
--   any customer relies on a due date computed from them.
-- ============================================================

-- ─── Standards (code + edition, with effective window) ───────

create table public.standards (
  code            text not null,          -- 'AS/NZS 1891.4'
  edition         text not null,          -- '2025'
  title           text not null,
  effective_from  date not null,
  superseded_from date,                   -- null while current
  primary key (code, edition)
);

-- ─── Asset classes ───────────────────────────────────────────
-- Keyed by SafeInspect's existing 21-category enum so the
-- capture UI and the rules engine share one vocabulary.

create table public.asset_classes (
  code          asset_category primary key,
  name          text not null,
  standard_code text not null,            -- governing standard family
  is_installed  boolean not null default true  -- false = removable equipment / PPE
);

-- ─── Inspection rules ────────────────────────────────────────
-- The interval + test method for (class × standard edition ×
-- service condition). The 2025 revision is the argument for this
-- table: intervals changed, and the compliance route for
-- multi-fastener anchors became documentary.

create table public.inspection_rules (
  asset_class_code  asset_category not null references public.asset_classes(code),
  standard_code     text not null,
  standard_edition  text not null,
  service_condition text not null default 'standard'
                    check (service_condition in ('standard', 'harsh')),
  interval_months   integer not null check (interval_months > 0),
  test_method       text not null
                    check (test_method in
                      ('proof_load', 'documentation_review',
                       'functional_test', 'visual_inspection')),
  effective_from    date not null,
  source_note       text,
  verified_by       uuid references public.profiles(id),
  verified_at       timestamptz,
  primary key (asset_class_code, standard_code, standard_edition, service_condition),
  foreign key (standard_code, standard_edition)
    references public.standards(code, edition)
);

-- ─── RLS: read-only reference data ───────────────────────────
-- No client write policies at all (HeightTrack pattern):
-- revisions to standards go in through the service role,
-- deliberately.

alter table public.standards        enable row level security;
alter table public.asset_classes    enable row level security;
alter table public.inspection_rules enable row level security;

create policy "Standards are readable"
  on public.standards for select
  using (auth.role() = 'authenticated');

create policy "Asset classes are readable"
  on public.asset_classes for select
  using (auth.role() = 'authenticated');

create policy "Inspection rules are readable"
  on public.inspection_rules for select
  using (auth.role() = 'authenticated');

-- ─── Rule resolution functions ───────────────────────────────
-- applicable_rule: the rule for a class under the edition in
-- force on a given date, preferring an exact service-condition
-- match over the 'standard' fallback.
--
-- next_due_date: last pass + the interval, resolved AS OF the
-- inspection date — so a later standards revision does not
-- silently rewrite already-recorded due dates (HeightTrack's
-- "stamp the edition, never derive at read time" rule).

create or replace function public.applicable_rule(
  p_class     asset_category,
  p_condition text default 'standard',
  p_on        date default current_date
)
returns public.inspection_rules
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.inspection_rules r
  join public.standards s
    on s.code = r.standard_code and s.edition = r.standard_edition
  where r.asset_class_code = p_class
    and r.effective_from <= p_on
    and s.effective_from  <= p_on
    and (s.superseded_from is null or s.superseded_from > p_on)
    and r.service_condition in (p_condition, 'standard')
  order by
    (r.service_condition = p_condition) desc,  -- exact condition first
    s.effective_from desc,                     -- latest edition in force
    r.effective_from desc
  limit 1;
$$;

create or replace function public.next_due_date(
  p_class     asset_category,
  p_condition text,
  p_last_pass date
)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_last_pass
       + make_interval(months => (public.applicable_rule(p_class, p_condition, p_last_pass)).interval_months))::date;
$$;

-- ─── New default for standard_referenced ─────────────────────
-- New assets reference the current edition. Existing rows keep
-- whatever edition they were captured under — that history is
-- correct and must not be rewritten (a 2024 record assessed
-- under 1891.4:2009 should say so).

alter table public.inspection_assets
  alter column standard_referenced set default 'AS/NZS 1891.4:2025';

-- ============================================================
-- Seed data
-- ============================================================

insert into public.standards (code, edition, title, effective_from, superseded_from) values
  ('AS/NZS 1891.4', '2009', 'Industrial fall-arrest systems and devices — Selection, use and maintenance', '2009-01-01', '2025-07-01'),
  ('AS/NZS 1891.4', '2025', 'Personal equipment for work at height — Selection, use and maintenance', '2025-07-01', null),
  ('AS/NZS 1891.1', '2007', 'Industrial fall-arrest systems and devices — Harnesses and ancillary equipment', '2007-01-01', null),
  ('AS/NZS 1891.2', '2001', 'Industrial fall-arrest systems and devices — Horizontal lifeline and rail systems', '2001-01-01', null),
  ('AS 1657',       '2018', 'Fixed platforms, walkways, stairways and ladders — Design, construction and installation', '2018-01-01', null),
  ('AS/NZS 5532',   '2013', 'Manufacturing requirements for single-point anchor device used for harness-based work at height', '2013-01-01', null),
  ('AS 1319',       '1994', 'Safety signs for the occupational environment', '1994-01-01', null),
  ('AS/NZS 4600',   '2018', 'Cold-formed steel structures', '2018-01-01', null)
on conflict do nothing;

insert into public.asset_classes (code, name, standard_code, is_installed) values
  ('APS',  'Access Point Signage',      'AS 1319',       true),
  ('ST',   'Strops',                    'AS/NZS 1891.1', false),
  ('TMAP', 'Top Mount Anchor Point',    'AS/NZS 1891.4', true),
  ('CAP',  'Concrete Anchor Point',     'AS/NZS 1891.4', true),
  ('HSL',  'Horizontal Static Line',    'AS/NZS 1891.4', true),
  ('VSL',  'Vertical Static Line',      'AS/NZS 1891.4', true),
  ('LD',   'Ladder',                    'AS 1657',       true),
  ('GR',   'Guardrail',                 'AS 1657',       true),
  ('WW',   'Walkway',                   'AS 1657',       true),
  ('STP',  'Step',                      'AS 1657',       true),
  ('STR',  'Stair',                     'AS 1657',       true),
  ('SL',   'Step Ladder',               'AS 1657',       false),
  ('EK',   'Guardrail Entry Kit',       'AS 1657',       true),
  ('PL',   'Platform',                  'AS 1657',       true),
  ('GHK',  'Guardrail Hatch Kit',       'AS 1657',       true),
  ('SS',   'Safety Signage',            'AS 1319',       true),
  ('DB',   'Davit Base',                'AS/NZS 1891.4', true),
  ('RR',   'Rigid Rail System',         'AS/NZS 1891.4', true),
  ('SPM',  'Skylight Protection Mesh',  'AS/NZS 4600',   true),
  ('OSE',  'Other Safety Equipment',    'AS/NZS 1891.4', true),
  ('R',    'Recommendation',            'AS/NZS 1891.4', true)
on conflict do nothing;

-- Rules under the editions in force today. Deliberately no rows
-- for the 2009 edition of 1891.4: a lookup for a pre-2025 date
-- returning nothing is the correct failure mode until those
-- historical intervals are confirmed (same stance HeightTrack
-- documents for historical import).

insert into public.inspection_rules
  (asset_class_code, standard_code, standard_edition, service_condition,
   interval_months, test_method, effective_from, source_note)
values
  -- Installed fall-arrest devices — 12 months (6 in harsh service)
  ('TMAP', 'AS/NZS 1891.4', '2025', 'standard', 12, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — 2025 revision summary: installed anchors 12-monthly. Multi-fastener anchors may instead follow the documentary route; split TMAP/CAP by fixing type before relying on this.'),
  ('TMAP', 'AS/NZS 1891.4', '2025', 'harsh',     6, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — harsh service (UV / coastal / corrosive) per industry guidance.'),
  ('CAP',  'AS/NZS 1891.4', '2025', 'standard', 12, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — as TMAP; documentary route may apply to chemically-fixed multi-fastener anchors.'),
  ('CAP',  'AS/NZS 1891.4', '2025', 'harsh',     6, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('HSL',  'AS/NZS 1891.4', '2025', 'standard', 12, 'functional_test', '2025-07-01', 'UNVERIFIED seed — installed static lines 12-monthly; tension / operation check.'),
  ('HSL',  'AS/NZS 1891.4', '2025', 'harsh',     6, 'functional_test', '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('VSL',  'AS/NZS 1891.4', '2025', 'standard', 12, 'functional_test', '2025-07-01', 'UNVERIFIED seed — installed static lines 12-monthly.'),
  ('VSL',  'AS/NZS 1891.4', '2025', 'harsh',     6, 'functional_test', '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('DB',   'AS/NZS 1891.4', '2025', 'standard', 12, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — installed davit bases 12-monthly.'),
  ('DB',   'AS/NZS 1891.4', '2025', 'harsh',     6, 'proof_load',      '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('RR',   'AS/NZS 1891.4', '2025', 'standard', 12, 'functional_test', '2025-07-01', 'UNVERIFIED seed — installed rail systems 12-monthly.'),
  ('RR',   'AS/NZS 1891.4', '2025', 'harsh',     6, 'functional_test', '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('OSE',  'AS/NZS 1891.4', '2025', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — catch-all class; confirm per actual equipment.'),
  ('R',    'AS/NZS 1891.4', '2025', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — recommendation pseudo-class; re-review annually.'),

  -- Removable equipment / PPE — 6 months (3 in harsh service)
  ('ST',   'AS/NZS 1891.1', '2007', 'standard',  6, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — 2025 revision summary: removable items (strops, lanyards, connectors) 6-monthly.'),
  ('ST',   'AS/NZS 1891.1', '2007', 'harsh',     3, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — harsh service per industry guidance.'),
  ('SL',   'AS 1657',       '2018', 'standard',  6, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — portable step ladders treated as removable equipment.'),

  -- AS 1657 structures — 12-monthly visual
  ('LD',   'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — fixed ladders 12-monthly visual per industry practice.'),
  ('GR',   'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('WW',   'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('STP',  'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('STR',  'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('EK',   'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('PL',   'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('GHK',  'AS 1657', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('SPM',  'AS/NZS 4600', '2018', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed — skylight mesh 12-monthly visual.'),

  -- Signage — 12-monthly visual
  ('APS',  'AS 1319', '1994', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.'),
  ('SS',   'AS 1319', '1994', 'standard', 12, 'visual_inspection', '2025-07-01', 'UNVERIFIED seed.')
on conflict do nothing;
