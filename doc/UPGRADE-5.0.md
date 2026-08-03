# Upgrading this branch to foodsoft 5.0 (the units overhaul)

Status when written (2026-08): upstream `master` = v5.0.0-rc1 + CVE fix; the
stable line we build on is `v4.x` (v4.9.2). **Recommendation: wait for 5.0
final plus at least one point release** — the units data migration is still
collecting fixes (see upstream branch `fix/make-v5-migrations-more-tolerant`
and bugfix branches 1161/1163/1326) and other coops will debug it on their
data first. Then repeat the playbook used for this rebuild: spike on a DB
copy, rebase the series, verify, cut over.

## Database: 9 new migrations, three of them heavyweight

| Migration | What it does | Notes |
|---|---|---|
| `alter_articles_add_versioning` | **renames `article_prices` → `article_versions`**, copies every article's fields into its versions (per-row UPDATE loop) | slow on large history; the one with known edge-case fixes pending |
| `alter_articles_add_more_unit_logic` | converts `unit_quantity > 1` into `article_unit_ratios` rows; `price` becomes per-supplier-order-unit | semantic heart of the overhaul |
| `alter_suppliers_sharing_fields` | reworks shared-supplier sync fields | touches our sync theme |
| `create_article_units` | seeds the unit-code table (piece/metric, imperial when detected) | |
| `add_unit_migration_completed_to_suppliers` | flag for the per-supplier review screen | |
| + 4 smaller ones | schema fixes, remote-order fields, category soft-delete, auto-sync flag | |

The conversion SQL is hand-built but adapter-neutral in style (quoted values,
no obvious MySQL-isms) — decent odds on postgres, but that is exactly what
the next spike must prove before anything else.

**After deploying**, an admin must complete the semi-automatic **unit
migration screen for every supplier** (confirm unit mappings). Plan this as
real work, not a deploy step.

## Code: what must be re-mapped (not just conflict-fixed)

66 of our ~102 changed files also change in 5.0. Four themes need rethinking:

1. **supplier_price (mostly retires)** — `article_versions.price` +
   `price_unit` models the supplier case price properly. Our columns survive
   the table rename untouched; write one migration folding their values into
   the new fields, then drop them and the concern's fallback.
2. **sync / horizon import** — supplier sharing is reworked (remote sync,
   auto-sync); re-fit the matching + horizon mapping onto the new pipeline.
3. **PDFs, balancing, ordering form** — every `unit_quantity` use becomes a
   ratio-helper call; balancing reconciliation re-derives supplier charge
   from the units model.
4. **Runtime** — Ruby 2.7.8 → 3.4.7, Rails 7.0 → 7.2, a Bootstrap bump that
   will nudge our custom views, new dev images.

Everything else (lifecycle guards, emails/notifications, swap, join,
permissions, pages, wording overrides) should rebase with ordinary conflict
resolution.

Realistic effort: comparable to the four hardest themes of the 2026-08
rebuild, plus the supplier units review, plus a fresh migration spike.

## Procedure (when the time comes)

1. `git fetch origin` and branch `custom-5.0` from the 5.0 release tag.
2. Spike first: run the 9 migrations against a fresh copy of production on
   postgres (reuse `tmp/db-spike/` scripts, pointed at the new branch).
   Fix/patch until clean; time the versioning migration for the maintenance
   window.
3. Rebase/cherry-pick the series, reworking themes 1–3 above; drop the
   supplier_price theme in favor of the fold-in migration.
4. Verify against the migrated copy: the four PDFs, order emails, a Horizon
   sync, settle + reopen an order, and the ordering form math.
5. Complete the unit-migration screen for every supplier on the copy first to
   learn the mapping decisions, then cut over production
   (see PRODUCTION-CUTOVER.md — same backup-restore rollback logic applies;
   the versioning migration is equally one-way).
