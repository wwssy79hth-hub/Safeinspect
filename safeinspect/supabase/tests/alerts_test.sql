-- ============================================================
-- SafeInspect — Due-date alert tests (migration 007)
-- Run with:  supabase test db
--
-- The alerts table is the record. These tests pin the sweep's
-- idempotence (partial unique indexes), auto-resolution when a
-- condition clears, staff-only fan-out, and acknowledgement.
-- ============================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Fixtures: one inspector (fan-out target), one asset due nowhere
insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'inspector@test.local');
insert into public.clients (id, name) values
  ('d1111111-1111-1111-1111-111111111111', 'Alert Client');
insert into public.sites (id, client_id, name, address) values
  ('d2222222-2222-2222-2222-222222222222', 'd1111111-1111-1111-1111-111111111111',
   'Alert Site', '3 Test St');
insert into public.assets (id, site_id, category, tag) values
  ('d3333333-3333-3333-3333-333333333333', 'd2222222-2222-2222-2222-222222222222',
   'TMAP', 'TMAP-001');

do $$ begin perform public.sweep_due_date_alerts(); end $$;
select is(
  (select count(*)::int from public.alerts), 0,
  'nothing due → no alerts raised');

-- Overdue asset → one open recert_overdue, idempotent on re-sweep
update public.assets set next_due_on = current_date - 10
where id = 'd3333333-3333-3333-3333-333333333333';

do $$ begin
  perform public.sweep_due_date_alerts();
  perform public.sweep_due_date_alerts();
end $$;

select is(
  (select count(*)::int from public.alerts
   where kind = 'recert_overdue' and resolved_at is null), 1,
  'overdue asset raises exactly one open alert across repeated sweeps');

select is(
  (select count(*)::int from public.alert_recipients), 1,
  'the alert fans out to staff');

-- Acknowledge as the inspector
set local "request.jwt.claims" = '{"sub":"d0000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  (select count(*)::int from public.alert_recipients ar
   join public.alerts a on a.id = ar.alert_id
   where ar.user_id = auth.uid() and a.resolved_at is null), 1,
  'the inspector sees their own receipt');

select lives_ok(
  $$ select public.acknowledge_alert(
       (select id from public.alerts where kind = 'recert_overdue')) $$,
  'the inspector can acknowledge');

reset role;

select is(
  (select count(*)::int from public.alert_recipients where acknowledged_at is not null), 1,
  'acknowledgement is recorded per person');

-- The asset passes again → the overdue alert auto-resolves
update public.assets set next_due_on = current_date + 200
where id = 'd3333333-3333-3333-3333-333333333333';

do $$ begin perform public.sweep_due_date_alerts(); end $$;

select is(
  (select count(*)::int from public.alerts
   where kind = 'recert_overdue' and resolved_at is null), 0,
  'the overdue alert resolves once the asset is no longer overdue');

select is(
  (select count(*)::int from public.alerts where resolved_at is not null), 1,
  'the resolved alert remains as the record');

select * from finish();
rollback;
