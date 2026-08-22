-- ============================================================
-- SafeInspect — Migration 005: Durable asset registry
--
-- Extraction plan item 3 (docs/heighttrack-comparison-review.md §6).
-- Ports HeightTrack's structural decision: the ASSET is the unit
-- of certification, not the inspection. An anchor point has a
-- multi-year life; a visit is just a collection of results.
--
-- Single-tenant shape (multi-tenancy — item 9 — not taken):
--
--   clients               reusable client records (was free text)
--   └── sites             a building/facility, with service condition
--       └── assets        durable identity: unique(site_id, tag),
--                         status, last_pass_on / next_due_on
--
--   inspections.site_id        links the visit to its site
--   inspection_assets.asset_id links each per-visit result to its
--                              durable asset — inspection_assets
--                              becomes HeightTrack's dual-keyed
--                              asset_inspection record
--
-- A trigger auto-registers/links assets on capture, so the
-- existing capture flow builds the registry without UI changes;
-- refresh_asset_due_date() maintains last_pass_on/next_due_on
-- from the standards rules (migration 004).
-- ============================================================

-- ─── Helper: may the caller write registry data? ─────────────
-- Viewers are read-only; inspectors and admins write.

create or replace function private.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'inspector')
  );
$$;

revoke all on function private.is_editor() from public;
grant execute on function private.is_editor() to authenticated, service_role;

-- ─── Tables ──────────────────────────────────────────────────

