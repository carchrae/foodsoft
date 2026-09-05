# Modern mobile UI: ordering page and dashboard

Handover notes for the work done on 2026-09-05. Two pages got a modern,
mobile-first version that members opt into; the classic pages are untouched
and remain the default.

| Page | Classic URL | Modern URL | JSON layer |
|---|---|---|---|
| Ordering | `/f/group_orders/new?order_id=X`, `/f/group_orders/:id/edit` | `/f/ordering/X` | `GET /f/ordering/X/data`, `PUT /f/ordering/X` |
| Dashboard | `/f` | `/f/dashboard` | `GET /f/dashboard/data` |

## How the opt-in works

* The preference lives in the browser only: `localStorage["foodsoft.ordering.ui"]`
  and `localStorage["foodsoft.dashboard.ui"]`, each `"modern"` or `"legacy"`.
* Each classic page shows a small "Try the new mobile-friendly …" button. Clicking it
  stores `"modern"` and opens the modern page.
* A tiny script in the `<head>` of the classic page redirects to the modern page
  when the stored value is `"modern"`, before the heavy classic table renders.
  `/f?classic=1` always shows the classic home page regardless.
* Every modern page has a "Switch to the classic page" link that stores `"legacy"`.
* Visiting a modern page directly also stores `"modern"` (visiting is opting in).
* The dashboard's "Order now / Edit order" buttons send people to whichever ordering
  page they have chosen.

## What the modern ordering page does

* One card per article, grouped by category, with sticky search and filters
  (All / My order / Cases to fill / category). 44px touch targets, numeric keypad
  on phones, no zoom-on-focus.
* The range is shown as two steppers, **At least** (= `quantity`) and **Up to**
  (= `quantity + tolerance`). The server still stores `quantity` and `tolerance`;
  the page converts. "Up to" can never drop below "At least".
* Auto-tolerance mirrors the classic page exactly: when an amount goes from 0 to
  more than 0 with no tolerance, tolerance becomes `floor(6 / price)`; taking the
  amount back to 0 removes that automatic tolerance again. Articles with a case
  size of 1 and stock orders show a single Amount stepper.
* Case status chips ("2 cases filled", "7 to fill", "2 extra") and a "Getting
  2 + 1 waiting for a full case" line use the same maths as `ordering.js` and
  `OrderArticle#calculate_units_to_order`.
* Fixed footer with total, "up to" maximum, credit after the order and the Save
  button. Save is disabled when nothing changed or when the balance would fall
  below `minimum_balance` (same rule as classic). Leaving with unsaved changes
  asks for confirmation.
* Saving sends JSON; on success the page stays put with a fresh snapshot from the
  server and a toast (classic redirects to the summary page). A stale
  `lock_version` returns HTTP 409 and the page shows a reload prompt.
* Boxfill min/max limits and stock orders (`?stock_order=1`) are passed through
  from the classic data but are untested here (neither is used on this coop).

## What the modern dashboard does

* Greeting, ordergroup, credit card with balance breakdown and the low-credit
  warning (threshold copied from the classic page, see decisions), links to the
  account statement and the wiki "Payments" page.
* Notice board: the wiki `Main_Page`, which the classic sidebar also shows.
* Current orders as cards: closing countdown, pickup, note, your order amount,
  the same badges as the classic page (items filled, cases to fill, full cases,
  co-op total vs supplier total, minimum order, splits), and Order / Edit / View
  buttons. Two or three columns on desktop.
* Tasks: waiting for your answer (Accept / Decline), your upcoming tasks (Mark
  done), help wanted (Take this task). Buttons POST to the existing
  `TasksController` actions and refresh the data. The test user has no tasks, so
  this section is written but not exercised.
* Closed-but-unsettled orders, recent transactions, role-based shortcuts (the
  classic sidebar links), apple points if enabled.

### Follow-up changes (same day)

