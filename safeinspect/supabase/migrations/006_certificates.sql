-- ============================================================
-- SafeInspect — Migration 006: Certificates as records
--
-- Extraction plan item 5 (docs/heighttrack-comparison-review.md §6).
-- A certificate stops being "a PDF in a bucket" and becomes a
-- numbered, expiring, append-only record, per HeightTrack:
--
--   - Sequenced certificate numbers (ABS-YYYY-NNNNN).
--   - Evidence gate: issue is refused until the certifier has
--     signed and every compliance claim carries photo evidence.
--     A proposal report can never be issued as a certificate.
--   - Standards line and expiry are stamped AT ISSUE from the
--     rules in force — never derived at read time.
--   - Once issued, the certificate and its underlying evidence
--     (inspection, results, photos) are frozen by triggers that
--     raise even for the service role. Corrections are an
--     admin-only revoke + reissue, never an edit.
-- ============================================================

-- ─── Certificate numbering ───────────────────────────────────

create sequence if not exists public.certificate_number_seq;

create or replace function private.next_certificate_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'ABS-' || to_char(now(), 'YYYY') || '-'
         || lpad(nextval('public.certificate_number_seq')::text, 5, '0');
$$;

revoke all on function private.next_certificate_number() from public;

-- ─── Table ───────────────────────────────────────────────────

create table public.certificates (
  id                 uuid primary key default uuid_generate_v4(),
  certificate_number text not null unique,
  inspection_id      uuid not null references public.inspections(id),
  site_id            uuid references public.sites(id),
  issue_type         issue_type not null,
  overall_status     overall_site_status,
  issued_by          uuid not null references public.profiles(id),
  issued_at          timestamptz not null default now(),
  expires_on         date,
  standard_line      text not null,   -- standards snapshot at issue
  document_path      text,            -- PDF in the reports bucket
  asset_count        integer not null,
  compliant_count    integer not null,
  revoked_at         timestamptz,
  revoked_reason     text,
  revoked_by         uuid references public.profiles(id)
);

-- One ACTIVE certificate per inspection; a revoked one may be
-- superseded by a reissue.
create unique index idx_certificates_active_inspection
  on public.certificates(inspection_id) where revoked_at is null;

create index idx_certificates_expiry
  on public.certificates(expires_on) where revoked_at is null;

alter table public.certificates enable row level security;

create policy "Certificates are readable"
  on public.certificates for select
  using (auth.role() = 'authenticated');
-- No insert/update/delete policies: issue and revoke go through
-- the security-definer RPCs below, nothing else.

-- ─── Helper: does an active certificate cover this inspection? ─

create or replace function private.has_active_certificate(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.certificates
    where inspection_id = p_inspection_id and revoked_at is null
  );
$$;

revoke all on function private.has_active_certificate(uuid) from public;
grant execute on function private.has_active_certificate(uuid) to authenticated, service_role;

-- ─── Issue ───────────────────────────────────────────────────

create or replace function public.issue_certificate(
  p_inspection_id uuid,
  p_document_path text default null
)
returns public.certificates
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_inspection   public.inspections%rowtype;
  v_caller       uuid := auth.uid();
  v_caller_role  public.user_role;
  v_asset_count  integer;
  v_compliant    integer;
  v_unevidenced  integer;
  v_expires      date;
  v_standards    text;
  v_condition    text;
  v_cert         public.certificates%rowtype;
