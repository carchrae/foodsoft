# Our customizations (patch series)

This branch is upstream foodsoft (v4.x line) plus a small series of thematic
commits, rebuilt 2026-08 from the old long-lived fork (tagged
`carchrae-master-2026-08`). Every custom commit is prefixed `custom:` and
references the old-branch commits it was ported from.

## The series (in dependency order)

| Commit theme | What it carries |
|---|---|
| postgres + dotenv support | `pg`/`dotenv-rails` gems, pg-flavored schema.rb. Includes fixes for upstream SQL that only worked on MySQL. |
| supplier price | `supplier_price` on articles/article_prices, PriceCalculation (tax excl. deposit, rounded-up case splits), article form + recalc button |
| supplier note + supplier order email/fax | `supplier_note` on orders, custom fax PDF layout, reply-to group inbox, no CSV attachment |
| order lifecycle rules | reopen/unclose settled orders, member-based sums, != 0 scopes, order copy carries dates+notes |
| balancing improvements | supplier-vs-member reconciliation, write-off / price-adjust buttons, invoice-required settle, reopen UI, the gif |
| split/bin/matrix PDFs | receiving split sheets, bin sheets with big name+phone, delivery checklist grids |
| article sync | Horizon import, robust shared-article matching, supplier_price sync, UNAVAILABLE! renames |
| swap page, join screen, permissions | swap articles on open orders, public /join, pickups for all members |
| home & orders pages | credit alert, badge-rich order lists, upcoming orders, member list export |
| member ordering form UX | mobile inputs, auto-tolerance ($6), filled/extra badges, fixed totals bar |
| html order emails & notifications | HTML mails, redis change-diff + threading, nearly-full report, reminders, ActiveJob notifier |
| co-op wording overrides | `config/locales/zz-custom.en.yml` — never edit `en.yml` directly |

Deliberately dropped (upstream covers it): shipping-charge distribution (use
Order transport costs), PDF page-break fix, hide-unstarted-orders, date-format
config, balancing search. Deliberately not ported: apple-touch icons, CSS
tweaks, tracker injection, nightly restarts.

## Conventions that keep rebases painless

- **Never fork `config/locales/en.yml`** — add or override keys in
  `config/locales/zz-custom.en.yml` (loads last via
  `config/initializers/zz_custom_locales.rb`).
- New schema columns get their own migrations; the three custom migrations
  reuse their original 2018/2019 timestamps so existing databases skip them.
- Prefer additions (new files, new routes, new partials) over edits to
  upstream files where possible.

## Upgrading to a new upstream release

```sh
git fetch origin
git rebase origin/v4.x       # or the new target once we jump to 5.0
# resolve conflicts commit-by-commit — each is one theme
bundle install
bin/rails db:migrate         # on a COPY of production first
```

Then re-verify the hard-to-test bits: render the four order PDFs, trigger
order_result/nearly-full mails against a mail catcher, run a Horizon sync
against a copy of the shared DB, and settle+reopen a test order.

Note for the future 5.0 jump: the units overhaul replaces
`articles`/`article_prices` with `article_versions` — the supplier-price,
balancing and sync themes will need re-mapping onto that model, not just
conflict resolution.
