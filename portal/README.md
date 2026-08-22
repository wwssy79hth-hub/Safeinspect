# SafeInspect — client portal

The asset owner's surface, adapted from HeightTrack's portal (extraction plan item 7 in
`docs/heighttrack-comparison-review.md`). **Read-only by construction:** it has no write path at
all, and row-level security refuses every write from a portal member regardless.

No build step and no runtime CDN dependency — `vendor/supabase.js` is committed. Open it with any
static file server:

```bash
python3 serve.py     # http://127.0.0.1:5173
```

## What it shows

- **Sites** — compliance summary per site: assets, overdue, uncertified, do-not-use, next due date.
- **Site detail** — the full asset register plus every certificate issued for that site.
- **Certificate detail** — per-item results (status, finding, corrective action, standard
  referenced), evidence photos, and the report PDF when one is attached. Expired certificates
  are labelled, not left for the reader to work out by comparing two dates.

## Access model (migration `008_client_portal.sql`)

Portal access is a **membership row** (`client_members`), granted by an admin via
`grant_portal_access(user_id, client_id)` — never self-serve. A member sees only their own
client's sites and assets, and only inspections covered by an **issued certificate**: draft
field work is invisible until certified. `supabase/tests/portal_test.sql` proves both boundaries.

## Two things worth not undoing

**Evidence is fetched through short-lived signed URLs generated at read time and never persisted.**
A leaked certificate row therefore does not leak the photographs with it, and a URL copied out of
the page stops working in five minutes. Storage RLS still decides whether a signature is issued
at all — the expiry is defence in depth, not the boundary.

**Calendar dates stay as strings.** `next_due_on`, `last_pass_on` and `expires_on` are Postgres
`date` columns — calendar dates at the site, with no timezone. Parsing them into a JS `Date` and
formatting in the browser's zone reintroduces an off-by-one-day bug, and a portal is read by
people in other states. ISO-8601 also compares lexically, so "is this overdue" needs no date
maths.

## Deployment

Static files — any host will do. Deploy this `portal/` directory as its own site (do not serve it
from inside the staff app).