begin
  -- Privileged, irreversible action: re-check the role from the
  -- table, never from a (possibly stale) claim.
  select role into v_caller_role from public.profiles where id = v_caller;
  if v_caller_role is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_inspection from public.inspections where id = p_inspection_id;
  if v_inspection.id is null then
    raise exception 'Inspection not found';
  end if;

  if v_caller_role <> 'admin' and v_caller not in (v_inspection.certifier_id, v_inspection.created_by) then
    raise exception 'Only the certifier or an admin can issue a certificate';
  end if;

  if private.has_active_certificate(p_inspection_id) then
    raise exception 'An active certificate already exists for this inspection (revoke it to reissue)';
  end if;

  -- A proposal describes hardware that does not exist: it can
  -- never be issued as a certification (SafeInspect's own report
  -- rule, enforced server-side).
  if v_inspection.issue_type = 'proposed_anchor_installation' then
    raise exception 'A proposed anchor installation report cannot be issued as a certificate';
  end if;

  if v_inspection.inspection_status not in ('completed', 'issued') then
    raise exception 'Inspection must be marked complete before a certificate can issue';
  end if;

  if v_inspection.certifier_signature_url is null then
    raise exception 'Certifier signature is required before a certificate can issue';
  end if;

  select count(*),
         count(*) filter (where status = 'compliant')
    into v_asset_count, v_compliant
  from public.inspection_assets
  where inspection_id = p_inspection_id;

  if v_asset_count = 0 then
    raise exception 'Cannot issue a certificate with no inspected items';
  end if;

  -- Evidence gate: every compliance claim (pass or fail) must
  -- carry at least one photo that has actually landed. This is
  -- where pending offline photo uploads block issue — the gate
  -- sits on the certificate, not on the inspector's field work.
  select count(*) into v_unevidenced
  from public.inspection_assets ia
  where ia.inspection_id = p_inspection_id
    and ia.status in ('compliant', 'non_compliant')
    and not exists (
      select 1 from public.asset_photos ap where ap.asset_id = ia.id
    );
  if v_unevidenced > 0 then
    raise exception 'Evidence has not landed: % item(s) with a compliance result have no photo yet (offline uploads may still be syncing)', v_unevidenced;
  end if;

  -- Expiry = the earliest next-due across the categories present,
  -- under the site's service condition, resolved AS OF the
  -- inspection date (rules engine from migration 004).
  select coalesce(s.service_condition, 'standard')
    into v_condition
  from public.inspections i
  left join public.sites s on s.id = i.site_id
  where i.id = p_inspection_id;

  select min(public.next_due_date(ia.category, v_condition, v_inspection.date_of_inspection))
    into v_expires
  from public.inspection_assets ia
  where ia.inspection_id = p_inspection_id;

  select coalesce(string_agg(distinct ia.standard_referenced, ', ' order by ia.standard_referenced), '')
    into v_standards
  from public.inspection_assets ia
  where ia.inspection_id = p_inspection_id
    and ia.standard_referenced is not null;

  -- Update the inspection BEFORE inserting the certificate: once
  -- the certificate row exists, the freeze triggers below make
  -- the inspection immutable.
  update public.inspections
  set inspection_status = 'issued',
      next_recertification_due = coalesce(v_expires, next_recertification_due),
      report_issued_to = coalesce(report_issued_to, client_name),
      date_signed = coalesce(date_signed, current_date)
  where id = p_inspection_id;

  insert into public.certificates
    (certificate_number, inspection_id, site_id, issue_type, overall_status,
     issued_by, expires_on, standard_line, document_path,
     asset_count, compliant_count)
  values
    (private.next_certificate_number(), p_inspection_id, v_inspection.site_id,
     v_inspection.issue_type, v_inspection.overall_status,
     v_caller, v_expires, v_standards, p_document_path,
     v_asset_count, v_compliant)
  returning * into v_cert;

  return v_cert;
end;
$$;

revoke all on function public.issue_certificate(uuid, text) from public;
grant execute on function public.issue_certificate(uuid, text) to authenticated, service_role;

-- ─── Revoke (admin only) ─────────────────────────────────────

create or replace function public.revoke_certificate(
  p_certificate_id uuid,
  p_reason text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_caller_role public.user_role;
  v_inspection  uuid;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'admin' then
    raise exception 'Only an admin can revoke a certificate';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A revocation reason is required';
  end if;

  update public.certificates
  set revoked_at = now(), revoked_reason = p_reason, revoked_by = auth.uid()
  where id = p_certificate_id and revoked_at is null
  returning inspection_id into v_inspection;

  if v_inspection is null then
    raise exception 'Certificate not found or already revoked';
  end if;

  update public.inspections
  set inspection_status = 'completed'
  where id = v_inspection;
end;
$$;

revoke all on function public.revoke_certificate(uuid, text) from public;
grant execute on function public.revoke_certificate(uuid, text) to authenticated, service_role;

-- ─── Append-only from issue ──────────────────────────────────
-- Once an active certificate exists, its certificate row and the
-- evidence beneath it are immutable — a trigger that raises even
-- for the service role. A certificate that can be quietly
-- altered after issue is worthless as evidence.

create or replace function private.certificates_are_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Certificates are never deleted — revoke instead';
  end if;
  -- The only permitted update is the revocation stamp itself.
  if old.revoked_at is null
     and new.revoked_at is not null
     and new.certificate_number = old.certificate_number
     and new.inspection_id = old.inspection_id
     and new.issued_by = old.issued_by
     and new.issued_at = old.issued_at
     and new.expires_on is not distinct from old.expires_on
     and new.standard_line = old.standard_line
     and new.document_path is not distinct from old.document_path then
    return new;
  end if;
  raise exception 'Certificates are append-only after issue (revoke + reissue to correct)';
end;
$$;

create trigger certificates_are_append_only
  before update or delete on public.certificates
  for each row execute procedure private.certificates_are_append_only();

create or replace function private.evidence_frozen_after_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inspection_id uuid;
begin
  if tg_op = 'INSERT' then
    v_inspection_id := new.inspection_id;
  elsif tg_table_name = 'inspections' then
    v_inspection_id := old.id;
  else
    v_inspection_id := old.inspection_id;
  end if;

  if private.has_active_certificate(v_inspection_id) then
    raise exception 'This inspection has an issued certificate — its records are frozen (revoke the certificate to correct them)';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger inspections_frozen_after_issue
  before update or delete on public.inspections
  for each row execute procedure private.evidence_frozen_after_issue();

-- New results or photos cannot be added under an issued
-- certificate either — the evidence SET is what was certified.
create trigger inspection_assets_frozen_after_issue
  before insert or update or delete on public.inspection_assets
  for each row execute procedure private.evidence_frozen_after_issue();

create trigger asset_photos_frozen_after_issue
  before insert or update or delete on public.asset_photos
  for each row execute procedure private.evidence_frozen_after_issue();
