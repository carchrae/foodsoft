# Upstreaming candidates from this branch

Which pieces of our patch series could become pull requests to
[foodcoops/foodsoft](https://github.com/foodcoops/foodsoft), and which are too
co-op-specific to bother. Each PR should be a fresh branch off upstream
`master` carrying just that feature (our thematic commits make the extraction
easy — commit hashes below refer to this branch).

Upstream context: `master` is the 5.0 line (units overhaul); `v4.x` is
maintenance-only. Feature PRs should target `master`, bugfix PRs may be worth
proposing for `v4.x` too. Upstream expects specs with feature PRs and config
options instead of hardcoded behavior changes.

## A. Proposed pull requests

### Bugfixes (small, likely accepted quickly)

1. **PostgreSQL GroupingError in OrderPdf#ordergroups** — `b0f7649e` (one line).
   Grouping by `groups.id` while plucking `group_orders.ordergroup_id` is
   invalid SQL outside MySQL. Harmless on MySQL, unblocks anyone trying pg.
2. **Fail loudly when `shared_lists` is unconfigured** — `c15bd7e8`.
   Today the shared-article models silently fall back to the *main* database;
   a sync in that state can outlist a coop's whole catalogue. Clear error
   instead. Easy sell: data-loss footgun.
3. **Task page: reject button unreachable once accepted** — part of `ee24ca23`
   (tasks/show.haml indent fix). One-line UI bug.
4. **`_missing_units` crashes on bad article data (unit_quantity 0)** —
   part of `3eba9cc3`; rescue-and-log so one bad row can't take down listings.

### Small generic features (config-gated where behavior changes)

5. **Reopen a settled order** — from `3eba9cc3` + `b3478352`.
   `Order#reopen!` credits back exactly what settling charged (incl.
   transport) and returns the order to `finished`; button on the balancing
   page. Every coop mis-settles eventually. Gate behind finance role +
   confirmation; specs around the refund math.
6. **`supplier_note` on orders** — from `d2f3aa4e`. Per-order note included in
   the supplier email/fax. Generic and self-contained (migration + form field
   + mail templates).
7. **Copying an order copies note/end_action/ends/boxfill** — from `3eba9cc3`.
   Tiny quality-of-life PR; people forget the end time-of-day.
8. **Require an invoice before settling (config option)** — from `b3478352`.
   `settle_requires_invoice: true` disables the settle button until an
   invoice is attached.
9. **Supplier mail reply-to option** — from `d2f3aa4e`. Config to have
   supplier order mails reply-to the group inbox (and bcc it) instead of the
   ordering member. Multiple comma-separated supplier addresses already work.
10. **Postmark delivery + HOSTNAME override** — from `ee24ca23`
    (production.rb + gem, both env-gated; zero effect unless set).
11. **Case-insensitive article search incl. order number** — from `2c53854c`.
12. **`per_page` default from config** — from `f05ae9f2` (one line).
13. **Auto-accept task assignments (config)** — from `ee24ca23`;
    `task_assigned_without_confirmation`, plus the assigned-vs-accepted count
    helpers.
14. **beforeunload guard on the ordering page** — from `7d77fd64`. Warns
    before navigating away with unsaved order changes. Generic UX.
15. **Read-only visibility config options** — from `f05ae9f2`: let all
    members *view* the article list and pickup days (mutation still
    role-gated). Model it on upstream's `disable_members_overview` config.
16. **Available-funds column + totals in finance ordergroups list** — from
    `b3478352`.
17. **Remind-to-settle email** — from `ee24ca23`: daily rake task mailing
    order owners about orders picked up >2 days ago and not settled.
    Config-gated (`notify_settle_reminder`), opt-out list generalized.
18. **Upcoming (not yet started) orders section** — from `3eba9cc3`/`ed13579c`:
    `Order.upcoming` scope + separate block on the orders page. Complements
    upstream's `started` scope.

### Larger proposals (open an issue first, then PR)

19. **Pluggable order documents** — enabler, not a port: replace the
    hardcoded `case` in `Concerns::SendOrderPdf` (and the download-button
    partial) with a registry plugins can extend. This is what would let our
    split/bin sheets live entirely in a plugin — and other coops clearly
    customize these PDFs too. Small code, big leverage; propose as an issue
    with the registry sketch.
20. **Order email threading** — from `ee24ca23`: stable Message-ID per group
    order + In-Reply-To on subsequent order mails so clients thread them.
    Needs a storage story upstream would accept (we use redis; upstream may
    prefer a column).
21. **Sync robustness bundle** — from `2c53854c`: duplicate-order-number
    handling, keep-deposit-when-unknown quirk, refuse unit conversion when
    case sizes disagree, rename-instead-of-fail for articles in open orders.
    Worth an issue describing each; some may already be fixed in the 5.0
    sync rework, so check `master` first.
22. **Nearly-full cases report** — from `ee24ca23`: page + scheduled email
    showing cases close to filling before an order closes. Conceptually
    generic for case-splitting coops; the notification scheduling makes it
    medium-sized. Could also live in a plugin (see below).

## B. Too niche — keep as local patches (or move to a local plugin)

- **Horizon spreadsheet import** (`2c53854c`) — one wholesaler's file format,
  GST/PST tax flags, hardcoded 'Grocery' category.
- **Split sheets / bin sheets / matrix checklist layouts** (`b0f7649e`) — our
  paper workflow (write-in blanks, giant names + phone numbers, 8-wide
  grids). If PR #19 lands, these become a clean local plugin instead of
  patches.
- **Balancing reconciliation buttons** (`b3478352`) — "write off to
  Z - Group Expenses" hardcodes our ordergroup naming; the
  supplier-vs-charged framing assumes our supplier_price scheme
  (superseded by units in 5.0 anyway). The celebration gif stays ours.
- **HTML order emails with redis change-diff** (`ee24ca23`) — opinionated
  layout, redis dependency, our wording. The threading part alone is
  upstreamable (#20).
- **Ordering-form rework** (`7d77fd64`) — the $6 auto-tolerance rule,
  help-accordion prose, credit thresholds are all our co-op's policy.
- **Home page credit banner ($200), monthly dues ($5), member CSV export,
  wiki-in-sidebar, /join page, wording overrides** — local policy/branding.
- **Day-after-pickup charges mail, autonag, fees report** — our operational
  cadence.
- **Swap page** (`f05ae9f2`) — useful but tightly coupled to our
  same-first-word/same-unit matching heuristics; would need generalizing
  before proposing.

## C. Don't PR — superseded upstream

- **supplier_price** (`110ead7d`) and everything leaning on it: the 5.0
  units overhaul (`article_versions` with `supplier_order_unit`/`price_unit`)
  models supplier case prices properly. Re-map when we jump to 5.0.
- **Additional-charge distribution** — already dropped in favor of upstream
  transport costs.
- Anything we found already upstreamed while porting: balancing search &
  not-ordered partition, `OrderArticle#units`, outlist-absent fix,
  sync-limit config, `check_order_not_closed`, transport in PDFs.
