# SafeInspect

Height safety inspection and recertification platform for Abseal Pty Ltd.
Inspectors record roof-safety assets on site — often offline — and the app
generates an AS/NZS 1891.4 recertification report as a PDF.

## Stack

| Concern | Choice |
| --- | --- |
| Build | Vite 5 + React 18 + TypeScript (strict) |
| Backend | Supabase (Postgres, Auth, Storage, RLS) |
| State | Zustand (`auth`, `inspection`, `syncQueue` stores) |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS |
| PDF | jsPDF + jspdf-autotable |

## Getting started

```bash
npm install
cp .env.example .env   # then fill in your Supabase project values
npm run dev            # http://localhost:5173
```

### Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck (`tsc`) then build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint over `src/` (warnings are errors) |

### Environment

Both Supabase variables are required — `src/lib/supabase.ts` throws at startup
if either is missing.

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key |
| `VITE_APP_NAME` | Display name |
| `VITE_APP_VERSION` | Displayed build version |

`.env` is gitignored. Only `.env.example` belongs in source control.

## Database

Apply `supabase/migrations/001_initial_schema.sql` to your Supabase project
(SQL Editor, or `supabase db push`). It creates the enums, the four tables
(`profiles`, `inspections`, `inspection_assets`, `asset_photos`), the
`updated_at` triggers, row level security policies, and the three storage
buckets (`inspection-photos`, `signatures`, `aerial-maps`).

`src/types/database.ts` is the hand-maintained TypeScript mirror of that
schema and must be kept in sync with it. Each table's `Insert` type is derived
from its `Row` via the `InsertOf<Row, RequiredKeys>` helper, so only columns
that are `NOT NULL` with no default are required on insert.

> Note: `database.ts` also declares an `inspection_summary` table and a
> `get_inspection_summary` function that the migration does not create. Nothing
> in `src/` uses them yet; add the SQL before relying on either.

## Layout

```
src/
  components/   auth, inspection (asset form, category, signature, site map), layout, ui
  hooks/        useAutoSave, useOnlineStatus, usePhotoCapture
  lib/          supabase client, auth service, sync queue, PDF report generator
  pages/        auth screens, Dashboard, inspections (New, Detail)
  store/        Zustand stores
  types/        database schema types
supabase/migrations/
```

## Offline behaviour

Inspections are captured on rooftops where connectivity is unreliable:

- `useOnlineStatus` tracks connectivity and `OfflineBanner` surfaces it.
- `syncQueue` persists failed mutations to localStorage and replays them when
  the device reconnects, retrying up to 5 times per operation. Each queued
  operation is a discriminated union member, so its payload is type-checked
  against the target table at enqueue time.
- Photo uploads are deliberately **not** replayed from the queue (the binary is
  not persisted); the user is prompted to re-add the photo instead.
