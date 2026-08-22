-- ============================================================
-- SafeInspect — Hardening tests (migration 003)
-- Run with:  supabase test db
--
-- The recursive admin policy on profiles is the bug this file
-- guards against regressing: an admin listing profiles used to
-- re-enter the profiles policy and recurse.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Fixtures: one admin, one inspector, one viewer
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@test.local'),
  ('a0000000-0000-0000-0000-000000000002', 'inspector@test.local'),
  ('a0000000-0000-0000-0000-000000000003', 'viewer@test.local');
update public.profiles set role = 'admin'  where id = 'a0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'viewer' where id = 'a0000000-0000-0000-0000-000000000003';

-- Admin can list every profile without policy recursion
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.profiles), 3,
  'admin lists all profiles (no recursive policy error)');

reset role;

-- A non-admin sees only their own profile
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.profiles), 1,
  'an inspector sees only their own profile');

reset role;

-- Helper truth table
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';
select ok(private.is_admin(), 'is_admin true for admin');
select ok(private.is_editor(), 'is_editor true for admin');
set local "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
select ok(not private.is_editor(), 'is_editor false for viewer');

-- Storage path parsing: inspection id at folder position 1 (new
-- convention) or 2 (legacy keys that duplicated the bucket name)
select is(
  private.storage_inspection_id('11111111-1111-1111-1111-111111111111/asset/p.jpg'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'storage_inspection_id reads position 1');

select is(
  private.storage_inspection_id('inspection-photos/11111111-1111-1111-1111-111111111111/asset/p.jpg'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'storage_inspection_id falls back to position 2 for legacy keys');

select is(
  private.storage_inspection_id('not-a-uuid/also-not/p.jpg'),
  null,
  'storage_inspection_id returns null for garbage (deny)');

select * from finish();
rollback;
