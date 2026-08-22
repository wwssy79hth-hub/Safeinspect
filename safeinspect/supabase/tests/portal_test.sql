-- ============================================================
-- SafeInspect — Client portal boundary tests (migration 008)
-- Run with:  supabase test db
--
-- The case this file exists for is the sibling-client proof: a
-- portal member of Client A must not see Client B, even though
-- both are serviced by the same company. Its second job: draft
-- field work stays invisible to the portal until an issued
-- certificate covers it. If this file is ever skipped, the
-- schema has lost its only automated proof that the portal is
-- safe to open to two customers at once.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

-- ─── Fixtures ────────────────────────────────────────────────
--   admin + inspector (staff), portal members Ma (client A), Mb (client B)
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('f0000000-0000-0000-0000-000000000002', 'facilities@client-a.test'),
  ('f0000000-0000-0000-0000-000000000003', 'facilities@client-b.test');
update public.profiles set role = 'admin' where id = 'f0000000-0000-0000-0000-000000000001';

insert into public.clients (id, name) values
  ('f1111111-1111-1111-1111-111111111111', 'Client A'),
  ('f2222222-2222-2222-2222-222222222222', 'Client B');
insert into public.sites (id, client_id, name, address) values
  ('f3333333-3333-3333-3333-333333333333', 'f1111111-1111-1111-1111-111111111111',
   'Site A', '1 A St'),
  ('f4444444-4444-4444-4444-444444444444', 'f2222222-2222-2222-2222-222222222222',
   'Site B', '2 B St');
insert into public.assets (id, site_id, category, tag) values
  ('f5555555-5555-5555-5555-555555555555', 'f3333333-3333-3333-3333-333333333333',
   'TMAP', 'A-TMAP-001'),
  ('f6666666-6666-6666-6666-666666666666', 'f4444444-4444-4444-4444-444444444444',
   'TMAP', 'B-TMAP-001');

-- An as-yet-uncertified inspection on Site A, signed and evidenced
insert into public.inspections (id, job_number, client_name, site_name, site_address,
                                date_of_inspection, certifier_id, created_by, site_id,
                                inspection_status, certifier_signature_url)
values ('f7777777-7777-7777-7777-777777777777', 'JOB-P1', 'Client A', 'Site A', '1 A St',
        '2026-08-22',
        'f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001',
        'f3333333-3333-3333-3333-333333333333', 'completed',
        'f7777777-7777-7777-7777-777777777777/certifier.png');
insert into public.inspection_assets (id, inspection_id, category, asset_code, status)
values ('f8888888-8888-8888-8888-888888888888', 'f7777777-7777-7777-7777-777777777777',
        'TMAP', 'A-TMAP-001', 'compliant');
insert into public.asset_photos (inspection_id, asset_id, storage_path, uploaded_by)
values ('f7777777-7777-7777-7777-777777777777', 'f8888888-8888-8888-8888-888888888888',
        'f7777777-7777-7777-7777-777777777777/f8888888/p1.jpg',
        'f0000000-0000-0000-0000-000000000001');

-- ─── Granting access is admin-only ───────────────────────────
set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ select public.grant_portal_access(
       'f0000000-0000-0000-0000-000000000002',
       'f1111111-1111-1111-1111-111111111111') $$,
  null, 'Only an admin can grant portal access',
  'a non-admin cannot grant portal access');

set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$ select public.grant_portal_access(
       'f0000000-0000-0000-0000-000000000002',
       'f1111111-1111-1111-1111-111111111111');
     select public.grant_portal_access(
       'f0000000-0000-0000-0000-000000000003',
       'f2222222-2222-2222-2222-222222222222') $$,
  'an admin grants portal access to both members');

select is(
  (select role::text from public.profiles
   where id = 'f0000000-0000-0000-0000-000000000002'),
  'client',
  'a granted member becomes a client-role account');

-- ─── The sibling-client boundary ─────────────────────────────
set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select results_eq(
  $$ select name from public.clients order by name $$,
  array['Client A'],
  'member A sees only their own client');

select results_eq(
  $$ select name from public.sites order by name $$,
  array['Site A'],
  'member A sees only their own site — NOT sibling Client B''s');

select results_eq(
  $$ select tag from public.assets order by tag $$,
  array['A-TMAP-001'],
  'member A sees only their own asset register');

-- Draft field work is invisible until certified
select is(
  (select count(*)::int from public.inspections), 0,
  'an uncertified inspection is invisible to the portal');

select is(
  (select count(*)::int from public.inspection_assets), 0,
  'uncertified results are invisible to the portal');

-- The portal has no write path: with no UPDATE policy for
-- members, RLS filters the row out and the write is a no-op.
update public.assets set status = 'removed'
where id = 'f5555555-5555-5555-5555-555555555555';

select is(
  (select status::text from public.assets
   where id = 'f5555555-5555-5555-5555-555555555555'),
  'active',
  'a portal member''s write to the registry is refused (no-op under RLS)');

reset role;

-- ─── Certification opens the record ──────────────────────────
set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.issue_certificate('f7777777-7777-7777-7777-777777777777',
                                     'f7777777-7777-7777-7777-777777777777/report.pdf') $$,
  'the admin issues the certificate for Site A');

set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.certificates), 1,
  'member A sees their site''s certificate');

select is(
  (select count(*)::int from public.inspection_assets
   where inspection_id = 'f7777777-7777-7777-7777-777777777777'), 1,
  'certified results are now visible to member A');

reset role;

-- Member B still sees none of it
set local "request.jwt.claims" = '{"sub":"f0000000-0000-0000-0000-000000000003","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.certificates)
  + (select count(*)::int from public.inspection_assets)
  + (select count(*)::int from public.sites where name = 'Site A'), 0,
  'sibling member B sees nothing of Client A''s records');

reset role;

select * from finish();
rollback;
