# Modern mobile UI: ordering page and dashboard

Handover notes for the work done on 2026-09-05. Two pages got a modern,
mobile-first version that members opt into; the classic pages are untouched
and remain the default.

| Page | Classic URL | Modern URL | JSON layer |
|---|---|---|---|
| Ordering | `/f/group_orders/new?order_id=X`, `/f/group_orders/:id/edit` | `/f/ordering/X` | `GET /f/ordering/X/data`, `PUT /f/ordering/X` |
| All open orders | (none) | `/f/ordering` | `GET /f/ordering/all` |
| Dashboard | `/f` | `/f/dashboard` | `GET /f/dashboard/data` |

## How the opt-in works

* One preference for all modern pages, in the browser only:
  `localStorage["foodsoft.ui"]`, `"modern"` or `"legacy"`. (Earlier per-page
  keys are still read and are cleaned up on the next choice.)
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

## Combined ordering page (all open orders)

`/f/ordering` shows every open order on one page as one "virtual" order: each
order is a section (name, closing time, pickup, households so far, note) with
its category groups and article cards underneath, and search, the Mine / To
fill filters and the category picker work across all of them. The footer sums
everything: total, credit (funds excluding all open orders minus the page's
totals), the helping gauge, Save and Cancel. A "Jump to order…" select in the sticky
toolbar scrolls to an order's section. Save sends one request per order
that changed, each with its own lock version, in sequence; a stale conflict
names the order. The dashboard links to it with "Order from all at once" when
there is more than one open order.

Implementation: the same Vue component drives both pages. Internally it holds a
list of orders and the single page is the one-order case, so behaviour stays
identical there. `GET /f/ordering/all` returns one `OrderingSerializer`
snapshot per open order plus `funds.available_funds_without_open_orders`;
articles are tagged with their order id and stock flag on the client.

## What the modern dashboard does

* Greeting, ordergroup, credit card with balance breakdown and the low-credit
  warning (threshold copied from the classic page, see decisions), links to the
  account statement and the wiki "Payments" page.
* Notice board: the wiki `Main_Page`, which the classic sidebar also shows.
* Current orders as cards: closing countdown, pickup, note, one muted line of
  case figures (cases to fill, full cases, splits; the item count was dropped
  on request), then two matching blocks with a small-caps header and a large
  amount: "Group total" ($X, "of $Y" supplier total and the minimum-order
  status beside it) and "Your order" (in green, with who saved it and when),
  and an Order button. Two or three columns on desktop.
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
* On wide cards (768px and up, also inside the desktop columns) the "You get"
  sentence spans the full width of the card under the steppers.
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
* The classic ordering page, home page and orders overview show an alert with a
  large "Try the new mobile-friendly look" button at the top (the earlier
  first-visit dialog was dropped). Both modern pages carry a small "Classic
  view" link at the top.
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
* The orders overview (`/f/group_orders`) also honours the dashboard preference:
  with "modern" set it redirects to the dashboard, and shows the same first-visit
  prompt and "Try the new…" button otherwise. The dashboard gained a "Settled
  orders" section (last five closed orders, your amount, link to the archive) so
  nothing from that page is lost.
* Stepper labels include the current amount and unit ("At least 2×454g",
  "Up to 3×454g"). The category picker is hidden when an order has a single
  category. On desktop the unit price is larger and vertically centred.
* Article cards are one column up to 1100px and two columns on a full desktop.
  From 768px each card uses the wide layout (info left with the "You get"
  sentence bottom-left, steppers right); phones keep the stacked layout.
* Compact header on phones for the modern pages only: the modern views add an
  `fs-modern` class to `<html>` from `<head>`, and CSS in `ordering_app.scss`
  shrinks the logo, puts the user menu / Help / Feedback on the same row,
  hides the long coop-homepage link, slims the collapsed menu bar and the
  flash message. The shared layout file is untouched.
* Card tint for your items follows the outcome: pale green (and green left
  border) only when you get everything you asked for, pale amber (amber border)
  while some or all of it is still waiting for a case.
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

## Nearly-full case report (page and email)

`/f/orders/:id/nearly_full_articles` and the "Nearly Full Cases" email now
render the same card partial (`app/views/orders/_case_report_item.html.erb`)
with inline styles so it survives email clients: amber left border, "N to
fill" and "% of a case" chips and an amber fill bar for cases still filling;
green border, "N extra / case filled" chips and a full green bar for cases
filled with extras; a "supplier may ship 12 of 24" chip for splittable
articles (same split sizes as the ordering page); a one-line explanation with
the shortfall in red or the extras in green; and "you ordered 2, up to 4" when
the reader's group is on the item. Fullness, "to fill" and the ranking use the
same split-case rules as the ordering page via `app/models/case_fill.rb` (a
plain Ruby class): below the split amount a card works towards "a ½ case" and
ranks by that, over it the split ships (green segment) and the rest counts
towards the whole case. The email could not be rendered from the sandbox; it
shares the partial and helpers with the page, which was verified.

