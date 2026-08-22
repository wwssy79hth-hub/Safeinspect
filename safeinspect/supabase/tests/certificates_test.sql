-- ============================================================
-- SafeInspect — Certificate lifecycle tests (migration 006)
-- Run with:  supabase test db
--
-- A certificate that can be quietly altered after issue is
-- worthless as evidence. These tests pin the issue gates, the
-- stamped expiry, the post-issue freeze (including for the
-- superuser), and the admin-only revoke that unfreezes.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- Fixtures: certifier + a completed, signed inspection
insert into auth.users (id, email) values
  ('c0000000-0000-0000-0000-000000000001', 'certifier@test.local');
insert into public.clients (id, name) values
  ('c1111111-1111-1111-1111-111111111111', 'Cert Client');
insert into public.sites (id, client_id, name, address) values
  ('c2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111',
   'Cert Site', '2 Test St');
insert into public.inspections (id, job_number, client_name, site_name, site_address,
                                date_of_inspection, certifier_id, created_by, site_id,
                                inspection_status)
values ('c3333333-3333-3333-3333-333333333333', 'JOB-C1', 'Cert Client', 'Cert Site',
        '2 Test St', '2026-08-22',
        'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
        'c2222222-2222-2222-2222-222222222222', 'completed');
insert into public.inspection_assets (id, inspection_id, category, asset_code, status)
values ('c4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333',
        'TMAP', 'TMAP-001', 'compliant');

set local "request.jwt.claims" = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Gate: signature required
select throws_ok(
  $$ select public.issue_certificate('c3333333-3333-3333-3333-333333333333') $$,
  null, 'Certifier signature is required before a certificate can issue',
  'issue refused without a certifier signature');

update public.inspections
set certifier_signature_url = 'c3333333-3333-3333-3333-333333333333/certifier.png'
where id = 'c3333333-3333-3333-3333-333333333333';

-- Gate: every compliance result needs landed photo evidence
select throws_like(
  $$ select public.issue_certificate('c3333333-3333-3333-3333-333333333333') $$,
  'Evidence has not landed%',
  'issue refused while a compliance result has no photo (offline uploads pending)');

insert into public.asset_photos (inspection_id, asset_id, storage_path, uploaded_by)
values ('c3333333-3333-3333-3333-333333333333', 'c4444444-4444-4444-4444-444444444444',
        'c3333333-3333-3333-3333-333333333333/c4444444/p1.jpg',
        'c0000000-0000-0000-0000-000000000001');

-- Happy path
select lives_ok(
  $$ select public.issue_certificate('c3333333-3333-3333-3333-333333333333',
                                     'c3333333-3333-3333-3333-333333333333/report.pdf') $$,
  'a completed, signed, evidenced inspection issues');

select matches(
  (select certificate_number from public.certificates
   where inspection_id = 'c3333333-3333-3333-3333-333333333333'),
  '^ABS-\d{4}-\d{5}$',
  'certificate number follows ABS-YYYY-NNNNN');

select is(
  (select expires_on from public.certificates
   where inspection_id = 'c3333333-3333-3333-3333-333333333333'),
  date '2027-08-22',
  'expiry stamped from the rules engine (+12 months, standard service)');

select is(
  (select inspection_status from public.inspections
   where id = 'c3333333-3333-3333-3333-333333333333'),
  'issued',
  'the inspection moves to issued');

-- Frozen after issue — even for the superuser running this test
select throws_like(
  $$ update public.inspection_assets set status = 'non_compliant'
     where id = 'c4444444-4444-4444-4444-444444444444' $$,
  '%frozen%',
  'results cannot be edited under an issued certificate');

select throws_like(
  $$ insert into public.inspection_assets (inspection_id, category, asset_code, status)
     values ('c3333333-3333-3333-3333-333333333333', 'LD', 'LD-001', 'compliant') $$,
  '%frozen%',
  'new results cannot be added under an issued certificate');

select throws_like(
  $$ update public.certificates set standard_line = 'tampered' $$,
  '%append-only%',
  'the certificate row itself is append-only');

select throws_like(
  $$ delete from public.certificates $$,
  '%never deleted%',
  'certificates cannot be deleted');

-- Revoke: admin only, and it unfreezes the records
select throws_ok(
  $$ select public.revoke_certificate(
       (select id from public.certificates limit 1), 'test') $$,
  null, 'Only an admin can revoke a certificate',
  'a non-admin cannot revoke');

update public.profiles set role = 'admin'
where id = 'c0000000-0000-0000-0000-000000000001';

select lives_ok(
  $$ select public.revoke_certificate(
       (select id from public.certificates limit 1), 'correction needed');
     update public.inspection_assets set status = 'non_compliant'
     where id = 'c4444444-4444-4444-4444-444444444444' $$,
  'admin revoke unfreezes the records for correction');

select * from finish();
rollback;
