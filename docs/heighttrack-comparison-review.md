# SafeInspect vs HeightTrack — Apples-for-Apples Feature & Usability Review

**Date:** 22 August 2026
**Scope:** `wwssy79hth-hub/safeinspect` (main, ~10,250 LOC) vs `wwssy79hth-hub/HeightTrack` (main, ~8,400 LOC)
**Question answered:** Is SafeInspect inferior to or missing features present in HeightTrack, and which of those features could be extracted from HeightTrack into SafeInspect?

Every claim below was verified against the code of both repositories, not just their documentation.

> **Note:** this review assesses `main` of both repos. Open draft PR [#5](https://github.com/wwssy79hth-hub/Safeinspect/pull/5) (site-plan tables + SVG overlay map) already addresses the markers-in-notes problem and part of the offline replay wiring called out below; where it lands, read those findings as "fixed in flight".

---

## 1. Executive summary

The two products serve the same domain — AS/NZS 1891 height-safety inspection of roof anchors, static lines, ladders, guardrails and walkways — but they made **opposite architectural bets and matured in opposite directions**:

- **SafeInspect** is a single-tenant React + Vite + Supabase web app built for one company (Abseal Pty Ltd). It is **UI-strong and backend-thin**: a polished mobile-web capture experience and the best PDF report in the pair, sitting on 2 migrations, 4 tables, 0 tests, and an offline story that is wired up but non-functional.
- **HeightTrack** is a multi-tenant commercial product: a native iOS/Mac Catalyst field app, a client web portal, and a 22-migration Supabase backend covered by 89 pgTAP tests. It is **backend-strong and UI-thin**: durable assets, real offline sync, a certificate lifecycle with evidence gates, a defect state machine, and a due-date alert engine — but no admin surface, no search, no defect-viewing screen, and an alert engine nothing consumes yet.

**Verdict: yes, SafeInspect is materially inferior in every *structural* dimension** — durable asset registry, multi-tenancy, honest offline capture, certification lifecycle, standards-as-data, defect management, due-date alerting, client portal, evidence integrity, and testing. HeightTrack's own architecture doc was written explicitly as a correction of SafeInspect's design, and the code delivers on it.

**Where SafeInspect is genuinely ahead:** report/PDF generation (five report types vs HeightTrack's single certificate), the pre-written findings knowledge base ("Quick Fill"), the interactive site-plan marker editor (HeightTrack's equivalent is schema-only — no UI reads it), the 21-category asset taxonomy, self-serve auth, and mobile-web UX polish.

**Extractability is high.** HeightTrack's most valuable features live in its SQL migrations and RPCs — the same Supabase technology SafeInspect already runs on, so they port as schema + SQL regardless of frontend stack. The Swift UI is not portable but serves as a design spec; the client portal is dependency-free vanilla JS + Supabase and is reusable nearly as-is. Section 6 ranks the extractions.

---

## 2. What each product is

| | SafeInspect | HeightTrack |
|---|---|---|
| Stack | React 18 + Vite + TypeScript + Tailwind + Supabase | Native iOS 16 / Mac Catalyst (SwiftUI) + vanilla-JS client portal + Supabase (PG 17, Sydney) |
| Tenancy | Single company (Abseal hard-coded in signup) | Multi-tenant: contractor orgs + client orgs, boundary on the site |
| Users | admin / inspector / viewer roles — defined but no route enforces them | org roles owner/admin/certifier/inspector/viewer, enforced in RLS + RPC gates |
| Backend | 2 migrations, 4 tables, 0 tests | 22 migrations, 15 tables + view, 14 RPCs, 2 pg_cron jobs, 89 pgTAP tests |
| Clients | One web app (field + office) | iOS/Catalyst field app + read-mostly client portal (deployed to Vercel, awaiting domain); **no contractor web surface** |
| Provisioning | Self-serve signup | Service-role/SQL only (no signup, no admin console) |

---

## 3. Feature matrix

Legend: ✅ full · 🟡 partial / built-but-unwired · ❌ absent.

| Capability | SafeInspect | HeightTrack | Evidence |
|---|---|---|---|
| **Domain & data** | | | |
| Durable asset registry (asset outlives the visit) | ❌ | ✅ | SI: `inspection_assets` unique per inspection. HT: `assets` with serial, install date, status, due date; `unique(site_id, tag)` |
| Per-asset inspection history | ❌ | ✅ | HT `asset_inspections` dual-keyed on `inspection_id` + `asset_id`, revisioned |
| Reusable client/site records | ❌ | ✅ schema / 🟡 UI | SI retypes client+site free-text per inspection. HT has `orgs`/`sites` but creating them is service-role SQL — no UI |
| Multi-tenancy enforced in RLS | ❌ | ✅ | HT `tenancy_test.sql`: "client A cannot see sibling client B" |
| Standards as data (intervals/test methods, effective dates) | ❌ | ✅ | SI hard-codes `AS/NZS 1891.4:2009` strings (superseded 2025). HT `standards`/`asset_classes`/`inspection_rules` (26 seeded rows, flagged unverified) |
| Standard edition stamped per record, server-side | 🟡 | ✅ | SI: free-text `standard_referenced` picked by the inspector. HT: `capture_asset_inspection()` stamps code/edition/method server-side so a stale device cannot mis-stamp evidence |
| **Field capture** | | | |
| Structured per-asset capture form | ✅ | ✅ | Both strong; different philosophies (SI rich text+knowledge base; HT minimal-taps) |
| Form driven by asset class / test method | 🟡 | ✅ | HT renders proof-load / documentation-review / functional-test / visual variants from `inspection_rules.test_method` — the AS/NZS 1891.4:2025 multi-fastener documentary route is a first-class form |
| Pre-written findings library (one-tap fill) | ✅ | ❌ | SI Quick Fill: ~70 AS-referenced finding/action pairs across 19 categories |
| Photos with captions | ✅ | 🟡 | HT photos have no captions; but are downscaled on-device (~430 KB) and queued durably |
| Signatures | 🟡 | ✅ | SI wires certifier only; `inspector_signature_url` exists, nothing writes it. HT signs at certificate issue; stroke-based, re-render at any resolution |
| Persisted checklists | ❌ | ✅ | SI checklist ticks are ephemeral component state. HT folds the 4-item documentation checklist into the capture note and gates a pass on it |
| Site plan with placed asset markers | ✅ UI / 🟡 storage | 🟡 schema-only | SI has a full interactive editor but persists markers as `"MARKERS:"` JSON inside `notes`. HT has `plan_x/plan_y` (normalized 0..1) + `plan_object_path`, seeded — and **no client reads them, no bucket exists** |
| GPS | 🟡 captured, discarded | ❌ | Neither persists location. SI has no DB columns for its captured coords; HT has no CoreLocation at all |
| QR / NFC asset scanning | ❌ (stub route) | ❌ | Neither. SI ships a dead "Scan QR" quick action |
| **Offline** | | | |
| Local-first capture (full day with no signal) | ❌ | ✅ | SI store writes straight to Supabase; its sync queue exists but **`enqueue()` has no callers**. HT: three durable outboxes, one atomic JSON file per record |
| Idempotent replay (client keys, server upsert) | ❌ | ✅ | SI drops ops after 5 retries (silent data loss). HT `client_uuid` on captures *and* defects; replay returns the existing row, concurrency-safe |
| Photo queue separate from data | ❌ | ✅ | SI explicitly won't re-upload photos from its queue. HT: per-photo state, capture-before-photo enforced by the storage policy, not sync order |
| Offline read cache (download before you go) | ❌ | ✅ | HT caches jobs/assets/rules on site open + pull-to-refresh (implicit, not the doc's explicit "download job" button) |
| Sync status screen | ❌ | ✅ | HT: pending/failed counts, per-item errors, attempt counts, queued-photo megabytes. (Bug: queued *defects* aren't listed) |
| **Certification lifecycle** | | | |
| Certificate as a first-class record with expiry | ❌ | ✅ | SI's "certificate" is a PDF written to a `reports` bucket **that no migration creates** |
| Per-contractor certificate numbering | ❌ | ✅ | HT: contractor prefix + sequence (a global sequence would leak competitors' volume); SI's `generateReportNumber` is dead code |
| Issue gates: completeness, evidence landed, role separation | ❌ | ✅ | HT `issue_certificate()`: no missing assets, `outstanding_photos = 0`, and an inspector cannot certify their own work |
| Append-only records after issue (trigger-enforced) | ❌ | ✅ | HT blocks UPDATE/DELETE on certified results; corrections are new revisions. SI rows stay editable after the report is generated |
| Due date derived from standard rules, per asset | 🟡 | ✅ | SI: PDF prints inspection date + 1 year. HT: `next_due_date()` resolves the rule **as of the inspection date**; `refresh_asset_due_date()` recomputes from current revisions so a superseding fail retracts the date |
| Due-date sweep + alerts + escalation | ❌ | ✅ backend / ❌ delivery | HT pg_cron sweeps (site-local timezone, dedupe keys), escalation adds owners/admins as recipients. **No client consumes alerts yet; no push/email exists.** SI's bell icon is a decorative dot |
| **Defects** | | | |
| Defect lifecycle (raised→quoted→approved/declined→rectified→verified→closed) | ❌ | ✅ backend / 🟡 UI | SI has finding/corrective-action text + P1–P3 on one visit's row. HT: full state machine, append-only totally-ordered event log; but quote/rectify/verify RPCs have **no UI caller**, and the iOS app can raise defects yet has no screen to view them |
| Defect belongs to the asset, outlives the visit | ❌ | ✅ | Answers "which assets enter their next annual with an open defect?" |
| "Do not use" as a blocking first-class asset state | ❌ | ✅ | HT: set by `raise_defect`, cleared by `verify_defect` only when no other condemning defect remains; shown in app + portal; condemnation raises an alert via trigger |
| Client approve/decline with attribution | ❌ | ✅ | HT portal's single write: `decide_defect`, gated on owner-org admin, logged with `actor_org_id` |
| **Client-facing** | | | |
| Client portal (sites, register, certificates, evidence, defect decisions) | ❌ | ✅ | HT: built, deployed to Vercel, awaiting domain. Evidence via 300 s signed URLs, never persisted |
| Report/PDF quality & breadth | ✅✅ | ✅ | SI: 1,243-line vector A4 report — cover, per-category sections, photo grids with captions, recommendations by priority, site layout, sign-off, branding. HT: a single clean certificate PDF (results table, signature, auto page breaks) |
| Multiple report types with safety-correct rules | ✅ (5) | ❌ (1) | SI's proposal rule — nothing on proposed hardware may render as "compliant" — is genuinely good domain design |
| Report delivery | 🟡 | 🟡 | SI: download + upload-to-missing-bucket. HT: portal download only; no email/share anywhere |
| **Operations & usability** | | | |
| Search / filter / sort | ❌ | ❌ | Neither product has a search box anywhere. SI's inspections list is a stub; HT has fixed sorts only |
| Dashboard | ✅ | 🟡 | SI: greeting, 4 stat cards, continue-banner, recent list (client-side over a full fetch). HT: register counts in-app; per-site stat cards in portal; no cross-site contractor dashboard |
| Bulk operations | ❌ | ❌ | SI: only "auto-place markers". HT: strictly one asset at a time; no carried-forward defaults despite the doc asking for them |
| Import / export | ❌ | ❌ | No CSV either way in either product |
| Team / user management UI | ❌ (stub) | ❌ | HT has `grant_membership()` RPC, no surface |
| Self-serve auth (signup, magic link, password reset) | ✅ | ❌ | HT is login-only with provisioned accounts |
| Mobile field ergonomics | ✅ (web) | ✅ (native) | SI: bottom tabs, touch targets, safe areas, camera capture attr — but not installable (no manifest/service worker) and every save needs network. HT: one-tap segmented results, no modal chains, camera one tap away, works signal-free |
| Dark mode | ❌ | ✅ | HT: native + portal `prefers-color-scheme` |
| Automated tests | ❌ (0) | ✅ (89) | 8 pgTAP files incl. RLS tenancy proofs, idempotency replay, storage-path case rules |
| Security hardening | 🟡 | ✅ | SI: recursive admin policy on `profiles`; bucket-wide storage grants; `getPublicUrl()` on private buckets. HT: helpers in a private schema, pinned `search_path`s, no-DELETE evidence buckets, name-pinned certificate paths. (HT demerit: live demo credentials committed) |

---

## 4. Where SafeInspect is inferior — the structural gaps

### 4.1 The domain model: inspection-as-document vs asset-as-durable-entity

The root cause of most other gaps. SafeInspect's assets are children of one inspection (`unique (inspection_id, asset_code)`), so there is no way to ask "show me this anchor's ten-year history", next year's recert starts from a blank page, and the due date is a field on the visit that nothing tracks. HeightTrack models `org → site → asset → asset_inspection` with the asset as the unit of certification — its architecture doc calls this "the structural decision that everything else follows from", and it is the single most valuable thing SafeInspect could adopt.

### 4.2 Offline is cosmetic in SafeInspect, load-bearing in HeightTrack

SafeInspect ships the *parts* of an offline story — `useOnlineStatus`, a persisted `syncQueue` store with retry logic, an `OfflineBanner` — but **no code path ever calls `enqueue()`**: every mutation hits Supabase directly and merely records an error on failure. Even if wired, the queue drops an op after 5 retries and deliberately refuses to re-upload photos. An inspector on a roof in a dead zone loses work and is told "Working Offline" while it happens.

HeightTrack's capture path never touches the network: one atomic JSON file per record across three durable outboxes (captures, photos, defects), client-generated idempotency keys upserted server-side (concurrency-safe, replay-safe, reinstall-safe), photos downscaled on-device and drained on their own queue so a slow upload never blocks field work, cache-first reads with a soft offline footnote, and a sync screen showing exactly what is pending or failed and why. A failed capture is *never* dropped — it is re-saved with its attempt count and error for the inspector to see.

### 4.3 No certification lifecycle

In SafeInspect, "issuing" is generating a PDF — into a storage bucket (`reports`) that no migration creates, so "Save Report to Cloud" fails on a fresh project. Records remain editable afterwards; the `issued` status exists and nothing ever sets it. HeightTrack's `issue_certificate()` enforces three gates (all assets captured; all declared evidence landed; the issuer holds a certifying role and an inspector cannot certify their own work), allocates a per-contractor number, sets expiry from the site's earliest asset due date, flips the inspection to `certified` — which trigger-locks every underlying result against UPDATE/DELETE. Corrections become superseding revisions. For a product whose output is legal evidence, this is the difference between a document and a record.

### 4.4 Standards are hard-coded, and now wrong

SafeInspect scatters `AS/NZS 1891.4:2009` as default strings across its schema, three mutually-inconsistent knowledge-base files, and its PDF declarations. AS/NZS 1891.4 was revised in **2025** — changed intervals (12 months installed systems, 6 months PPE, harsher for harsh service) and a changed multi-fastener anchor test regime (documentary route instead of annual proof load). Updating SafeInspect is a code deploy; HeightTrack stores intervals and test methods as rows with effective dates, renders the capture form from `inspection_rules.test_method`, and stamps the edition on every capture **server-side** — a standards revision is an INSERT. (Caveat HeightTrack itself documents: its 26 seeded rules are marked unverified pending sign-off by a competent person, and only the 2025 edition is seeded.)

### 4.5 No defect workflow

SafeInspect records a finding, a corrective action, and a P1–P3 priority as text on one visit's asset row. Nothing tracks whether the defect was quoted, approved, fixed, verified, or is still open a year later. HeightTrack's model — defects hung off the asset with the raising visit as provenance, a six-state lifecycle where `declined` deliberately stays open ("the owner was told and chose not to act" is exactly the record that matters if someone later falls), an append-only totally-ordered event log, client decisions attributed to the owner org, and "do not use" as a blocking asset state mirrored in app, portal and certificate — is the workflow the industry actually runs.

### 4.6 No recurring-revenue engine

Annual recertification is why this data has a ten-year life. SafeInspect stores a due date and prints it; nothing sweeps it or raises work from it (the notification bell is a hard-coded orange dot). HeightTrack's pg_cron sweep compares due dates against **today in each site's own timezone**, raises deduplicated `due_soon`/`overdue`/`certificate_expired` alerts, and escalates unacknowledged critical alerts by *adding* the contractor's owners/admins as recipients. Honest caveat: nothing consumes these alerts yet — no push, no email, no in-app inbox — so what SafeInspect should extract is the engine, plus the delivery surface both products still lack.

### 4.7 No client, site or team management

Client and site are free text retyped per SafeInspect inspection; there is no history per site, no team admin (the `/team` route is a stub, roles are never enforced, signup hard-codes `role: 'inspector'`). HeightTrack has the *schema* for all of it (orgs, memberships with role-consistency triggers, sites with owner/contractor boundary) but, notably, **also has no management UI** — provisioning is service-role SQL. The gap SafeInspect must close is the data model; the admin UI is greenfield for both.

### 4.8 No tests, weaker hardening

SafeInspect: zero tests; an admin RLS policy that self-references `profiles` (recursion risk); storage policies letting any authenticated user read/write all buckets; private buckets read via `getPublicUrl()` (URLs that won't resolve); GPS captured then discarded; site-map markers serialized into the `notes` column. HeightTrack: 89 pgTAP assertions including RLS tenancy proofs and idempotency replays; RLS helpers in a private schema with pinned `search_path`s; a security-invoker view (with a test that catches the bypass); no-DELETE evidence buckets; capture-before-photo enforced by storage policy; name-pinned certificate documents verified to exist with the right mimetype before attach.

---

## 5. Where SafeInspect is ahead — worth preserving

An honest apples-for-apples cuts both ways. HeightTrack is UI-thin, and several SafeInspect surfaces are the better of the pair:

1. **The PDF report generator** (`src/lib/reportGenerator.ts`, 1,243 lines): cover page, per-category sections, per-asset detail blocks with embedded captioned photo grids, recommendations grouped by priority, site-layout page, sign-off page, branded running headers/footers, live progress callback. HeightTrack's single certificate PDF is clean but far narrower — it has no site report, no defect report, no register export, and lists server-side rendering as future work.
2. **Five report types with a safety-correct rule engine** (`src/lib/reportTypes.ts`): recertification, new-install verification, proposed installation, non-compliant follow-up, initial inspection — and the rule that a proposal can never display an item as "compliant" (`displayStatus()` coerces it). That encodes real domain wisdom HeightTrack doesn't have.
3. **The Quick Fill knowledge base** (`src/lib/inspection-data.ts`): ~70 pre-written AS-referenced finding/corrective-action pairs across 19 categories, applied in one tap, plus suggestion buttons on the finding/action fields. Directly transplantable into any capture UI — including HeightTrack's.
4. **The 21-category asset taxonomy** with codes, labels, icons and per-category checklists — richer than HeightTrack's 9 seeded asset classes.
5. **The interactive site-plan editor** (`SiteMap.tsx`, 661 lines): place, drag, auto-place status-coloured pins on an aerial image; click-through to the asset; legend with live counts. HeightTrack *designed* this surface ("the aerial map is the real map"), put `plan_x/plan_y` in its schema and seed — and never built the UI or even the storage bucket. SafeInspect's editor working against HeightTrack's schema (normalized 0..1 coordinates, so a re-uploaded plan doesn't orphan markers) is the best of both.
6. **Self-serve auth**: signup, magic link, password reset request. HeightTrack is login-only with SQL-provisioned accounts.
7. **Mobile-web polish**: bottom tab bar, 48/56 px touch targets, safe-area insets, camera capture attribute, skeletons/empty states, press feedback.

---

## 6. What to extract from HeightTrack into SafeInspect (ranked)

HeightTrack's value to SafeInspect is concentrated in **SQL migrations, RPCs and workflow designs — all directly portable** to SafeInspect's own Supabase backend. The Swift views aren't portable but are design specs; the portal is dependency-free vanilla JS reusable nearly as-is.

| # | Extract | From (HeightTrack) | Into (SafeInspect) | Effort | Notes |
|---|---|---|---|---|---|
| 1 | **Hardening + hygiene patterns** | `function_hardening.sql`, storage policies, security-invoker view pattern | Fix the recursive admin policy, bucket-wide grants, public-URL-on-private-bucket bug; create the missing `reports` bucket | Low | Independent of everything; do immediately |
| 2 | **Standards-as-data**: `standards`, `asset_classes`, `inspection_rules` + `applicable_rule()` / `next_due_date()` resolved as-of inspection date; stamp edition server-side | `standards.sql` + seed | Replace hard-coded 2009 strings; map SI's 21 categories onto `asset_classes`; drive form variants and due dates | Low–Med | Self-contained; fixes an active correctness problem (2025 revision). Carry over HT's caveat: rules need sign-off by a competent person |
| 3 | **Durable asset registry**: `sites`, `assets`, dual-keyed revisioned `asset_inspections`, `current_asset_inspections` view, `refresh_asset_due_date()` | `assets_and_inspections.sql` + 4 revision migrations | New migrations; capture UI selects/creates assets on a site instead of free-typing; HT's doc defines the data mapping (SI inspection ≙ HT inspection + generated `asset_inspection` rows) | High | The foundation — everything below depends on it |
| 4 | **Idempotent offline outbox**: client-generated capture keys, `capture_asset_inspection` upsert RPC, separate photo queue with `link_evidence_photo`, capture-before-photo storage policy, sync-status screen | `capture_asset_inspection_rpc.sql`, `evidence_photos.sql`; `Offline/*.swift` as design (one atomic record per file, drain captures→defects→photos, never drop a failed op); `SyncStatusView` as the screen spec | Rebuild SI's dead queue as an IndexedDB outbox actually called by the store; add the RPCs; add a real sync screen | Med–High | SI's current offline story silently loses field data — the highest user-facing risk in the product |
| 5 | **Certificates as records**: `certificates` table, per-contractor numbering, issue gates (completeness, evidence, role separation), append-only lock on issue, name-pinned document attach | `certificates.sql`, `issue_certificate_security_definer.sql`, `per_contractor_certificate_numbering.sql`, `asset_inspection_revisions.sql`, `attach_certificate_documents.sql` | Keep SI's superior PDF as the rendering; back it with a real gated record; wire the dead `issued` status | Med | Converts SI's best feature into defensible evidence |
| 6 | **Due-date alert engine**: pg_cron sweep in site-local time, deduped `alerts`/`alert_recipients`, acknowledgement, escalation-adds-people, condemned-asset trigger | `due_date_alerts_and_escalation.sql`, `schedule_alert_jobs.sql` | Port the engine, then build what *neither* product has: a delivery surface (SI's dashboard + the decorative bell are the natural home) | Med | The recurring-revenue engine; per-asset due dates need #3 |
| 7 | **Defect lifecycle**: `defects` + append-only totally-ordered `defect_events`, offline-queueable `raise_defect`, quote/decide/rectify/verify RPCs, "do not use" state | `defects_and_rectification.sql`, `defect_events_total_order.sql`, `defects_are_queueable_offline.sql` | Keep SI's finding/action text as content; make the lifecycle the tracking mechanism. Build the contractor screens HT never did (quote/rectify/verify have no UI caller even in HT) | Med–High | Depends on #3; unlocks "open defects entering the next annual" |
| 8 | **Client portal** | `portal/` — vanilla JS + Supabase, XSS-escaped, 300 s signed URLs for evidence, one write (`decide_defect`) | Reusable nearly as-is once the schema converges; or rebuild as thin React pages | Med | Table stakes commercially; needs #3/#5/#7 to have content |
| 9 | **Multi-tenancy**: `orgs` (contractor *and* client as real tenants), `memberships`, owner/contractor boundary on `sites`, org-id denormalization triggers, membership-from-table (never JWT) for the tenancy check | `tenancy.sql` + hardening follow-ups, `tenancy_test.sql` | Only if SafeInspect will serve more than Abseal — but decide **before** #3 lands, because org columns touch every table and HT's central lesson is that retrofitting tenancy is a rewrite | High | If single-tenant forever, skip; a slim `sites` table from #3 still ends the free-text client/site problem |
| 10 | **pgTAP test harness** | `supabase/tests/` (8 files, 89 assertions) | Adopt per-migration tests; port the tests along with each schema above (tenancy proof, idempotent replay, storage-path case rules, append-only guards) | Low | Cheap discipline with outsized payoff; SI currently has zero tests |

**Not worth extracting:** the Catalyst sheet-vs-push navigation workarounds, the Swift networking/keychain layer (supabase-js covers it), MapKit job routing (never built in HT either), and HeightTrack's committed demo credentials (an anti-pattern to avoid, not copy).

**Sequencing:** 1 → 2 are quick independent wins. Decide the multi-tenancy question (#9) before #3. Then 3 → 4 → 5 → 6 → 7 → 8, with #10 woven through every step.

### SafeInspect defects found during this review (fix alongside)

- Sync queue never populated — `enqueue()` has no callers; the offline banner over-promises.
- `reports` storage bucket missing → "Save Report to Cloud" fails on a fresh project.
- Private buckets read via `getPublicUrl()` throughout (photos, signatures, maps, reports).
- GPS captured, displayed, then discarded (no DB columns); checklist ticks unpersisted; inspector signature and `issued` status unwired; password-reset flow stops at "email sent" (`updatePassword` never called).
- Site-map markers serialized into `notes` with a `MARKERS:` prefix (so notes can't hold notes) — move to a markers table with HT's normalized 0..1 coordinates.
- Recursive admin RLS policy on `profiles`; `inspection_summary` type + RPC that exist in TypeScript but in no migration.
- Dead weight: 15 unused Radix packages, React Query mounted but never used, three conflicting `CATEGORY_STANDARDS` definitions across superseded files, unused `useAutoSave`, `html2canvas`.
- 8 stub routes, including 4 of the 5 primary nav destinations.

---

## 7. Usability comparison (field & office)

**In the field:** HeightTrack wins decisively on the two things that matter on a roof — capture works with zero signal, and the capture screen is built for one-handed, gloved speed: segmented one-tap results, method-specific inputs only when the rule demands them, camera one tap away, no modal chains, save-and-dismiss. SafeInspect's capture form is richer (Quick Fill, suggestions, captions, per-category checklists) but every save is a network round-trip and a dead zone means lost work; it also isn't installable as a PWA. Neither product has QR scanning or carried-forward defaults from the last visit — both docs want them, neither built them.

**In the office:** SafeInspect's dashboard and report suite are the pleasant surface, and its PDF is the stronger client deliverable. But it has no inspections list (stub), no search/filter/sort, no team admin, and no view of what's due. HeightTrack's backend can answer every operational question (what's due, what's open, what's certified until when) but exposes almost none of it to the contractor — no web surface for admins at all, no defect list even in the iOS app, alerts computed nightly that nobody sees. **Neither product currently has search, bulk operations, or import/export.** The office surface is the open flank on both sides; SafeInspect's React shell is honestly the better starting point for building it — against HeightTrack's schema.

**Trust:** HeightTrack shows the inspector a sync screen with per-item state and gates certificates on evidence actually landing; an inspector can verify a day's work is safe, and a client can verify a certificate means something. SafeInspect cannot currently make either promise.

---

## 8. Bottom line

SafeInspect is a well-crafted capture-and-report tool — best-in-pair PDF, a real findings knowledge base, a working site-plan editor — standing on a foundation that cannot support what this domain actually demands: durable assets, honest offline, certificates as evidence, defect follow-through, and recert-driven recurrence. HeightTrack has exactly that foundation, built, hardened and tested, in the same backend technology SafeInspect already uses — while itself lacking most of the surfaces SafeInspect already has.

The highest-leverage move is therefore not to copy HeightTrack's app, but to **adopt HeightTrack's schema and workflows underneath SafeInspect's UI strengths**: port the migrations in the ranked order of §6, keep SafeInspect's report generator, report-type rules, Quick Fill and site-map editor on top, reuse the HeightTrack portal for the client surface, and build the contractor's office tools — which neither product has — once, on the converged schema. HeightTrack's architecture doc explicitly kept its concepts name-compatible with SafeInspect so that "a future migration is a data move, not a semantic translation". The two products were designed to meet; this review's conclusion is that they should.