## Swap page (orders role)

`/f/orders/:id/swap` is now a Vue page (`swap_app.js`); `?classic=1` and the
"swap all" page (`/swap_all`) still render the old table, which moved to
`app/views/orders/_swap_classic.html.haml`. The JSON layer is
`SwapController` (`GET /f/swap/:id/data`, `PUT /f/swap/:id`) with
`SwapSerializer`: the order's articles (amounts, cases, households, whether
the supplier still lists it) plus every available article of the supplier.
Matching and scoring happen in the browser.

* One card per order article: name (with an "Unavailable" chip when the
  supplier flagged it), origin and manufacturer, price and pack, a muted line
  with wanted / households / cases / shortfall, and a "Replace with" select.
* **Similarity score** drives the picker. Names are cleaned ("UNAVAILABLE!"
  and punctuation dropped, lower-cased) and split into product words and
  pack/size specs ("11#", "22/25#", "12x3#", "L/XL"); grade codes such as
  FCY, HH or V/F are ignored and plurals are stemmed ("strawberries" =
  "strawberry"). Product words are compared front to back with weights 1, ½,
  ¼…: words in the common prefix count fully, a later word found elsewhere in
  the other name counts half, so "APPLES GALA F/XF 080/88CT" (85%) and
  "APPLES GALA POUCH BAG 12x2#" (75%) always outrank "APPLES SUNRISE BAGGED
  FCY 12x3#" (63%) for "APPLES GALA BAGGED FCY 12x3#" even though the latter
  shares the pack. Specs and character bigrams of the words only nudge the
  word score up by at most 15%. A different first word ("YAMS BAGGED 12x3#")
  cuts the score to 40%. The origin only nudges the result: a different
  origin costs at most 8% of the name score, so "PEPPERS RED 22/25#" from
  Mexico still beats "PEPPERS ORANGE HH L/XL 11# FCY" from BC for "PEPPERS
  RED HH L/XL 11# FCY". Supplier and manufacturer are ignored on purpose.
  Candidates flagged unavailable themselves stay listed but are forced red at
  the bottom.
* The "Replace with" control is a dropdown drawn by the page (`sw-picker`),
  not a native `<select>`: native popups ignore option colours on macOS and
  iOS. Closed it looks like a select; open it lists the current article first
  ("Keep this article"), then the candidates best match first, each row tinted
  from red (≤30%) through amber to green (≥90%) with name, origin,
  manufacturer, price, pack, price difference and the score. Once a different
  article is chosen the button and a "NN% match" chip take that colour, with
  chips for what differs (unit, case size, origin, price).
* Candidates are every available article with the same product word (first
  word, stemmed), whatever the unit: unit changes are handled by the
  conversion chips and prompt below. "Show all articles" on a card lifts the
  product-word rule for one row (this replaces the separate swap-all page for
  most cases).
* **Price difference** is shown as a bold chip once an article is chosen
  ("$3.26 cheaper" / "$0.34 more"), and each card carries a green "X (origin) is $Y
  cheaper · Use it" hint for the cheapest same-product alternative before
  anything is chosen (the classic "cheaper?" column), followed by whether the
  current demand would fill that article's case ("demand fills 1 case of 22",
  "1 case filled, 4 more needed for a case of 12", "16 more needed for a
  case of 22"), using the order line's own case maths with amounts converted
  when the unit changes. The same chip appears under the picker once a
  different article is chosen. Picker rows show the price difference as a
  chip beside the score.
* **Unit conversion.** Units are parsed ("3LB" = 3 × lb, "2kg" = 2000 × g,
  "L" = 1000 × ml, "CT" = 1 × ct). An article whose unit is a whole fraction
  of the current one (3LB → LB is ×3, 2kg → 500g is ×4) is offered as a
  candidate with a blue "×3" chip; choosing it shows "amounts ×3: 1×3LB
  becomes 3×LB" and a ticked box "Multiply everyone's amounts by 3". The
  price difference then compares 3 × the new price with the old one. Prices
  are always compared for the same amount whenever both units share a base,
  even when member amounts cannot be converted: a per-LB article at $25.50 is
  "$3.19 per .125 LB" next to a $3.19 eighth-pound article, i.e. the same
  price. Same-base articles are listed as candidates regardless of whether
  the amounts convert; only the amounts multiplier needs a whole factor.
