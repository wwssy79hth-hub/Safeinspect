-- ============================================================
-- SafeInspect — Standards-as-data tests (migration 004)
-- Run with:  supabase test db
--
-- The rules engine drives every due date and certificate expiry.
-- These tests pin the 2025 intervals and the two behaviours that
-- protect history: pre-2025 lookups return nothing (unverified
-- historical intervals), and clients cannot write reference data.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- Intervals under the editions in force today
select is(
  (public.applicable_rule('TMAP', 'standard', current_date)).interval_months, 12,
  'installed anchor (TMAP), standard service: 12 months');

select is(
  (public.applicable_rule('TMAP', 'harsh', current_date)).interval_months, 6,
  'installed anchor (TMAP), harsh service: 6 months');

select is(
  (public.applicable_rule('ST', 'standard', current_date)).interval_months, 6,
  'removable strops, standard service: 6 months');

select is(
  (public.applicable_rule('ST', 'harsh', current_date)).interval_months, 3,
  'removable strops, harsh service: 3 months');

select is(
  (public.applicable_rule('LD', 'standard', current_date)).interval_months, 12,
  'AS 1657 ladder: 12 months');

-- Due-date math resolves AS OF the pass date
select is(
  public.next_due_date('TMAP', 'standard', date '2026-08-22'),
  date '2027-08-22',
  'TMAP pass on 2026-08-22 is due 2027-08-22');

select is(
  public.next_due_date('ST', 'harsh', date '2026-08-22'),
  date '2026-11-22',
  'harsh-service strops pass is due 3 months later');

-- No 2009-edition rules are seeded: a pre-2025 date must return
-- nothing rather than silently applying today's intervals.
select ok(
  public.next_due_date('TMAP', 'standard', date '2024-01-01') is null,
  'a pre-2025 pass date yields no due date (historical intervals unverified)');

-- Reference data is read-only even to staff
insert into auth.users (id, email) values
  ('e0000000-0000-0000-0000-000000000001', 'inspector@test.local');

set local "request.jwt.claims" = '{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select throws_ok(
  $$ insert into public.standards (code, edition, title, effective_from)
     values ('X', '1', 'bogus', current_date) $$,
  null, null,
  'an inspector cannot write to the standards table');

reset role;

select * from finish();
rollback;
