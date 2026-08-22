-- ============================================================
-- SafeInspect — Site Plans & Plan Features
-- Replaces the "MARKERS:" JSON-in-notes MVP with dedicated
-- tables, adds multi-roof support and vector geometry
-- (points, polylines, polygons) in image-normalised coords.
-- ============================================================

-- ─── Enums ───────────────────────────────────────────────────

create type plan_geometry_type as enum ('point', 'polyline', 'polygon');

-- ─── Site Plans ──────────────────────────────────────────────
-- One inspection can cover several roof areas ("Roof 01", "Roof 02"…),
-- each with its own aerial/plan image.

create table public.site_plans (
  id            uuid primary key default uuid_generate_v4(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  name          text not null default 'Roof 01',
  image_path    text,             -- Supabase Storage path (aerial-maps bucket)
  image_url     text,
  image_width   integer,          -- natural pixel dimensions of the uploaded image;
  image_height  integer,          -- geometry is normalised against these
  -- Scope boundary drawn on the overview page (dashed red polygon,
  -- everything outside is dimmed). Array of {x,y} in 0–1 image coords.
  scope_polygon jsonb,
  drawing_scaled boolean not null default false,
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (inspection_id, name)
);

create index idx_site_plans_inspection on public.site_plans(inspection_id);

-- ─── Plan Features ───────────────────────────────────────────
-- A feature is anything drawn on a plan: a point asset (anchor,
-- davit base), a linear asset (static line, guardrail run, walkway)
-- or an area. Geometry is an array of {x,y} vertices normalised to
-- the plan image (0–1 of width/height) so the same coordinates
-- render identically on any screen and in the PDF.

create table public.plan_features (
  id            uuid primary key default uuid_generate_v4(),
  site_plan_id  uuid not null references public.site_plans(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  -- Optional hard link to the inspection line item; asset_code kept
  -- denormalised so features survive asset deletion (set null).
  asset_id      uuid references public.inspection_assets(id) on delete set null,
  asset_code    text not null,                 -- e.g. "TMAP-029"
  category      asset_category not null,
  status        asset_status not null default 'compliant',
  geometry_type plan_geometry_type not null default 'point',
  geometry      jsonb not null default '[]',   -- [{ "x": 0.42, "y": 0.61 }, …]
  label         text,                          -- display label; defaults to asset_code.
                                               -- Range labels ("DB-01 to DB-05") go here.
  label_offset  jsonb,                         -- { "dx": 0.02, "dy": -0.01 } from anchor;
                                               -- offset labels get a leader line
  sort_order    smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_plan_features_plan on public.plan_features(site_plan_id);
create index idx_plan_features_inspection on public.plan_features(inspection_id);
create index idx_plan_features_asset_code on public.plan_features(inspection_id, asset_code);

-- ─── updated_at triggers ─────────────────────────────────────

create trigger set_site_plans_updated_at
  before update on public.site_plans
  for each row execute procedure public.set_updated_at();

create trigger set_plan_features_updated_at
  before update on public.plan_features
  for each row execute procedure public.set_updated_at();

-- ─── Row Level Security ──────────────────────────────────────
-- Same access rule as inspection_assets: follow parent inspection.

alter table public.site_plans enable row level security;
alter table public.plan_features enable row level security;

create policy "Site plans follow inspection access"
  on public.site_plans for all
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

create policy "Plan features follow inspection access"
  on public.plan_features for all
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

-- ─── Legacy data migration ───────────────────────────────────
-- Import markers previously stored as 'MARKERS:<json>' in
-- inspections.notes (x/y were 0–100 percentages → normalise to 0–1),
-- then clear the hijacked notes field.

do $$
declare
  insp record;
  plan_id uuid;
  m jsonb;
begin
  for insp in
    select id, aerial_map_url, drawing_scaled, roof_area_reference, notes
    from public.inspections
    where notes like 'MARKERS:%' or aerial_map_url is not null
  loop
    insert into public.site_plans (inspection_id, name, image_url, drawing_scaled)
    values (
      insp.id,
      coalesce(nullif(insp.roof_area_reference, ''), 'Roof 01'),
      insp.aerial_map_url,
      coalesce(insp.drawing_scaled, false)
    )
    on conflict (inspection_id, name) do update set image_url = excluded.image_url
    returning id into plan_id;

    if insp.notes like 'MARKERS:%' then
      begin
        for m in select * from jsonb_array_elements(substr(insp.notes, 9)::jsonb)
        loop
          insert into public.plan_features
            (site_plan_id, inspection_id, asset_id, asset_code, category, status,
             geometry_type, geometry, label)
          values (
            plan_id,
            insp.id,
            (select a.id from public.inspection_assets a
              where a.inspection_id = insp.id
                and a.asset_code = m->>'asset_code'
              limit 1),
            coalesce(m->>'asset_code', 'UNKNOWN'),
            (m->>'category')::asset_category,
            coalesce((m->>'status')::asset_status, 'compliant'),
            'point',
            jsonb_build_array(jsonb_build_object(
              'x', least(greatest((m->>'x')::numeric / 100, 0), 1),
              'y', least(greatest((m->>'y')::numeric / 100, 0), 1)
            )),
            coalesce(m->>'label', m->>'asset_code')
          );
        end loop;

        update public.inspections set notes = null where id = insp.id;
      exception when others then
        -- Corrupt legacy JSON or unknown enum value: leave notes untouched
        raise warning 'Skipping legacy marker import for inspection %: %', insp.id, sqlerrm;
      end;
    end if;
  end loop;
end;
$$;