* **Asking for a conversion.** When no whole-number conversion exists (a 3LB
  bag to a CT article, an eighth-pound pack to a per-pound one) the card shows
  an amber prompt: "How should members' amounts be converted from 3LB to CT?
  1×3LB = [ 80/12 ] ×CT". The box is prefilled with the unit ratio when the
  bases match (0.125 for .125 LB → LB); across bases it is prefilled with the
  case ratio "new case size / old case size" (80/12 for 12×3LB → 80×CT) on the
  assumption that a case of each holds the same amount, with a note saying so.
  It accepts decimals and fractions ("1/8"), and empty means keep the numbers. As you type, an example is built from the real
  member amounts (sent as numbers only, no names): "Example: 1×3LB becomes
  8×CT. Members' amounts 1→8, 1→8, 2→16. Extra: 1→8." plus "Rounded to whole
  units." and a red "N members would end up with 0 and be dropped" when a
  fractional factor rounds someone away. The server applies the same rounding
  to each member's amount, extra and queue records and removes rows that end
  at zero. The same panel can be opened on any changed row with the "Custom
  conversion…" link (prefilled with the automatic factor, or 1 for the same
  unit) and overrides the automatic conversion while open; "Use the automatic
  conversion" closes it. Typing is debounced (250 ms) and the candidate lists
  are cached per row, since rescoring 700 articles for 50 rows on every
  keystroke made the input lag. Saving
  sends `{article_id, factor}`; the server multiplies every member's amount,
  tolerance and their queue records in place (so who-ordered-first is kept),
  recomputes the order article and the ordergroups' totals. Going the other
  way (LB → 3LB) or across bases (CT → LB) cannot be converted and is
  flagged red under "Show all articles".
* Summary banner "N of M unavailable articles still need an available
  alternative chosen" (red until done, then green), search, and All /
  Unavailable / Changed filters. Sticky footer with "Undo all" and "Update
  order"; only changed rows are sent. Per-row errors from the server (e.g.
  the article is already in the order) are shown on the card.
* Verified: JSON load and save with curl (a swap and the swap back), desktop
  and 390px screenshots, the filter and the count in headless Firefox.

## Files

New, self-contained (drop-in for the custom-rebuild branch):

```
app/controllers/ordering_controller.rb
app/controllers/dashboard_controller.rb
app/serializers/ordering_serializer.rb
app/serializers/dashboard_serializer.rb
app/views/ordering/show.html.haml
app/views/ordering/index.html.haml
app/views/ordering/_legacy_switch.html.haml
app/views/dashboard/show.html.haml
app/views/dashboard/_legacy_switch.html.haml
app/controllers/swap_controller.rb
app/serializers/swap_serializer.rb
app/assets/javascripts/swap_app.js
app/assets/stylesheets/swap_app.scss
app/assets/javascripts/ordering_app.js
app/assets/javascripts/dashboard_app.js
app/assets/stylesheets/ordering_app.scss
app/assets/stylesheets/dashboard_app.scss
public/vendor/vue.global.prod.min.js          (Vue 3.4.38, served as a static file)
app/views/ordering/_vue_runtime.html.haml       (script tag + start-up fallback)
doc/modern-ui.md
```

Existing files touched (all one-liners or route blocks):

```
config/routes.rb                          +8 lines: resources :ordering, resource :dashboard
app/assets/javascripts/application.js     +2 requires: ordering_app, dashboard_app
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

## Checking a production build locally

`./start-docker-prodcheck.sh` runs the app in `RAILS_ENV=production` from the
dev image (Ruby 2.6.6 like the server), precompiles assets with the production
Uglifier and serves on http://localhost:3001/f against the local database. Its
precompiled assets and tmp/ live in docker volumes, so the dev server keeps
compiling assets live. A precompile failure like the Uglifier ES6 error shows
up here before a deploy.

## Design decisions

1. **Vue is a static file, the apps ride in `application.js`.** Vue's global
   build is ES2016 and the production Uglifier (4.2, ES5 mode) aborts the
   precompile on it (`Unexpected token: name (t)`), so Vue is served from
   `public/vendor/` by the two modern views only, outside the compressed bundle.
   The apps themselves are plain ES5 and are required from `application.js`.
   Alternative if you prefer one bundle: `config.assets.js_compressor =
   Uglifier.new(harmony: true)` in production.rb, untested here.
1. **(superseded) Vue via sprockets, not a build pipeline.** The vendored Vue global build
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
