-- ============================================================
-- SafeInspect — Asset registry tests (migration 005)
-- Run with:  supabase test db
--
-- The asset is the unit of certification. These tests pin the
-- auto-link trigger (capture builds the registry), the due-date
-- engine's fail-retracts / pass-restores semantics, and the
-- viewer/editor write boundary.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

-- Fixtures
insert into auth.users (id, email) values
  ('b0000000-0000-0000-0000-000000000001', 'inspector@test.local'),
  ('b0000000-0000-0000-0000-000000000002', 'viewer@test.local');
update public.profiles set role = 'viewer' where id = 'b0000000-0000-0000-0000-000000000002';

insert into public.clients (id, name) values
  ('b1111111-1111-1111-1111-111111111111', 'Registry Client');
insert into public.sites (id, client_id, name, address, service_condition) values
  ('b2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111',
   'Harsh Site', '1 Coastal Rd', 'harsh');
insert into public.inspections (id, job_number, client_name, site_name, site_address,
                                date_of_inspection, certifier_id, created_by, site_id)
values ('b3333333-3333-3333-3333-333333333333', 'JOB-R1', 'Registry Client', 'Harsh Site',
        '1 Coastal Rd', '2026-08-22',
        'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
        'b2222222-2222-2222-2222-222222222222');

-- Capture auto-registers the durable asset
insert into public.inspection_assets (id, inspection_id, category, asset_code, status, location_on_site)
values ('b4444444-4444-4444-4444-444444444444', 'b3333333-3333-3333-3333-333333333333',
        'TMAP', 'TMAP-001', 'compliant', 'North parapet');

select is(
  (select count(*)::int from public.assets
   where site_id = 'b2222222-2222-2222-2222-222222222222' and tag = 'TMAP-001'), 1,
  'saving a capture auto-creates the durable asset');

select ok(
  (select asset_id is not null from public.inspection_assets
   where id = 'b4444444-4444-4444-4444-444444444444'),
  'the capture is linked to its durable asset (dual key)');

select is(
  (select location_note from public.assets where tag = 'TMAP-001'),
  'North parapet',
  'the asset carries the captured location');

-- Due date: compliant on a HARSH site → +6 months
select is(
  (select next_due_on from public.assets where tag = 'TMAP-001'),
  date '2027-02-22',
  'harsh-site compliant pass sets next due +6 months');

-- A superseding fail retracts the date
update public.inspection_assets set status = 'non_compliant'
where id = 'b4444444-4444-4444-4444-444444444444';

select ok(
  (select next_due_on is null from public.assets where tag = 'TMAP-001'),
  'a fail retracts the due date');

-- A later passing visit restores it against the SAME asset
insert into public.inspections (id, job_number, client_name, site_name, site_address,
                                date_of_inspection, certifier_id, created_by, site_id)
values ('b5555555-5555-5555-5555-555555555555', 'JOB-R2', 'Registry Client', 'Harsh Site',
        '1 Coastal Rd', '2026-09-01',
        'b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001',
        'b2222222-2222-2222-2222-222222222222');
insert into public.inspection_assets (inspection_id, category, asset_code, status)
values ('b5555555-5555-5555-5555-555555555555', 'TMAP', 'TMAP-001', 'compliant');

select is(
  (select next_due_on from public.assets where tag = 'TMAP-001'),
  date '2027-03-01',
  'a later pass restores the due date from the new pass date');

select is(
  (select count(*)::int from public.assets where tag = 'TMAP-001'), 1,
  'two visits, one durable asset (unique site+tag)');

select is(
  (select count(*)::int from public.inspection_assets
   where asset_id = (select id from public.assets where tag = 'TMAP-001')), 2,
  'the asset carries both visits'' results (its history)');

-- Write boundary: viewers read, editors write
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.clients (name) values ('Viewer Client') $$,
  null, null,
  'a viewer cannot create registry records');

reset role;
set local "request.jwt.claims" = '{"sub":"b0000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select lives_ok(
  $$ insert into public.clients (name) values ('Inspector Client') $$,
  'an inspector can create registry records');

reset role;

select * from finish();
rollback;
