-- ============================================================
-- SafeInspect — Initial Schema Migration
-- Matches the Abseal Recertification Report template exactly
-- ============================================================

-- ─── Enable Extensions ───────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────

create type user_role as enum ('admin', 'inspector', 'viewer');

create type inspection_status as enum (
  'draft',
  'in_progress',
  'completed',
  'issued'
);

create type overall_site_status as enum (
  'compliant',
  'non_compliant',
  'partially_compliant'
);

create type issue_type as enum (
  'recertification',
  'non_compliant_follow_up',
  'initial_inspection'
);

create type asset_status as enum (
  'compliant',
  'non_compliant',
  'recommendation',
  'n/a'
);

create type asset_category as enum (
  'APS',   -- Access Point Signage
  'ST',    -- Strops
  'TMAP',  -- Top Mount Anchor Point
  'CAP',   -- Concrete Anchor Point
  'HSL',   -- Horizontal Static Line
  'VSL',   -- Vertical Static Line
  'LD',    -- Ladder
  'GR',    -- Guardrail
  'WW',    -- Walkway
  'STP',   -- Step
  'STR',   -- Stair
  'SL',    -- Step Ladder
  'EK',    -- Guardrail Entry Kit
  'PL',    -- Platform
  'GHK',   -- Guardrail Hatch Kit
  'SS',    -- Safety Signage
  'DB',    -- Davit Base
  'RR',    -- Rigid Rail System
  'SPM',   -- Skylight Protection Mesh
  'OSE',   -- Other Safety Equipment
  'R'      -- Recommendation
);

-- ─── Profiles ────────────────────────────────────────────────
-- Extends Supabase Auth users (auth.users)

create table public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  email                text not null,
  full_name            text,
  position             text,
  accreditation_number text,
  role                 user_role not null default 'inspector',
  company              text not null default 'Abseal Pty Ltd',
  avatar_url           text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, position, accreditation_number)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'position',
    new.raw_user_meta_data->>'accreditation_number'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Inspections ─────────────────────────────────────────────

create table public.inspections (
  id                       uuid primary key default uuid_generate_v4(),
  job_number               text not null,
  quote_number             text,
  client_name              text not null,
  site_name                text not null,
  site_address             text not null,
  roof_area_reference      text,
  date_of_inspection       date not null,
  issue_type               issue_type not null default 'recertification',
  overall_status           overall_site_status,
  inspection_status        inspection_status not null default 'draft',

  -- Certifier
  certifier_id             uuid not null references public.profiles(id),
  certifier_signature_url  text,
  date_signed              date,

  -- Inspector sign-off
  inspector_signature_url  text,
  inspector_sign_off_date  date,
  next_recertification_due date,
  report_issued_to         text,

  -- Site layout
  aerial_map_url           text,
  drawing_scaled           boolean,

  notes                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid not null references public.profiles(id)
);

create index idx_inspections_certifier on public.inspections(certifier_id);
create index idx_inspections_status on public.inspections(inspection_status);
create index idx_inspections_created_by on public.inspections(created_by);

-- ─── Inspection Assets ───────────────────────────────────────

create table public.inspection_assets (
  id                  uuid primary key default uuid_generate_v4(),
  inspection_id       uuid not null references public.inspections(id) on delete cascade,
  category            asset_category not null,
  asset_code          text not null,   -- e.g. "TMAP-003"
  location_on_site    text,
  photo_refs          text[] not null default '{}',  -- references to asset_photos.id
  status              asset_status not null default 'compliant',
  priority            smallint check (priority in (1, 2, 3)),
  finding             text,
  standard_referenced text default 'AS/NZS 1891.4:2009',
  corrective_action   text,
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (inspection_id, asset_code)
);

create index idx_assets_inspection on public.inspection_assets(inspection_id);
create index idx_assets_category on public.inspection_assets(inspection_id, category);

-- ─── Asset Photos ────────────────────────────────────────────

create table public.asset_photos (
  id            uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  asset_id      uuid not null references public.inspection_assets(id) on delete cascade,
  storage_path  text not null,    -- Supabase Storage path
  public_url    text,
  caption       text,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  uploaded_by   uuid not null references public.profiles(id)
);

create index idx_photos_asset on public.asset_photos(asset_id);
create index idx_photos_inspection on public.asset_photos(inspection_id);

-- ─── Updated_at trigger ───────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_inspections_updated_at
  before update on public.inspections
  for each row execute procedure public.set_updated_at();

create trigger set_assets_updated_at
  before update on public.inspection_assets
  for each row execute procedure public.set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_assets enable row level security;
alter table public.asset_photos enable row level security;

-- Profiles: each user can see/edit their own; admins see all
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Admins can view all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Inspections: inspector sees their own; admin sees all
create policy "Inspectors can view own inspections"
  on public.inspections for select
  using (
    auth.uid() = created_by
    or auth.uid() = certifier_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Inspectors can create inspections"
  on public.inspections for insert
  with check (auth.uid() = created_by);

create policy "Inspectors can update own inspections"
  on public.inspections for update
  using (
    auth.uid() = created_by
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Assets: follow parent inspection access
create policy "Assets follow inspection access"
  on public.inspection_assets for all
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          i.created_by = auth.uid()
          or i.certifier_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
        )
    )
  );

-- Photos: follow parent inspection access
create policy "Photos follow inspection access"
  on public.asset_photos for all
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          i.created_by = auth.uid()
          or i.certifier_id = auth.uid()
          or exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'admin'
          )
        )
    )
  );

-- ─── Storage Buckets ─────────────────────────────────────────
-- Run these in the Supabase Dashboard → Storage, or via SQL Editor

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('inspection-photos', 'inspection-photos', false, 10485760,  -- 10 MB
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic']),
  ('signatures', 'signatures', false, 2097152,  -- 2 MB
   array['image/png']),
  ('aerial-maps', 'aerial-maps', false, 20971520,  -- 20 MB
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

-- Storage policies
create policy "Authenticated users can upload photos"
  on storage.objects for insert
  with check (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps')
    and auth.role() = 'authenticated'
  );

create policy "Users can view inspection photos they have access to"
  on storage.objects for select
  using (
    bucket_id in ('inspection-photos', 'signatures', 'aerial-maps')
    and auth.role() = 'authenticated'
  );
