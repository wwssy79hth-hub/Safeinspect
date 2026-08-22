-- ============================================================
-- SafeInspect — Migration 003: Security hardening
--
-- Extraction plan item 1 (docs/heighttrack-comparison-review.md §6).
-- Adopts the hardening patterns proven in HeightTrack:
--
--   1. RLS helper functions live in a `private` schema that
--      PostgREST does not serve, with pinned search_path.
--   2. Fixes the recursive admin policy on `profiles` (a policy
--      on profiles that itself selects from profiles).
--   3. Storage policies are scoped to the inspection the object
--      belongs to, instead of "any authenticated user can read
--      and write every bucket".
--   4. Creates the `reports` bucket the app already uploads to
--      ("Save Report to Cloud" fails without it).
--   5. Evidence is not deletable from the client: no DELETE
--      policy exists on any bucket, deliberately.
-- ============================================================

-- ─── Private schema for RLS helpers ──────────────────────────
-- PostgREST serves only `public`, so nothing in here becomes an
-- accidental API surface.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ─── Helper: is the caller an admin? ─────────────────────────
-- SECURITY DEFINER so it can read `profiles` without re-entering
-- that table's own RLS policies. This is what breaks the
-- recursion in the old "Admins can view all profiles" policy.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

-- ─── Helper: can the caller access an inspection? ────────────
-- Creator, certifier, or admin — the same rule the table
-- policies express, resolvable from storage policies too.

create or replace function private.can_access_inspection(p_inspection_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_inspection_id is not null and (
    exists (
      select 1 from public.inspections i
      where i.id = p_inspection_id
        and (i.created_by = auth.uid() or i.certifier_id = auth.uid())
    )
    or private.is_admin()
  );
$$;

revoke all on function private.can_access_inspection(uuid) from public;
grant execute on function private.can_access_inspection(uuid) to authenticated, service_role;

-- ─── Helper: inspection id from a storage object path ────────
-- Historical uploads duplicated the bucket name inside the key
-- ("inspection-photos/<inspection>/…" stored *in* the
-- inspection-photos bucket), so the inspection id may sit at
-- folder position 1 (new convention) or 2 (legacy). Returns null
-- when neither parses, which every policy treats as "deny".

create or replace function private.storage_inspection_id(p_name text)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  folders text[];
begin
  folders := storage.foldername(p_name);
  begin
    return folders[1]::uuid;
  exception when others then
    begin
      return folders[2]::uuid;
    exception when others then
      return null;
    end;
  end;
end;
$$;

revoke all on function private.storage_inspection_id(text) from public;
grant execute on function private.storage_inspection_id(text) to authenticated, service_role;

-- ─── Pin search_path on existing functions ───────────────────
-- set_updated_at was created without one; a writable schema on
-- the path is the classic trigger-function hijack vector.

alter function public.set_updated_at() set search_path = '';
alter function public.handle_new_user() set search_path = '';

-- ─── Rebuild the recursive / self-referencing policies ───────

drop policy if exists "Admins can view all profiles" on public.profiles;
create policy "Admins can view all profiles"
  on public.profiles for select
  using (private.is_admin());

drop policy if exists "Inspectors can view own inspections" on public.inspections;
create policy "Inspectors can view own inspections"
  on public.inspections for select
  using (
    auth.uid() = created_by
    or auth.uid() = certifier_id
    or private.is_admin()
  );

drop policy if exists "Inspectors can update own inspections" on public.inspections;
create policy "Inspectors can update own inspections"
  on public.inspections for update
  using (auth.uid() = created_by or private.is_admin());

drop policy if exists "Assets follow inspection access" on public.inspection_assets;
create policy "Assets follow inspection access"
  on public.inspection_assets for all
  using (private.can_access_inspection(inspection_id))
  with check (private.can_access_inspection(inspection_id));

drop policy if exists "Photos follow inspection access" on public.asset_photos;
create policy "Photos follow inspection access"
  on public.asset_photos for all
  using (private.can_access_inspection(inspection_id))
  with check (private.can_access_inspection(inspection_id));

-- ─── Reports bucket (missing until now) ──────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reports', 'reports', false, 52428800,  -- 50 MB
        array['application/pdf'])
on conflict do nothing;

-- ─── Storage policies: scope objects to their inspection ─────
-- Replaces the bucket-wide "any authenticated user" grants.

drop policy if exists "Authenticated users can upload photos" on storage.objects;
drop policy if exists "Users can view inspection photos they have access to" on storage.objects;

create policy "Objects readable via inspection access"
  on storage.objects for select
  using (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps', 'reports')
    and private.can_access_inspection(private.storage_inspection_id(name))
  );

create policy "Objects writable via inspection access"
  on storage.objects for insert
  with check (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps', 'reports')
    and private.can_access_inspection(private.storage_inspection_id(name))
  );

-- Upsert re-uploads (site plan, signature, regenerated report)
-- go through UPDATE, which needs its own policy.
create policy "Objects replaceable via inspection access"
  on storage.objects for update
  using (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps', 'reports')
    and private.can_access_inspection(private.storage_inspection_id(name))
  )
  with check (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps', 'reports')
    and private.can_access_inspection(private.storage_inspection_id(name))
  );

-- No DELETE policy on any bucket, deliberately: inspection
-- evidence is not deletable from a client session.
