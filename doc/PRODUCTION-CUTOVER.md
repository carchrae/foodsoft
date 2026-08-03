# Production cutover: old fork → this branch (v4.9.2 series)

## Database changes

Upgrading the deployed production DB runs **34 upstream migrations**
(fork-point 2019 → v4.9.2). Our own customizations add **zero** new schema:
the supplier_price / supplier_note migrations keep their original timestamps
and are already recorded in production's `schema_migrations`, so no
reconciliation is needed.

The full 34-migration path has been executed successfully — twice — against a
copy of the real production dump (2026-08 spike, postgres 9.5 dump loaded
into postgres 12). Reports: `tmp/db-spike/report-a-*.txt`.

## Can we migrate back down? Effectively no.

Several of the 34 are one-way:

- `MigrateMessageBodyToActionText` — **drops `messages.body`** after copying
  into the ActionText tables
- `MoveAttachmentToActiveStorage` / `MoveDocumentsToActiveStorage` — move
  invoice/document files into ActiveStorage, drop the old columns
- `CreateStockEvents` — renames `deliveries`, merges and **drops
  `stock_takings`**
- `ChangeMarkedAsDeletedNames` — in-place string rewrite via raw SQL with no
  `down` (`db:rollback` raises `IrreversibleMigration` before getting far)
- `ChangeOrderArticleResultTypes` — precision narrowing (theoretically lossy)

The old app also cannot run against the new schema (it reads `messages.body`,
`deliveries`, `stock_takings` — gone/renamed). So there is no
"roll back the code, keep the DB" option.

## Rollback strategy: backup-restore, not down-migrations

1. Pick a quiet moment **right after orders are settled**, not mid-cycle —
   the only thing a rollback loses is data written after the upgrade, so keep
   that window near zero.
2. Maintenance mode / stop the old app.
3. `pg_dump` production. **That dump is the rollback.** Store it plus the
   untouched old deployment for at least a week or two after cutover.
4. Run `bundle exec rake db:migrate`, deploy this branch.
5. Smoke-test *before* letting members back in: orders list, one order page,
   balancing page of a settled order, one PDF of each kind, article list, a
   supplier sync, send a test order email.
6. If anything is wrong: restore the dump, restart the old stack — back in
   minutes.

Environment notes for the new deployment:
- required: `DATABASE_URL`, `SHARED_DATABASE_URL`, `REDIS_URL`,
  `SECRET_KEY_BASE`, `HOSTNAME` (mailer host), `POSTMARK_API_KEY` (or
  `SMTP_*`), `RAILS_FORCE_SSL` unset (defaults to on, correct behind TLS)
- a resque worker + resque-scheduler must run for the delayed order-update
  emails (see `lib/tasks/resque.rake`); cron from `config/schedule.rb`
  via whenever
- assets precompiled; `config/app_config.yml` carried over from the old
  deployment (per_page, reminder_optout_emails, task_assigned_without_confirmation
  are new optional keys)