create table public.clients (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null unique,
  contact_name  text,
  contact_email text,
  contact_phone text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.sites (
  id                uuid primary key default uuid_generate_v4(),
  client_id         uuid not null references public.clients(id),
  name              text not null,
  address           text not null,
  service_condition text not null default 'standard'
                    check (service_condition in ('standard', 'harsh')),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (client_id, name)
);

create table public.assets (
  id            uuid primary key default uuid_generate_v4(),
  site_id       uuid not null references public.sites(id),
  category      asset_category not null,
  tag           text not null,          -- e.g. "TMAP-003" (the asset_code)
  serial_number text,
  manufacturer  text,
  model         text,
  installed_on  date,
  location_note text,
  -- "do_not_use" mirrors a physical condemnation tag and must be
  -- visible everywhere (HeightTrack §6); assets are never deleted,
  -- they are marked "removed".
  status        text not null default 'active'
                check (status in ('active', 'do_not_use', 'removed')),
  last_pass_on  date,
  next_due_on   date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (site_id, tag)
);

create index idx_sites_client   on public.sites(client_id);
create index idx_assets_site    on public.assets(site_id);
create index idx_assets_due     on public.assets(next_due_on) where status <> 'removed';

-- Link columns on the existing tables. inspection_assets now
-- carries (inspection_id, asset_id) — HeightTrack's dual key that
-- makes both "this year's visit" and "this anchor's ten-year
-- history" cheap.
alter table public.inspections
  add column site_id uuid references public.sites(id);

alter table public.inspection_assets
  add column asset_id uuid references public.assets(id);

create index idx_inspections_site       on public.inspections(site_id);
create index idx_inspection_assets_asset on public.inspection_assets(asset_id);

-- updated_at maintenance
create trigger set_clients_updated_at
  before update on public.clients
  for each row execute procedure public.set_updated_at();

create trigger set_sites_updated_at
  before update on public.sites
  for each row execute procedure public.set_updated_at();

create trigger set_assets_updated_at
  before update on public.assets
  for each row execute procedure public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────
-- One company's registry: all authenticated users read; editors
-- (admin/inspector) write. No DELETE policies — retirement is
-- assets.status = 'removed', and clients/sites are never deleted
-- from a client session.

alter table public.clients enable row level security;
alter table public.sites   enable row level security;
alter table public.assets  enable row level security;

create policy "Clients are readable"  on public.clients for select using (auth.role() = 'authenticated');
create policy "Sites are readable"    on public.sites   for select using (auth.role() = 'authenticated');
create policy "Assets are readable"   on public.assets  for select using (auth.role() = 'authenticated');

create policy "Editors can insert clients" on public.clients for insert with check (private.is_editor());
create policy "Editors can update clients" on public.clients for update using (private.is_editor());
create policy "Editors can insert sites"   on public.sites   for insert with check (private.is_editor());
create policy "Editors can update sites"   on public.sites   for update using (private.is_editor());
create policy "Editors can insert assets"  on public.assets  for insert with check (private.is_editor());
create policy "Editors can update assets"  on public.assets  for update using (private.is_editor());

-- ─── Due-date maintenance ────────────────────────────────────
-- last_pass_on = latest inspection date whose CURRENT result for
-- this asset is 'compliant'; next_due_on from the standards rule
-- in force at that date, under the site's service condition
-- (migration 004's next_due_date). Recomputed from the rows, so
-- a corrected or deleted result retracts the date (HeightTrack's
-- refresh_asset_due_date).

create or replace function public.refresh_asset_due_date(p_asset_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last_pass date;
  v_category  public.asset_category;
  v_condition text;
begin
  select a.category, s.service_condition
    into v_category, v_condition
  from public.assets a
  join public.sites s on s.id = a.site_id
  where a.id = p_asset_id;

  if v_category is null then
    return;
  end if;

  select max(i.date_of_inspection)
    into v_last_pass
  from public.inspection_assets ia
  join public.inspections i on i.id = ia.inspection_id
  where ia.asset_id = p_asset_id
    and ia.status = 'compliant';

  update public.assets
  set last_pass_on = v_last_pass,
      next_due_on  = case
        when v_last_pass is null then null
        else public.next_due_date(v_category, v_condition, v_last_pass)
      end
  where id = p_asset_id;
end;
$$;

revoke all on function public.refresh_asset_due_date(uuid) from public;
grant execute on function public.refresh_asset_due_date(uuid) to authenticated, service_role;

create or replace function public.refresh_due_date_on_result_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') and new.asset_id is not null then
    perform public.refresh_asset_due_date(new.asset_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.asset_id is not null
     and (tg_op = 'DELETE' or old.asset_id is distinct from new.asset_id) then
    perform public.refresh_asset_due_date(old.asset_id);
  end if;
  return null;
end;
$$;

revoke all on function public.refresh_due_date_on_result_change() from public;

create trigger refresh_due_date_on_result_change
  after insert or update or delete on public.inspection_assets
  for each row execute procedure public.refresh_due_date_on_result_change();

-- ─── Auto-register assets on capture ─────────────────────────
-- When a result is saved for an inspection that has a site, the
-- durable asset is found (or created) by (site_id, tag) and
-- linked. The existing capture UI builds the registry with no
-- client changes; a pre-linked asset_id is respected.

create or replace function public.link_result_to_registry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_id uuid;
begin
  if new.asset_id is not null then
    return new;
  end if;

  select site_id into v_site_id
  from public.inspections
  where id = new.inspection_id;

  if v_site_id is null then
    return new;  -- legacy inspection with no site: nothing to link
  end if;

  insert into public.assets (site_id, category, tag, location_note)
  values (v_site_id, new.category, new.asset_code, new.location_on_site)
  on conflict (site_id, tag) do update
    set location_note = coalesce(excluded.location_note, public.assets.location_note)
  returning id into new.asset_id;

  return new;
end;
$$;

revoke all on function public.link_result_to_registry() from public;

create trigger link_result_to_registry
  before insert on public.inspection_assets
  for each row execute procedure public.link_result_to_registry();

-- ============================================================
-- Backfill from the free-text data captured so far
-- ============================================================

-- Clients from distinct names
insert into public.clients (name)
select distinct trim(client_name)
from public.inspections
where trim(coalesce(client_name, '')) <> ''
on conflict do nothing;

-- Sites: one per (client, site name); where addresses varied
-- across visits, the most recent wins
insert into public.sites (client_id, name, address)
select distinct on (c.id, trim(i.site_name))
       c.id, trim(i.site_name), i.site_address
from public.inspections i
join public.clients c on c.name = trim(i.client_name)
where trim(coalesce(i.site_name, '')) <> ''
order by c.id, trim(i.site_name), i.date_of_inspection desc
on conflict do nothing;

-- Link inspections to their sites
update public.inspections i
set site_id = s.id
from public.clients c, public.sites s
where i.site_id is null
  and c.name = trim(i.client_name)
  and s.client_id = c.id
  and s.name = trim(i.site_name);

-- Durable assets: one per (site, tag); latest visit's category
-- and location win
insert into public.assets (site_id, category, tag, location_note)
select distinct on (i.site_id, ia.asset_code)
       i.site_id, ia.category, ia.asset_code, ia.location_on_site
from public.inspection_assets ia
join public.inspections i on i.id = ia.inspection_id
where i.site_id is not null
order by i.site_id, ia.asset_code, i.date_of_inspection desc
on conflict do nothing;

-- Link historical results to their durable assets
update public.inspection_assets ia
set asset_id = a.id
from public.inspections i, public.assets a
where ia.inspection_id = i.id
  and ia.asset_id is null
  and i.site_id is not null
  and a.site_id = i.site_id
  and a.tag = ia.asset_code;

-- Compute due dates for the backfilled registry
select public.refresh_asset_due_date(id) from public.assets;
