-- ============================================================
-- SafeInspect — Davit categories
-- Adds the davit arm and the second davit type (needle davit)
-- so both appear as their own asset categories with their own
-- drawing glyphs, matching the Abseal icon legend
-- ("Davit / Needle Davit").
-- ============================================================

alter type asset_category add value if not exists 'DA';
alter type asset_category add value if not exists 'DN';
