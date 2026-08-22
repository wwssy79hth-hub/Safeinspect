-- ============================================================
-- SafeInspect — Migration 007: Due-date alerts
--
-- Extraction plan item 6 (docs/heighttrack-comparison-review.md §6).
-- Annual recertification is the engine of the product; this is
-- the machinery that stops due dates from silently passing.
-- HeightTrack's pattern: the alerts TABLE is the record (not a
-- push notification), swept by pg_cron, fanned out to named
-- recipients with individual acknowledgement.
--
--   recert_due          asset due within the lead window
--   recert_overdue      asset past its next_due_on
--   certificate_expiring  active certificate inside the window
--
-- Alerts auto-resolve when their condition clears (the asset
-- passed again, the certificate was reissued/revoked).
-- ============================================================

create table public.alerts (
  id             uuid primary key default uuid_generate_v4(),
  kind           text not null check (kind in
                   ('recert_due', 'recert_overdue', 'certificate_expiring')),
  asset_id       uuid references public.assets(id),
  site_id        uuid references public.sites(id),
  certificate_id uuid references public.certificates(id),
  due_on         date not null,
  title          text not null,
  detail         text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  check (asset_id is not null or certificate_id is not null)
);

-- One OPEN alert per kind per subject — the sweep is idempotent.
create unique index idx_alerts_open_asset
  on public.alerts(kind, asset_id) where resolved_at is null and asset_id is not null;
create unique index idx_alerts_open_certificate
  on public.alerts(kind, certificate_id) where resolved_at is null and certificate_id is not null;
create index idx_alerts_open on public.alerts(due_on) where resolved_at is null;

create table public.alert_recipients (
  alert_id        uuid not null references public.alerts(id) on delete cascade,
  user_id         uuid not null references public.profiles(id),
  acknowledged_at timestamptz,
  primary key (alert_id, user_id)
);

-- ─── RLS ─────────────────────────────────────────────────────
-- Alerts are readable by everyone in the company; a recipient
-- row is only visible and acknowledgeable by its own user. All
-- writes besides acknowledgement go through the sweep (definer).

alter table public.alerts enable row level security;
alter table public.alert_recipients enable row level security;

create policy "Alerts are readable"
  on public.alerts for select
  using (auth.role() = 'authenticated');

create policy "Own alert receipts are readable"
  on public.alert_recipients for select
  using (user_id = auth.uid());

-- ─── Acknowledge ─────────────────────────────────────────────

create or replace function public.acknowledge_alert(p_alert_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.alert_recipients
  set acknowledged_at = coalesce(acknowledged_at, now())
  where alert_id = p_alert_id and user_id = auth.uid();
$$;

revoke all on function public.acknowledge_alert(uuid) from public;
grant execute on function public.acknowledge_alert(uuid) to authenticated, service_role;

-- ─── The sweep ───────────────────────────────────────────────
-- Raises new alerts inside the lead window, escalates due →
-- overdue, resolves alerts whose condition cleared, and fans out
-- to every admin and inspector. Idempotent by the unique
-- indexes; safe to run any number of times.

create or replace function public.sweep_due_date_alerts(
  p_lead_days integer default 60
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- Resolve open asset alerts whose condition no longer holds
  update public.alerts a
  set resolved_at = now()
  from public.assets ast
  where a.resolved_at is null
    and a.asset_id = ast.id
    and (
      ast.status = 'removed'
      or ast.next_due_on is null
      or (a.kind = 'recert_due'     and (ast.next_due_on < current_date
                                          or ast.next_due_on > current_date + p_lead_days))
      or (a.kind = 'recert_overdue' and ast.next_due_on >= current_date)
      or a.due_on <> ast.next_due_on
    );

  -- Resolve certificate alerts whose condition cleared
  update public.alerts a
  set resolved_at = now()
  from public.certificates c
  where a.resolved_at is null
    and a.certificate_id = c.id
    and (
      c.revoked_at is not null
      or c.expires_on is null
      or c.expires_on > current_date + p_lead_days
      or a.due_on is distinct from c.expires_on
    );

  -- Raise: assets due inside the window
  insert into public.alerts (kind, asset_id, site_id, due_on, title, detail)
  select 'recert_due', ast.id, ast.site_id, ast.next_due_on,
         ast.tag || ' recertification due ' || to_char(ast.next_due_on, 'DD Mon YYYY'),
         'Asset ' || ast.tag || ' (' || ast.category || ') at this site is due for recertification.'
  from public.assets ast
  where ast.status <> 'removed'
    and ast.next_due_on is not null
    and ast.next_due_on >= current_date
    and ast.next_due_on <= current_date + p_lead_days
  on conflict do nothing;

  -- Raise: assets past due
  insert into public.alerts (kind, asset_id, site_id, due_on, title, detail)
  select 'recert_overdue', ast.id, ast.site_id, ast.next_due_on,
         ast.tag || ' recertification OVERDUE since ' || to_char(ast.next_due_on, 'DD Mon YYYY'),
         'Asset ' || ast.tag || ' (' || ast.category || ') has passed its recertification date.'
  from public.assets ast
  where ast.status <> 'removed'
    and ast.next_due_on is not null
    and ast.next_due_on < current_date
  on conflict do nothing;

  -- Raise: certificates expiring inside the window (or expired)
  insert into public.alerts (kind, certificate_id, site_id, due_on, title, detail)
  select 'certificate_expiring', c.id, c.site_id, c.expires_on,
         'Certificate ' || c.certificate_number || ' expires ' || to_char(c.expires_on, 'DD Mon YYYY'),
         'The site certification expires and a recertification visit should be scheduled.'
  from public.certificates c
  where c.revoked_at is null
    and c.expires_on is not null
    and c.expires_on <= current_date + p_lead_days
  on conflict do nothing;

  -- Fan out every open alert to every admin and inspector.
  -- (Escalation, HeightTrack-style, is adding people — new
  -- staff pick up existing open alerts on the next sweep.)
  insert into public.alert_recipients (alert_id, user_id)
  select a.id, p.id
  from public.alerts a
  cross join public.profiles p
  where a.resolved_at is null
    and p.role in ('admin', 'inspector')
  on conflict do nothing;
end;
$$;

revoke all on function public.sweep_due_date_alerts(integer) from public;
grant execute on function public.sweep_due_date_alerts(integer) to service_role;

-- ─── Schedule ────────────────────────────────────────────────
-- Daily at 19:00 UTC (early morning AEST). Guarded so the
-- migration still applies where pg_cron is unavailable (local
-- validation clusters); on hosted Supabase the job is created.

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'safeinspect-due-date-sweep',
    '0 19 * * *',
    $job$ select public.sweep_due_date_alerts(); $job$
  );
exception when others then
  raise notice 'pg_cron unavailable here (%) — schedule sweep_due_date_alerts() manually on the hosted project', sqlerrm;
end;
$$;