* Wider gap between the "At least" and "Up to" steppers; on phones they sit at
  opposite edges of the card. Each stepper shows its own price underneath
  (At least: price × amount, Up to: price × maximum), replacing the separate
  line total. Prices are centred under the steppers.
* The "Getting 10 + 2" shorthand became short sentences: "You get all 10.",
  "You get 2 of 4, we need 3 more to fill a case for the other 2.", "You won't
  get any yet, we need 7 more to fill a case.", and when the range is used "You get 12:
  your 10 plus 2 extra. Thank you for helping to fill the case!"
* Case chips moved into a right column under the unit price, so each card is
  shorter on phones.
* The "Cases to fill" filter remembers which items needed filling when it was
  chosen, so an item you just completed stays on screen instead of vanishing.
* Case progress is painted behind the steppers as one horizontal bar per case:
  complete cases are solid green, the partial case fills from faint red to
  yellow and snaps to green when it completes. Capped at six bars.
* **Splittable cases** (flag `splittable_cases`, on by default; set it to
  `false` in `app_config.yml` to turn off). Articles whose note contains
  "splittable" can ship as a fraction of a case. The split size is fixed by
  case size: 24 → 12, 20 → 10, 25 → 10, 30 → 10, anything else half a case.
  Below the split amount the page works towards the split ("we need 5 more to
  fill a ½ case"). Once wanted + extra reach it, the split ships and the bar
  shows full-case progress with the shipping split in green and the remainder
  as the usual red-to-yellow fill; "to fill" then counts towards the whole
  case. This matches how past orders were placed
  (e.g. 11 wanted + 6 extra on a 24-count case → ½ case received). Case counts
  can be fractional ("1½ cases filled"), and the bar snaps to green at the fraction. The server's own
  allocation is untouched; this only changes what members see.
* When someone has more than 5 items and extra on every one of them (100% on
  the gauge), the footer shows `app/assets/images/heyeeyeeyyeyah.gif` next to
  the gauge. The asset URL is passed to the app via a data attribute on the
  page shell.
* Footer order on desktop is Cancel (far left), then gauge, credit, total, Save
  (far right). On phones the footer is two rows: total and credit ("Credit
  $123") above, gauge with Cancel and Save buttons below. The buttons read
  "Save" and "Cancel"; the "View order summary" button was removed.
* Items with extra but no amount count as part of the order and as helping
  (for the gauge, the nag and the celebration).
* "Cancel" (left side of the footer on all sizes) opens a dialog that zeroes
  every item and saves immediately, with a second option to undo unsaved
  changes by reloading the data,
  and asks people to avoid doing this at the last minute because other members need
  time to react and fill the cases. Boxfill minimums are respected.
* First visit: when no preference is stored yet, the classic ordering page and
  the classic home page show a one-time dialog offering the new design ("Try it
  now" / "Not now"). Either answer is remembered. Both modern pages carry a
  small "Classic view" link at the top; the classic pages keep their "Try the
  new…" button at the top.
* Dashboard: the greeting is gone; the ordergroup name sits in the top bar. The
  notice board now shows the wiki "Dashboard" page (as the classic page does),
  titled with the page name, and only when that page exists. The wiki front
  page (quick links) moved into the Shortcuts section. Newest public messages
  from the messages plugin are listed with Reply links.
* Stable card layout: the right column (unit price and chips) has a fixed width
  (35% on phones, 220px on desktop) so names never rewrap when chips appear,
  and one line is reserved for the "You get" sentence so cards don't jump.
* Dashboard order cards simplified: figures are one muted line (with cases to
  fill and an unmet minimum highlighted) instead of chips, your amount or "Not
  ordered yet" sits bottom-left with a single "Order" button bottom-right, and
  the View button is gone.
* Compact header on phones for the modern pages only: the modern views add an
  `fs-modern` class to `<html>` from `<head>`, and CSS in `ordering_app.scss`
  shrinks the logo, puts the user menu / Help / Feedback on the same row,
  hides the long coop-homepage link, slims the collapsed menu bar and the
  flash message. The shared layout file is untouched.
* Alternating row shading so each item reads as its own row (a slightly greener
  pair of shades for items in your order).
* The Save footer no longer floats 20 px above the bottom: the layout styles
  every `<footer>` with a bottom margin, now reset for the ordering footer.
* The header shows how many households (ordergroups with at least one article)
  have ordered so far, refreshed after each save.
* A sad face appears next to the "Up to" stepper of each rangeless item once a
  member has more than 10 different items in the order and no tolerance on any
  of them. "10 things" was read as 10 distinct articles with an amount, not 10
  units.
* Pressing Save with more than 5 items and a "Helping fill cases" score under
  50% opens a dialog explaining that filling cases needs people to be flexible
  and asking, if affordable and not wasteful, to raise "Up to" on a few more
  items. "Go back and add extra" switches to the "My order" filter; "Continue
  and save" saves. Not shown for stock orders or when no item can carry a range.
* `docker-compose-dev.yml` now includes a `redis` service (redis:7-alpine, host
  networking, port 6379) that the app and worker depend on, so saving orders
  works out of the box. It applies from the next `./start-docker-dev.sh`.

## Files

New, self-contained (drop-in for the custom-rebuild branch):

```
app/controllers/ordering_controller.rb
app/controllers/dashboard_controller.rb
app/serializers/ordering_serializer.rb
app/serializers/dashboard_serializer.rb
app/views/ordering/show.html.haml
app/views/ordering/_legacy_switch.html.haml
app/views/dashboard/show.html.haml
app/views/dashboard/_legacy_switch.html.haml
app/assets/javascripts/ordering_app.js
app/assets/javascripts/dashboard_app.js
app/assets/stylesheets/ordering_app.scss
app/assets/stylesheets/dashboard_app.scss
vendor/assets/javascripts/vue.global.prod.js   (Vue 3.4.38, global build)
doc/modern-ui.md
```

Existing files touched (all one-liners or route blocks):

```
config/routes.rb                          +8 lines: resources :ordering, resource :dashboard
app/assets/javascripts/application.js     +3 requires: vue.global.prod, ordering_app, dashboard_app
app/assets/stylesheets/application.css    +2 requires: ordering_app, dashboard_app
app/views/group_orders/_form.html.haml    +1 line: render 'ordering/legacy_switch'
app/views/home/index.html.haml            +1 line: render 'dashboard/legacy_switch'
```

Also, unrelated to the UI, as requested: `start-docker-dev.sh` now loops and
restarts `compose up` after 5 s if it exits (Ctrl+C still stops it), and both
services in `docker-compose-dev.yml` carry `restart: unless-stopped`. The
restart policy applies from the next `compose up`, not to the container that is
already running.

Porting to custom-rebuild: copy the new files, add the same route block and
manifest lines (its sprockets bundle is `application_legacy.js`), and render the
two `_legacy_switch` partials. The controllers use `before_action`, Rails 7
compatible. `GroupOrder#load_data` and `save_ordering!` exist on that branch with
the same shape, so the serializers should work unchanged.

## Design decisions

1. **Vue via sprockets, not a build pipeline.** The vendored Vue global build
   (~140 KB, ~50 KB gzipped, cached after first load) and the two apps are
   required from `application.js`, so they load on every page. A separate bundle
   would have needed a `config.assets.precompile` entry and a server restart,
   which I could not do from the sandbox. Easy to split later.
2. **Templates live in the JS as strings**, no `.vue` files, so no compiler step.
   Everything uses the runtime-included global build.
3. **A serializer is the client/server boundary.** `OrderingSerializer` and
   `DashboardSerializer` are plain Ruby objects that reuse `GroupOrder#load_data`
   and the same model methods the classic views call. When the server changes,
   these two files and the two controllers are the only places to adjust.
4. **Nothing in the existing controllers or models was changed.** The new
   controller copies the three small access filters from `GroupOrdersController`
   rather than extracting a concern, on purpose.
5. **"At least / Up to" instead of "Amount / Tolerance".** Members think in a
   range; the words explain themselves. The help panel still introduces the word
   tolerance. Needs your feel on the wording.
6. **Auto-tolerance kept at `floor(6 / price)`.** That is what the classic JS does
   (its help text says $5). For anything over $6 per unit the automatic range is
   zero, which may not be what you intend. See open questions.
7. **Save stays on the page** and shows a fresh snapshot rather than redirecting to
   the summary. The "View order summary" button was later removed at your request.
   Save is also disabled when nothing changed, which avoids re-queuing the
   confirmation email for no-op saves.
8. **Category grouping always on.** The classic page switches to a "partial or
   filled cases" grouping above 75 articles; the modern page uses filters ("My
   order", "Cases to fill") instead.
9. **Strings are English and hard-coded** in one `T` object per app, like the rest
   of this fork's views. Moving them to `I18n` later is mechanical.
10. **Low-credit threshold of $200 on the dashboard** is copied from the classic
    home page where it is also a literal, as `DashboardSerializer::LOW_CREDIT_THRESHOLD`.
11. **Dashboard statistics use the classic formulas** but each is wrapped so a
    failing statistic shows as missing rather than breaking the page. Found and
    fixed one difference on the way: `Relation#count { }` ignores the block on
    Rails 4.2, so "cases to fill" must be counted on the loaded array.
12. **Order notes are escaped before links are added.** The classic partial
    injects the raw note as HTML; the dashboard escapes it first.

## Verification done

* JSON layer exercised with curl as a test member: load, save, stale
  `lock_version` (409), zeroing an order, closed/unknown order (410 / redirect).
* Both pages screenshotted with headless Firefox at 390 px and 1280 px, including
  stepper clicks, search, help panel, and the saved / unsaved footer states.
* Classic ordering and home pages still render with the hook partials; the
  classic edit page now carries the redirect target.
* `node --check` on both JS files; sprockets compiles both stylesheets.
* Not run: the RSpec suite. Ruby is not executable from the sandbox and no specs
  were added. Request specs for the two controllers would be the next step.

Test data: I created user `claude-test` (password `claude-test`, email
`claude-test@example.invalid`) in a new ordergroup "ZZ Claude Test (temporary)"
with a $500 balance in the local dev database, and used it to place and then
remove a test order on order 1065. The group order is deleted and the article
totals are back to zero. Remove the user and group with:

```sql
delete from memberships where user_id = (select id from users where nick = 'claude-test');
delete from users where nick = 'claude-test';
delete from groups where name = 'ZZ Claude Test (temporary)';
```

Local environment note: Redis is not running on this machine, so saving an
order fails on both the classic and the modern page (the model queues the
confirmation email through Resque inside the save transaction). I used a
throwaway stand-in Redis for the save tests and stopped it afterwards.

## Open questions

* Should the automatic range be larger or configurable? At $6 it rarely kicks in
  for this supplier's prices. A per-unit count (e.g. always +1) may match your
  intent better than a dollar value.
* Is "At least / Up to" the wording you want, or "Want / Up to", "Min / Max"?
* Should the modern pages become the default for everyone after a trial, with a
  server-side switch instead of localStorage?
* The Bootstrap 2 header (logo, user menu, collapsed navbar, flash) takes a lot
  of the phone screen above both modern pages. Slimming it would mean touching
  the shared layout, which I left alone.
* Should the dashboard keep the wiki Main_Page as the notice board, or is that
  content better placed elsewhere?
* When `tolerance_is_costly` is on, the footer shows tolerance already included
  in the total and drops the "up to" line. Confirm that is the right reading.
* Nothing is committed. All changes are in the working tree.
