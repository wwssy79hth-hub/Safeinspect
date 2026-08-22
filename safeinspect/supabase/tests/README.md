# SafeInspect — database tests

pgTAP tests for the SafeInspect schema (extraction plan item 9 in
`docs/heighttrack-comparison-review.md`, adopting HeightTrack's testing discipline).

Run against a local Supabase stack:

```bash
supabase test db
```

Every file is self-contained (`begin; … rollback;`) and simulates callers the way Supabase does:
`set local "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'` plus
`set local role authenticated`, so RLS is exercised exactly as production exercises it.

| File | Proves |
|---|---|
| `hardening_test.sql` | The recursive admin-policy fix, role helpers, legacy storage-path parsing |
| `standards_test.sql` | 2025 intervals (12/6/3), as-of-date due math, pre-2025 returns null, reference data is read-only |
| `registry_test.sql` | Capture auto-registers durable assets, fail-retracts/pass-restores due dates, one asset across visits, viewer/editor write boundary |
| `certificates_test.sql` | Issue gates (signature, landed evidence), stamped expiry, post-issue freeze (even for the superuser), append-only certificates, admin-only revoke |
| `alerts_test.sql` | Sweep idempotence, staff fan-out, per-person acknowledgement, auto-resolution |
| `portal_test.sql` | **The sibling-client boundary**: a portal member cannot see another client, drafts are invisible until certified, the portal has no write path |

The portal test is the one that must never be skipped: it is the only automated proof that the
client portal is safe to open to two customers at once.
