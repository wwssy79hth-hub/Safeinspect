-- ============================================================
-- SafeInspect — Migration 008: Client portal access
--
-- Extraction plan item 7 (docs/heighttrack-comparison-review.md §6).
-- Gives asset owners a read-only portal surface on their own
-- records, HeightTrack's membership pattern in single-tenant
-- shape:
--
--   - client_members(user_id, client_id): portal access is a
--     REAL membership row, not a flag. No user-facing write
--     policies — access is granted by an admin RPC.
--   - A portal user's role is 'client' (new enum value). Staff
--     read policies tighten from "any authenticated user" to
--     admin/inspector/viewer — before this migration a portal
--     login could have read every client's data.
--   - Portal reads are scoped to the member's own client(s):
--     sites, asset register, and ISSUED inspections with their
--     results, photos and certificates. Draft field work is
--     invisible until certified. Writes: none.
--   - Storage: report PDFs and evidence photos become readable
--     through the same issued-certificate scope (signed URLs
--     only — the buckets stay private).
-- ============================================================

set check_function_bodies = off;

alter type user_role add value if not exists 'client';

-- ─── Membership ──────────────────────────────────────────────

create table public.client_members (
  user_id    uuid not null references public.profiles(id),
  client_id  uuid not null references public.clients(id),
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

alter table public.client_members enable row level security;

create policy "Own memberships are readable"
  on public.client_members for select
  using (user_id = auth.uid());
-- No insert/update/delete policies: grant/revoke RPCs only.

-- ─── Helpers ─────────────────────────────────────────────────
-- Text comparison on role avoids resolving the new enum value
-- during this migration's own transaction.

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('admin', 'inspector', 'viewer')
  );
$$;

revoke all on function private.is_staff() from public;
grant execute on function private.is_staff() to authenticated, service_role;

create or replace function private.is_client_member_of(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_members
    where user_id = auth.uid() and client_id = p_client_id
  );
$$;

revoke all on function private.is_client_member_of(uuid) from public;
grant execute on function private.is_client_member_of(uuid) to authenticated, service_role;

create or replace function private.can_view_site(p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1
    from public.sites s
    join public.client_members m
      on m.client_id = s.client_id and m.user_id = auth.uid()
    where s.id = p_site_id
  );
$$;

revoke all on function private.can_view_site(uuid) from public;
grant execute on function private.can_view_site(uuid) to authenticated, service_role;

-- Portal visibility into an inspection: only once an active
-- certificate covers it (draft field work is not the client's
-- record yet), and only on the member's own sites.
create or replace function private.portal_can_view_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.certificates c
    join public.sites s on s.id = c.site_id
    join public.client_members m
      on m.client_id = s.client_id and m.user_id = auth.uid()
    where c.inspection_id = p_inspection_id
      and c.revoked_at is null
  );
$$;

revoke all on function private.portal_can_view_inspection(uuid) from public;
grant execute on function private.portal_can_view_inspection(uuid) to authenticated, service_role;

-- ─── Tighten the broad staff reads, add portal scopes ────────

drop policy if exists "Clients are readable" on public.clients;
create policy "Staff can read clients"
  on public.clients for select using (private.is_staff());
create policy "Members can read their own client"
  on public.clients for select using (private.is_client_member_of(id));

drop policy if exists "Sites are readable" on public.sites;
create policy "Sites readable via staff or membership"
  on public.sites for select using (private.can_view_site(id));

drop policy if exists "Assets are readable" on public.assets;
create policy "Assets readable via staff or membership"
  on public.assets for select using (private.can_view_site(site_id));

-- Alerts are an internal operations surface: staff only.
drop policy if exists "Alerts are readable" on public.alerts;
create policy "Alerts are staff-readable"
  on public.alerts for select using (private.is_staff());

-- Certificates: staff read stays; members read their sites'.
drop policy if exists "Certificates are readable" on public.certificates;
create policy "Certificates readable by staff"
  on public.certificates for select using (private.is_staff());
create policy "Certificates readable by site members"
  on public.certificates for select
  using (site_id is not null and private.can_view_site(site_id));

-- Issued inspections + their results and photos, portal-scoped.
create policy "Members can read certified inspections"
  on public.inspections for select
  using (private.portal_can_view_inspection(id));

create policy "Members can read certified results"
  on public.inspection_assets for select
  using (private.portal_can_view_inspection(inspection_id));

create policy "Members can read certified photos"
  on public.asset_photos for select
  using (private.portal_can_view_inspection(inspection_id));

-- Storage: extend read (signed-URL issuance) to certified
-- inspections for members; write scope is unchanged.
drop policy if exists "Objects readable via inspection access" on storage.objects;
create policy "Objects readable via inspection access"
  on storage.objects for select
  using (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps', 'reports')
    and (
      private.can_access_inspection(private.storage_inspection_id(name))
      or private.portal_can_view_inspection(private.storage_inspection_id(name))
    )
  );

-- ─── Grant / revoke (admin only) ─────────────────────────────

create or replace function public.grant_portal_access(
  p_user_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_target_role text;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role::text = 'admin'
  ) then
    raise exception 'Only an admin can grant portal access';
  end if;

  select role::text into v_target_role from public.profiles where id = p_user_id;
  if v_target_role is null then
    raise exception 'No profile for that user';
  end if;
  -- Every new signup lands as 'inspector' (profiles default), so
  -- inspector → client is the normal provisioning path. Admins
  -- are protected from accidental demotion.
  if v_target_role = 'admin' then
    raise exception 'An admin account cannot be converted to a portal account';
  end if;

  insert into public.client_members (user_id, client_id)
  values (p_user_id, p_client_id)
  on conflict do nothing;

  update public.profiles
  set role = 'client'::public.user_role
  where id = p_user_id;
end;
$$;

revoke all on function public.grant_portal_access(uuid, uuid) from public;
grant execute on function public.grant_portal_access(uuid, uuid) to authenticated, service_role;

create or replace function public.revoke_portal_access(
  p_user_id uuid,
  p_client_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role::text = 'admin'
  ) then
    raise exception 'Only an admin can revoke portal access';
  end if;

  delete from public.client_members
  where user_id = p_user_id and client_id = p_client_id;
end;
$$;

revoke all on function public.revoke_portal_access(uuid, uuid) from public;
grant execute on function public.revoke_portal_access(uuid, uuid) to authenticated, service_role;
