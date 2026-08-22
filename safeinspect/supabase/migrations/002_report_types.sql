-- ============================================================
-- SafeInspect — Report Types
--
-- Adds the report types an inspector can choose between when
-- issuing a report:
--   · Recertification                (existing)
--   · New Installation & Verification  (new)
--   · Proposed Anchor Installation     (new)
--
-- A proposed anchor installation describes hardware that has not
-- been installed yet, so its items cannot be compliant. The
-- 'proposed' asset status (and matching site status) exist so the
-- report says PROPOSED against each item instead of COMPLIANT.
-- ============================================================

-- ─── New report types ────────────────────────────────────────

alter type issue_type add value if not exists 'new_install_verification';
alter type issue_type add value if not exists 'proposed_anchor_installation';

-- ─── Proposed status ─────────────────────────────────────────

alter type asset_status add value if not exists 'proposed';
alter type overall_site_status add value if not exists 'proposed';
