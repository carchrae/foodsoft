// Modern, mobile-first ordering page (Vue 3).
//
// Mounted on #ordering-app (app/views/ordering/show.html.haml). All data comes
// from the JSON endpoint in data-url (OrderingSerializer) and is saved back with
// a PUT to urls.save (OrderingController#update). Nothing here touches the
// classic ordering page; the two share nothing but the models on the server.
//
// Members opt in/out with localStorage[foodsoft.ui] = 'modern'|'legacy' (shared by all modern pages).
// The classic form redirects here when it says 'modern' (ordering/_legacy_switch).
(function () {
  'use strict';

  // one preference shared by every modern page
  var STORAGE_KEY = 'foodsoft.ui';
  var OLD_KEYS = ['foodsoft.ordering.ui', 'foodsoft.dashboard.ui'];

  function readUiPref() {
    try {
      return localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_KEYS[0]) || localStorage.getItem(OLD_KEYS[1]);
    } catch (e) { return null; }
  }

  function writeUiPref(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
      OLD_KEYS.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  // All user-facing strings in one place so they can be moved to I18n later.
  var T = {
    back: 'Orders',
    openOrders: 'Open orders',
    ordersCount: function (n) { return n + (n === 1 ? ' open order' : ' open orders'); },
    noOpenOrders: 'There are no open orders right now.',
    staleOrder: function (name) { return 'Someone else in your group saved the ' + name + ' order in the meantime.'; },
    help: 'How ordering works',
    closes: 'Order closes',
    pickup: 'Pickup',
    createdBy: 'Order created by',
    search: 'Search articles…',
    all: 'All',
    mine: 'My order',
    mineShort: 'Mine',
    needsFilling: 'Cases to fill',
    needsFillingShort: 'To fill',
    allCategories: 'Categories',
    noMatch: 'No articles match your search.',
    perUnit: 'per',
    caseOf: 'case of',
    deposit: 'deposit',
    inStock: 'in stock',
    filled: function (n) { var label = formatCases(n); return label + (n > 0 && n <= 1 ? ' case filled' : ' cases filled'); },
    shipsFraction: function (f) { return 'supplier ships ' + formatCases(f) + ' cases'; },
    noCase: 'no case yet',
    toFill: function (n) { return n + ' to fill'; },
    extra: function (n) { return n + ' extra'; },
    amount: 'Amount',
    atLeast: 'At least',
    upTo: 'Up to',
    outcomeAll: function (n) { return 'You get <b class="oa-ok">all ' + n + '</b>.'; },
    outcomeNone: function (missing, caseWord) { return 'You won\'t get any yet, we need <b class="oa-bad">' + missing + ' more</b> to fill ' + caseWord + '.'; },
    outcomePartial: function (got, want, waiting, missing, caseWord) { return 'You get <b class="oa-ok">' + got + '</b> of ' + want + ', we need <b class="oa-bad">' + missing + ' more</b> to fill ' + caseWord + ' for the other ' + waiting + '.'; },
    outcomeExtra: function (total, want, extra, caseWord) { return 'You get <b class="oa-ok">' + total + '</b>: your ' + want + ' plus <b class="oa-ok">' + extra + ' extra</b>. Thank you for helping to fill ' + caseWord + '!'; },
    outcomeRangeOnly: 'You only get these if we need them to fill a case.',
    outcomeRangeUsed: function (n, caseWord) { return 'You get <b class="oa-ok">' + n + '</b> from your range. Thank you for helping to fill ' + caseWord + '!'; },
    total: 'Total',
    upToTotal: 'up to',
    creditAfter: 'Credit after this order',
    balanceAfter: 'Balance after this order',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved',
    unsaved: 'Unsaved changes',
    savedToast: 'Your order was saved.',
    lowCredit: function (min) { return 'Not enough credit to place this order (minimum ' + min + ').'; },
    staleTitle: 'Someone else in your group saved this order in the meantime.',
    staleBody: 'Reload to see their changes. Your unsaved changes here will be lost.',
    reload: 'Reload',
    discard: 'Discard changes',
    loadError: 'Could not load the order. Your session may have expired.',
    saveError: 'Could not save the order. Please try again.',
    closed: 'This order is closed.',
    classic: 'Classic view',
    leaveWarning: 'You have unsaved changes to your order.',
    viewSummary: 'View order summary',
    cancelOrder: 'Cancel',
    creditShort: 'Credit',
    balanceShort: 'Balance',
    cancelTitle: 'Clear your whole order?',
    cancelBody: 'Every item goes back to zero and the change is saved straight away. ' +
      'Please avoid doing this at the last minute: other members need time to react and add more to fill the cases your order was part of. ' +
      'You can order again any time while the order is open.',
    cancelConfirm: 'Yes, clear my order',
    cancelUndo: 'Undo my unsaved changes',
    cancelKeep: 'Keep my order',
    items: function (n) { return n + (n === 1 ? ' item' : ' items'); },
    orderedSoFar: function (n) { return n === 1 ? '1 household has ordered so far' : n + ' households have ordered so far'; },
    helping: 'Helping fill cases',
    helpingShort: 'Filling cases',
    celebrate: 'Extra on every item. You are a legend!',
    helpingDetail: function (n, total) { return 'extra on ' + n + ' of ' + total + ' items'; },
    rangeDialogTitle: 'Could you be a little flexible?',
    rangeDialogBody: function (n, total) {
      return 'Filling cases only works when people are flexible. The supplier ships whole cases, and it is the "Up to" amounts that get a case over the line. ' +
        'Right now you have extra on ' + n + ' of your ' + total + ' items. ' +
        'If you can afford it and it won\'t go to waste, please raise "Up to" on a few more items before saving.';
    },
    rangeDialogAdd: 'Go back and add extra',
    rangeDialogSave: 'Continue and save',
    helpHtml:
      '<p><strong>You order a range, not a fixed number.</strong> ' +
      '<em>At least</em> is what you definitely want. <em>Up to</em> is the most you are willing to take. ' +
      'The difference is your <em>tolerance</em> and it is what lets the co-op fill whole cases.</p>' +
      '<p>When you first add an article we automatically set a small range for you. ' +
      'If you really only want the exact amount, lower <em>Up to</em> back down.</p>' +
      '<p><strong>Cases:</strong> the supplier only ships full cases. ' +
      '<span class="oa-chip warn">3 to fill</span> means 3 more are needed before a case ships. ' +
      '<span class="oa-chip ok">2 extra</span> means 2 units of someone\'s range are being used to fill a case; ' +
      'ordering them yourself means that member gets exactly what they asked for.</p>' +
      '<p>Under each item you ordered, a sentence says what you get if the order closed right now: ' +
      'numbers <span class="oa-ok">in green</span> are covered by a full case, numbers <span class="oa-bad">in red</span> are still waiting for one.</p>' +
      '<p><strong>Price:</strong> the total is for your <em>At least</em> amount. If part of your range is used you may pay up to the higher amount shown.</p>'
  };

  // ---- pure helpers -------------------------------------------------------

  function toInt(v, fallback) {
    var n = parseInt(v, 10);
    return isNaN(n) ? fallback : n;
  }

  function clamp(v, min, max) {
    if (min != null && v < min) v = min;
    if (max != null && v > max) v = max;
    return v;
  }

  // same maths as OrderArticle#calculate_units_to_order / ordering.js
  function calcUnits(unitSize, quantity, tolerance) {
    if (unitSize <= 0) return 0;
    var units = Math.floor(quantity / unitSize);
    var remainder = quantity % unitSize;
    return units + ((remainder > 0 && remainder + tolerance >= unitSize) ? 1 : 0);
  }

  // same maths as OrderArticle#_missing_units
  function calcMissing(unitSize, quantity, tolerance) {
    if (unitSize <= 0) return 0;
    var remainder = quantity % unitSize;
    var missing = remainder > 0 && remainder + tolerance < unitSize ? unitSize - remainder - tolerance : 0;
    return missing === unitSize ? 0 : missing;
  }

  // Everything the UI shows about one article, derived from the member's
  // (possibly unsaved) quantity/tolerance and everyone else's saved numbers.
  // Formats 1.5 as "1½", 0.333 as "⅓", 2 as "2".
  function formatCases(x) {
    var whole = Math.floor(x + 1e-9), frac = x - whole;
    var glyph = '';
    if (Math.abs(frac - 0.25) < 0.02) glyph = '¼';
    else if (Math.abs(frac - 1 / 3) < 0.02) glyph = '⅓';
    else if (Math.abs(frac - 0.5) < 0.02) glyph = '½';
    else if (Math.abs(frac - 2 / 3) < 0.02) glyph = '⅔';
    else if (Math.abs(frac - 0.75) < 0.02) glyph = '¾';
    else if (frac > 0.02) glyph = '.' + Math.round(frac * 10);
    if (whole === 0 && glyph) return glyph;
    return whole + glyph;
  }

  // Everything the UI shows about one article, derived from the member's
  // (possibly unsaved) quantity/tolerance and everyone else's saved numbers.
  //
  // A "splittable" article (cfg.splittable_cases and a.split_fraction set) can
  // ship as a fraction of a case: the partial case is treated as shipping once
  // wanted + extra reach the next fraction boundary that covers what is wanted.
  function derive(a, cfg) {
    var q = a.quantity, t = a.tolerance, unit = a.unit_quantity;
    var totalQ = a.others_quantity + q;
    var totalT = a.others_tolerance + t;
    var remainder = unit > 0 ? totalQ % unit : 0;
    var fullCases = unit > 0 ? Math.floor(totalQ / unit) : 0;
    var step = unit;
    if (cfg.splittable_cases && a.split_fraction && unit > 1) {
      step = Math.max(1, Math.round(unit * a.split_fraction));
    }

    var shipped, missing, progress = null, fractional = false, targetFraction = null, servedFraction = null;
    if (unit <= 1) {
      shipped = totalQ; missing = 0;
    } else if (remainder === 0) {
      shipped = totalQ; missing = 0; progress = fullCases > 0 ? 1 : 0;
    } else if (remainder + totalT >= unit) {
      // partial case completed with everyone's extra
      shipped = (fullCases + 1) * unit; missing = 0; progress = 1;
    } else if (step < unit) {
      // supplier ships split cases
      var have = remainder + totalT;
      if (have < step) {
        // below the split amount: work towards the split, e.g. a half case
        shipped = fullCases * unit;
        missing = step - have;
        progress = have / step;
        targetFraction = step / unit;
      } else {
        // over the split amount: the split ships, the rest works towards the full case
        var served = Math.floor(have / step) * step;
        shipped = fullCases * unit + served;
        missing = unit - have;
        progress = have / unit;
        fractional = true;
        servedFraction = served / unit;
      }
    } else {
      shipped = fullCases * unit;
      missing = unit - remainder - totalT;
      progress = (unit - missing) / unit;
    }

    var available = Math.max(0, shipped - a.others_quantity);
    var qUsed = Math.min(available, q);
    // never show less than what the group has already been allocated
    if (q >= a.used_quantity && qUsed < a.used_quantity) qUsed = a.used_quantity;
    var tUsed = 0;
    if (unit > 1) {
      var left = Math.max(0, available - qUsed - a.others_tolerance);
      tUsed = Math.min(left, t);
    }

    var price = a.price * (cfg.tolerance_is_costly ? q + t : q);
    var tolerancePrice = a.price * t;

    return {
      units: unit > 0 ? shipped / unit : 0,   // may be fractional for splittable articles
      fullCases: fullCases,
      partialShips: remainder > 0 && missing === 0,
      fractional: fractional,
      servedFraction: servedFraction,   // share of the case already shipping as a split, or null
      targetFraction: targetFraction,
      step: step,
      progress: progress,
      qUsed: qUsed,
      qUnused: q - qUsed,
      tUsed: tUsed,
      tUnused: t - tUsed,
      missing: missing,
      extra: Math.max(0, shipped - totalQ),
      price: price,
      tolerancePrice: tolerancePrice,
      maxPrice: cfg.tolerance_is_costly ? price : price + tolerancePrice
    };
  }

  function normalize(s) {
    return (s || '').toString().toLowerCase();
  }

  // ---- the component --------------------------------------------------------

  var OrderingApp = {
    props: {
      dataUrl: { type: String, required: true },
      celebrateUrl: { type: String, default: null }   // gif shown when every item has some extra
    },

    data: function () {
      return {
        state: 'loading',      // loading | ready | error | stale | closed
        errorMessage: null,
        orders: [],            // [{order, groupOrder, funds, urls, categories, dirty}] one per open order
        combined: false,       // true on /ordering (all open orders), false on /ordering/:id
        funds: null,           // combined funds (all open orders excluded) when combined
        cfg: {},
        urls: {},              // page-level urls (legacy, back)
        search: '',
        filter: 'all',         // all | mine | fill
        fillSnapshot: null,    // ids that needed filling when the filter was chosen
        category: '',
        showHelp: false,
        dirty: false,
        saving: false,
        toast: null,
        showRangeDialog: false,
        showCancelDialog: false,
        T: T
      };
    },

    computed: {
      // the single order on /ordering/:id, null on the combined page
      order: function () { return (!this.combined && this.orders.length === 1) ? this.orders[0].order : null; },
      groupOrder: function () { return (!this.combined && this.orders.length === 1) ? this.orders[0].groupOrder : null; },

      allArticles: function () {
        var out = [];
        this.orders.forEach(function (o) { o.categories.forEach(function (c) { c.articles.forEach(function (a) { out.push(a); }); }); });
        return out;
      },

      allStock: function () {
        return this.orders.length > 0 && this.orders.every(function (o) { return o.order.stockit; });
      },

      // category names across all orders, for the picker
      categoryOptions: function () {
        var counts = {}, names = [];
        this.orders.forEach(function (o) { o.categories.forEach(function (c) {
          if (counts[c.name] == null) { counts[c.name] = 0; names.push(c.name); }
          counts[c.name] += c.articles.length;
        }); });
        return names.map(function (n) { return { name: n, count: counts[n] }; });
      },

      // derived numbers for every article, keyed by id
      derived: function () {
        var cfg = this.cfg, map = {};
        this.allArticles.forEach(function (a) { map[a.id] = derive(a, cfg); });
        return map;
      },

      mineCount: function () {
        return this.allArticles.filter(function (a) { return a.quantity + a.tolerance > 0; }).length;
      },

      fillCount: function () {
        var d = this.derived;
        return this.allArticles.filter(function (a) { return d[a.id].missing > 0; }).length;
      },

      // articles in the member's order, an amount or just some extra
      orderedCount: function () {
        return this.allArticles.filter(function (a) { return a.quantity + a.tolerance > 0; }).length;
      },

      totalTolerance: function () {
        return this.allArticles.reduce(function (sum, a) { return sum + a.tolerance; }, 0);
      },

      rangePossible: function () {
        return this.allArticles.some(function (a) { return !a.stockit && a.quantity + a.tolerance > 0 && a.unit_quantity > 1; });
      },

      // share of ordered items (that can carry a range) with some extra on them
      helping: function () {
        var eligible = this.allArticles.filter(function (a) { return !a.stockit && a.quantity + a.tolerance > 0 && a.unit_quantity > 1; });
        if (this.allStock) return null;
        var withRange = eligible.filter(function (a) { return a.tolerance > 0; }).length;
        // always shown, an empty order simply reads 0%
        var pct = eligible.length ? Math.round(100 * withRange / eligible.length) : 0;
        return { count: withRange, total: eligible.length, pct: pct, level: pct >= 67 ? 'good' : (pct >= 34 ? 'some' : 'low') };
      },

      // [{order, categories: [{name, articles}]}] after search and filters
      rows: function () {
        var self = this, d = this.derived, needle = normalize(this.search);
        var out = [];
        this.orders.forEach(function (o) {
          var groups = [];
          o.categories.forEach(function (c) {
            if (self.category && c.name !== self.category) return;
            var articles = c.articles.filter(function (a) {
              if (self.filter === 'mine' && a.quantity + a.tolerance === 0) return false;
              if (self.filter === 'fill' && d[a.id].missing === 0 && !(self.fillSnapshot && self.fillSnapshot[a.id])) return false;
              if (needle) {
                var hay = normalize(a.name) + ' ' + normalize(a.manufacturer) + ' ' + normalize(a.origin) + ' ' + normalize(a.order_number);
                if (hay.indexOf(needle) === -1) return false;
              }
              return true;
            });
            if (articles.length) groups.push({ name: c.name, articles: articles });
          });
          if (groups.length) out.push({ order: o.order, categories: groups });
        });
        return out;
      },

      total: function () {
        var d = this.derived, sum = 0;
        this.allArticles.forEach(function (a) { sum += d[a.id].price; });
        return sum;
      },

      maxTotal: function () {
        var d = this.derived, sum = 0;
        this.allArticles.forEach(function (a) { sum += d[a.id].maxPrice; });
        return sum;
      },

      // single order: its available_funds already exclude that group order;
      // combined: funds excluding every open order, our totals cover them all
      baseFunds: function () {
        if (!this.funds) return null;
        if (this.cfg.charge_members_manually) return this.funds.account_balance;
        return this.combined ? this.funds.available_funds_without_open_orders : this.funds.available_funds;
      },

      newBalance: function () {
        return this.baseFunds == null ? null : this.baseFunds - this.total;
      },

      balanceOk: function () {
        return this.newBalance == null || this.newBalance >= (this.cfg.minimum_balance || 0);
      },

      // more than 5 items and extra on every one of them: party time
      celebrating: function () {
        return !!this.celebrateUrl && this.orderedCount > 5 && !!this.helping && this.helping.pct === 100;
      },

      canSave: function () {
        return this.state === 'ready' && this.dirty && !this.saving && this.balanceOk;
      }
    },

    created: function () {
      var self = this;
      this.load();
      // remember which items needed filling when the filter is chosen, so an
      // item the member just completed stays visible instead of vanishing
      this.$watch('filter', function (f) {
        if (f !== 'fill') { self.fillSnapshot = null; return; }
        self.fillSnapshot = self.snapshotFill();
      });
      window.addEventListener('beforeunload', function (e) {
        if (self.dirty && !self.saving) {
          e.preventDefault();
          e.returnValue = T.leaveWarning;
          return T.leaveWarning;
        }
      });
    },

    methods: {
      // ---- data -----------------------------------------------------------
      load: function () {
        var self = this;
        this.state = 'loading';
        fetch(this.dataUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { return self.parseResponse(r); })
          .then(function (json) { self.apply(json); self.dirty = false; self.state = 'ready'; })
          .catch(function (err) { self.fail(err); });
      },

      parseResponse: function (r) {
        var ct = r.headers.get('content-type') || '';
        if (ct.indexOf('json') === -1) throw { kind: 'notjson', status: r.status };
        return r.json().then(function (json) {
          if (!r.ok) throw { kind: 'api', status: r.status, body: json };
          return json;
        });
      },

      apply: function (json) {
        var self = this;
        this.combined = !!json.orders;
        var list = json.orders || [json];
        this.orders = list.map(function (snap) { return self.wrapOrder(snap); });
        this.cfg = json.config || {};
        this.funds = json.funds || null;
        this.urls = json.urls || {};
        this.fillSnapshot = this.filter === 'fill' ? this.snapshotFill() : null;
        var name = this.combined ? T.openOrders : (json.order && json.order.name);
        document.title = (name ? name + ' - ' : '') + document.title.replace(/^.* - /, '');
      },

      // one server snapshot -> reactive order entry; articles remember their order
      wrapOrder: function (snap) {
        var order = snap.order;
        (snap.categories || []).forEach(function (c) { c.articles.forEach(function (a) { a.order_id = order.id; a.stockit = !!order.stockit; }); });
        return { order: order, groupOrder: snap.group_order, funds: snap.funds, urls: snap.urls || {}, categories: snap.categories || [], dirty: false };
      },

      orderEntry: function (a) {
        for (var i = 0; i < this.orders.length; i++) if (this.orders[i].order.id === a.order_id) return this.orders[i];
        return null;
      },

      markDirty: function (a) {
        var o = this.orderEntry(a);
        if (o) o.dirty = true;
        this.dirty = true;
      },

      fail: function (err) {
        if (err && err.kind === 'api' && err.body && err.body.error === 'stale') {
          this.state = 'stale';
        } else if (err && err.kind === 'api' && err.body && err.body.error === 'closed') {
          this.state = 'closed';
          this.errorMessage = err.body.message || T.closed;
        } else {
          this.state = 'error';
          this.errorMessage = (err && err.body && err.body.message) || T.loadError;
        }
      },

      // Nag once before saving a bigger order with little flexibility; force skips it.
      save: function (force) {
        if (!this.canSave) return;
        // only when at least one ordered item can actually carry a range
        if (!force && this.orderedCount > 5 && this.rangePossible && this.helping && this.helping.pct < 50) {
          this.showRangeDialog = true;
          return;
        }
        this.showRangeDialog = false;
        var self = this;
        this.saving = true;
        var token = document.querySelector('meta[name="csrf-token"]');
        var pending = this.orders.filter(function (o) { return o.dirty; });
        if (!pending.length) pending = this.orders.slice();

        var saveOne = function (entry) {
          var articles = [];
          entry.categories.forEach(function (c) { c.articles.forEach(function (a) { articles.push({ id: a.id, quantity: a.quantity, tolerance: a.tolerance }); }); });
          return fetch(entry.urls.save, {
            method: 'PUT',
            credentials: 'same-origin',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRF-Token': token ? token.getAttribute('content') : ''
            },
            body: JSON.stringify({ lock_version: entry.groupOrder.lock_version, articles: articles })
          })
            .then(function (r) { return self.parseResponse(r); })
            .then(function (json) {
              // swap in the fresh snapshot for this order only
              var fresh = self.wrapOrder(json);
              var idx = self.orders.indexOf(entry);
              if (idx >= 0) self.orders.splice(idx, 1, fresh); else self.orders.push(fresh);
              if (!self.combined) { self.funds = json.funds; self.urls = json.urls || self.urls; }
              return json;
            })
            .catch(function (err) { err = err || {}; err.orderName = entry.order.name; throw err; });
        };

        var lastJson = null;
        pending.reduce(function (chain, entry) {
          return chain.then(function () { return saveOne(entry).then(function (json) { lastJson = json; }); });
        }, Promise.resolve())
          .then(function () {
            // credit changed on the server; refresh combined funds quietly
            if (self.combined) self.refreshFunds();
            self.dirty = false;
            self.saving = false;
            self.fillSnapshot = self.filter === 'fill' ? self.snapshotFill() : null;
            self.notify('ok', (lastJson && lastJson.notice) || T.savedToast);
          })
          .catch(function (err) {
            self.saving = false;
            if (err && err.kind === 'api' && err.body && err.body.error === 'stale') {
              self.state = 'stale';
              self.errorMessage = self.combined && err.orderName ? T.staleOrder(err.orderName) : null;
            } else if (err && err.kind === 'api' && err.body && err.body.error === 'closed') {
              self.state = 'closed';
              self.errorMessage = err.body.message || T.closed;
            } else {
              self.notify('error', (err && err.body && err.body.message) || T.saveError);
            }
          });
      },

      // combined page: re-read funds after saving without disturbing edits
      refreshFunds: function () {
        var self = this;
        fetch(this.dataUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { return self.parseResponse(r); })
          .then(function (json) { if (json.funds) self.funds = json.funds; })
          .catch(function () { /* keep what we have */ });
      },

      reload: function () {
        this.dirty = false;
        this.load();
      },

      // zero everything (respecting boxfill minimums) and save right away
      clearOrder: function () {
        var self = this;
        this.showCancelDialog = false;
        var toSave = false;
        this.orders.forEach(function (o) {
          o.categories.forEach(function (c) { c.articles.forEach(function (a) {
            a.quantity = a.min_quantity || 0;
            a.tolerance = a.min_tolerance || 0;
          }); });
          // only orders already on the server need a save to clear them
          o.dirty = !!(o.groupOrder && o.groupOrder.persisted);
          toSave = toSave || o.dirty;
        });
        this.dirty = toSave;
        if (toSave) this.$nextTick(function () { self.save(true); });
      },

      addExtra: function () {
        this.showRangeDialog = false;
        this.filter = 'mine';
        window.scrollTo(0, 0);
      },

      notify: function (type, text) {
        var self = this;
        this.toast = { type: type, text: text };
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () { self.toast = null; }, 4000);
      },

      switchToClassic: function () {
        writeUiPref('legacy');
        this.dirty = false;
        window.location.href = this.urls.legacy;
      },

      // ---- editing --------------------------------------------------------
      autoTolerance: function (a) {
        if (a.unit_quantity <= 1 || !(a.price > 0) || a.stockit) return 0;
        return Math.floor((this.cfg.auto_tolerance_value || 0) / a.price);
      },

      maxQuantity: function (a) {
        if (a.stockit) return a.quantity_available + a.used_quantity;
        return a.max_quantity == null ? null : a.max_quantity;
      },

      setQuantity: function (a, value) {
        var q = clamp(toInt(value, a.quantity), a.min_quantity || 0, this.maxQuantity(a));
        var auto = this.autoTolerance(a);
        // encourage a range: first amount gets a small tolerance for free,
        // removing the amount takes the automatic tolerance away again
        if (a.quantity === 0 && q > 0 && a.tolerance === 0) a.tolerance = Math.max(auto, a.min_tolerance || 0);
        if (a.quantity !== 0 && q === 0 && a.tolerance === auto) a.tolerance = a.min_tolerance || 0;
        a.quantity = q;
        this.markDirty(a);
      },

      setTolerance: function (a, value) {
        a.tolerance = Math.max(toInt(value, a.tolerance), a.min_tolerance || 0);
        this.markDirty(a);
      },

      // "Up to" is amount + tolerance; it can never be below the amount
      setMax: function (a, value) {
        var max = Math.max(toInt(value, a.quantity + a.tolerance), a.quantity);
        this.setTolerance(a, max - a.quantity);
      },

      snapshotFill: function () {
        var snap = {}, d = this.derived;
        this.allArticles.forEach(function (a) { if (d[a.id].missing > 0) snap[a.id] = true; });
        return snap;
      },

      // One bar per case behind the steppers: complete cases are green, the
      // partial case fills from faint red towards yellow. Capped so bars stay legible.
      caseBars: function (a, d) {
        if (d.progress == null || a.stockit) return [];
        var bars = [], full = d.fullCases, i;
        var hasPartial = d.progress != null && d.progress < 1 && d.progress > 0;
        var maxFull = hasPartial || d.partialShips ? 5 : 6;
        for (i = 0; i < Math.min(full, maxFull); i++) bars.push({ full: true, style: null });
        if (d.partialShips) {
          // partial case that ships (completed with extra, or as a supplier fraction)
          bars.push({ full: true, style: null });
        } else if (hasPartial) {
          var pct = Math.round(d.progress * 100), bg;
          if (d.servedFraction) {
            // green up to the shipping split, then the usual fill towards the full case
            var g = Math.round(d.servedFraction * 100);
            bg = 'linear-gradient(90deg, rgba(120, 183, 78, 0.30) 0%, rgba(120, 183, 78, 0.30) ' + g + '%, rgba(214, 72, 54, 0.16) ' + g + '%, rgba(236, 196, 48, 0.32) ' + pct + '%, transparent ' + pct + '%)';
          } else {
            bg = 'linear-gradient(90deg, rgba(214, 72, 54, 0.16) 0%, rgba(236, 196, 48, 0.32) ' + pct + '%, transparent ' + pct + '%)';
          }
          bars.push({ full: false, style: { backgroundImage: bg } });
        }
        if (bars.length === 0) bars.push({ full: false, style: null });
        return bars;
      },

      showsRange: function (a) {
        return a.unit_quantity > 1 && !a.stockit;
      },

      // ---- formatting -----------------------------------------------------
      money: function (v) {
        if (v == null || !isFinite(v)) return '—';
        var unit = this.cfg.currency_unit || '';
        if (window.I18n && typeof I18n.toCurrency === 'function') {
          return I18n.toCurrency(v, { unit: unit, precision: 2 });
        }
        return (v < 0 ? '-' : '') + unit + Math.abs(v).toFixed(2);
      },

      // One plain sentence about what the member would receive right now.
      // Only numbers are interpolated, so the HTML is safe.
      outcomeHtml: function (a, d) {
        var want = a.quantity, got = d.qUsed, waiting = d.qUnused, extra = d.tUsed;
        // "a case", or "a ½ case" when the supplier ships fractions and that is the target
        var filling = d.targetFraction ? 'a ' + formatCases(d.targetFraction) + ' case' : 'a case';
        var filled = d.fractional && d.units % 1 !== 0 ? 'the ' + formatCases(d.units % 1) + ' case' : 'the case';
        if (want === 0) return extra > 0 ? T.outcomeRangeUsed(extra, filled) : T.outcomeRangeOnly;
        if (extra > 0) return T.outcomeExtra(got + extra, want, extra, filled);
        if (waiting === 0) return T.outcomeAll(want);
        if (got === 0) return T.outcomeNone(d.missing, filling);
        return T.outcomePartial(got, want, waiting, d.missing, filling);
      },

      caseLabel: function (a, d) {
        if (a.unit_quantity <= 1) return null;
        return d.units > 0 ? T.filled(d.units) : T.noCase;
      },

      splitHint: function (a) {
        if (!this.cfg.splittable_cases || !a.split_fraction || a.unit_quantity <= 1 || a.stockit) return null;
        return T.shipsFraction(a.split_fraction);
      },

      articleClass: function (a, d) {
        return {
          'is-mine': a.quantity + a.tolerance > 0,
          'missing-few': d.missing === 1,
          'missing-many': d.missing > 1,
          'missing-none': d.missing === 0 && d.units > 0
        };
      }
    },

    template:
      '<div class="oa" :class="{ \'is-dirty\': dirty }">' +

      // ---- header ---------------------------------------------------------
      '  <header class="oa-head" v-if="order">' +
      '    <div class="oa-titlebar">' +
      '      <a class="oa-back" :href="urls.back">&lsaquo; {{ T.back }}</a>' +
      '      <h1 class="oa-title">{{ order.name }}</h1>' +
      '      <a href="#" class="oa-classic" @click.prevent="switchToClassic">{{ T.classic }}</a>' +
      '      <button type="button" class="oa-linkbtn" @click="showHelp = !showHelp" :aria-expanded="showHelp">?</button>' +
      '    </div>' +
      '    <p class="oa-meta">' +
      '      <span v-if="order.ends_human">{{ T.closes }} <strong>{{ order.ends_human }}</strong></span>' +
      '      <span v-if="order.pickup_human"> · {{ T.pickup }} {{ order.pickup_human }}</span>' +
      '      <span v-if="order.created_by"> · {{ T.createdBy }} {{ order.created_by }}</span>' +
      '    </p>' +
      '    <p class="oa-meta oa-households" v-if="order.ordergroups_ordered != null"><span class="oa-chip ok">{{ T.orderedSoFar(order.ordergroups_ordered) }}</span></p>' +
      '    <div class="oa-note" v-if="order.note">{{ order.note }}</div>' +
      '    <div class="oa-help" v-if="showHelp">' +
      '      <h3>{{ T.help }}</h3>' +
      '      <div v-html="T.helpHtml"></div>' +
      '    </div>' +
      '    <div class="oa-alert oa-alert-danger" v-if="!balanceOk">{{ T.lowCredit(money(cfg.minimum_balance || 0)) }}</div>' +
      '  </header>' +
      '  <header class="oa-head" v-else-if="combined && state === \'ready\'">' +
      '    <div class="oa-titlebar">' +
      '      <a class="oa-back" :href="urls.back">&lsaquo; {{ T.back }}</a>' +
      '      <h1 class="oa-title">{{ T.openOrders }}</h1>' +
      '      <a href="#" class="oa-classic" @click.prevent="switchToClassic">{{ T.classic }}</a>' +
      '      <button type="button" class="oa-linkbtn" @click="showHelp = !showHelp" :aria-expanded="showHelp">?</button>' +
      '    </div>' +
      '    <p class="oa-meta">{{ T.ordersCount(orders.length) }}<span v-for="o in orders" :key="o.order.id"> · <a :href="\'#order-\' + o.order.id">{{ o.order.name }}</a></span></p>' +
      '    <div class="oa-help" v-if="showHelp">' +
      '      <h3>{{ T.help }}</h3>' +
      '      <div v-html="T.helpHtml"></div>' +
      '    </div>' +
      '    <div class="oa-alert oa-alert-danger" v-if="!balanceOk">{{ T.lowCredit(money(cfg.minimum_balance || 0)) }}</div>' +
      '  </header>' +

      // ---- toolbar (sticky) -----------------------------------------------
      '  <div class="oa-toolbar" v-if="state === \'ready\'">' +
      '    <input class="oa-search" type="search" inputmode="search" autocomplete="off" :placeholder="T.search" v-model.trim="search">' +
      '    <div class="oa-filters">' +
      '      <div class="oa-chips" role="tablist">' +
      '        <button type="button" class="oa-chipbtn" :class="{ active: filter === \'all\' }" @click="filter = \'all\'">{{ T.all }}</button>' +
      '        <button type="button" class="oa-chipbtn" :class="{ active: filter === \'mine\' }" @click="filter = \'mine\'"><span class="oa-label-long">{{ T.mine }}</span><span class="oa-label-short">{{ T.mineShort }}</span> <b>{{ mineCount }}</b></button>' +
      '        <button type="button" class="oa-chipbtn" :class="{ active: filter === \'fill\' }" @click="filter = \'fill\'" v-if="!allStock"><span class="oa-label-long">{{ T.needsFilling }}</span><span class="oa-label-short">{{ T.needsFillingShort }}</span> <b>{{ fillCount }}</b></button>' +
      '      </div>' +
      '      <select class="oa-category-select" v-model="category" v-if="categoryOptions.length > 1">' +
      '        <option value="">{{ T.allCategories }}</option>' +
      '        <option v-for="c in categoryOptions" :key="c.name" :value="c.name">{{ c.name }} ({{ c.count }})</option>' +
      '      </select>' +
      '    </div>' +
      '  </div>' +

      // ---- states ---------------------------------------------------------
      '  <div class="oa-state" v-if="state === \'loading\'"><span class="oa-spinner"></span></div>' +
      '  <div class="oa-state" v-else-if="state === \'error\' || state === \'closed\'">' +
      '    <div class="oa-alert oa-alert-danger">{{ errorMessage }}</div>' +
      '    <p><button type="button" class="oa-btn" @click="reload">{{ T.reload }}</button> ' +
      '       <a class="oa-btn oa-btn-plain" :href="urls.back || \'#\'">{{ T.back }}</a></p>' +
      '  </div>' +
      '  <div class="oa-state" v-else-if="state === \'stale\'">' +
      '    <div class="oa-alert oa-alert-warning"><strong>{{ errorMessage || T.staleTitle }}</strong><br>{{ T.staleBody }}</div>' +
      '    <p><button type="button" class="oa-btn oa-btn-primary" @click="reload">{{ T.reload }}</button></p>' +
      '  </div>' +

      // ---- article list ---------------------------------------------------
      '  <main class="oa-list" v-else>' +
      '    <template v-for="og in rows" :key="og.order.id">' +
      '    <section class="oa-order-head" v-if="combined" :id="\'order-\' + og.order.id">' +
      '      <h2>{{ og.order.name }}</h2>' +
      '      <p class="oa-meta">' +
      '        <span v-if="og.order.ends_human">{{ T.closes }} <strong>{{ og.order.ends_human }}</strong></span>' +
      '        <span v-if="og.order.pickup_human"> · {{ T.pickup }} {{ og.order.pickup_human }}</span>' +
      '        <span class="oa-chip ok" v-if="og.order.ordergroups_ordered != null">{{ T.orderedSoFar(og.order.ordergroups_ordered) }}</span>' +
      '      </p>' +
      '      <div class="oa-note" v-if="og.order.note">{{ og.order.note }}</div>' +
      '    </section>' +
      '    <section class="oa-category" v-for="group in og.categories" :key="og.order.id + \'-\' + group.name">' +
      '      <h2 class="oa-category-title">{{ group.name }} <small>{{ group.articles.length }}</small></h2>' +
      '      <article class="oa-article" v-for="a in group.articles" :key="a.id" :class="articleClass(a, derived[a.id])">' +
      '        <div class="oa-article-main">' +
      '          <div class="oa-article-info">' +
      '            <div class="oa-article-name">{{ a.name }}<small v-if="a.origin"> ({{ a.origin }})</small></div>' +
      '            <div class="oa-article-sub">' +
      '              <span v-if="a.manufacturer">{{ a.manufacturer }}</span>' +
      '              <span v-if="a.supplier">{{ a.supplier }}</span>' +
      '              <span v-if="a.unit_quantity > 1">{{ T.caseOf }} {{ a.unit_quantity }}</span>' +
      '              <span v-if="a.deposit > 0">{{ money(a.deposit) }} {{ T.deposit }}</span>' +
      '              <span v-if="a.stockit">{{ a.quantity_available }} {{ T.inStock }}</span>' +
      '            </div>' +
      '            <div class="oa-article-note" v-if="a.note">{{ a.note }}</div>' +
      '          </div>' +
      '          <div class="oa-article-aside">' +
      '            <div class="oa-article-price">{{ money(a.price) }} <span class="oa-per">{{ T.perUnit }} {{ a.unit }}</span></div>' +
      '            <div class="oa-status" v-if="!a.stockit && a.unit_quantity > 1">' +
      '              <span class="oa-chip" :class="derived[a.id].units > 0 && derived[a.id].extra === 0 ? \'ok\' : (derived[a.id].units > 0 ? \'warn\' : \'muted\')">{{ caseLabel(a, derived[a.id]) }}</span>' +
      '              <span class="oa-chip warn" v-if="derived[a.id].missing > 0">{{ T.toFill(derived[a.id].missing) }}</span>' +
      '              <span class="oa-chip ok" v-if="derived[a.id].extra > 0">{{ T.extra(derived[a.id].extra) }}</span>' +
      '            </div>' +
      '          </div>' +
      '        </div>' +

      '        <div class="oa-article-side">' +
      '          <div class="oa-controls" :class="{ \'has-progress\': derived[a.id].progress != null }">' +
      '            <div class="oa-cases" aria-hidden="true"><div class="oa-case" v-for="(c, i) in caseBars(a, derived[a.id])" :key="i" :class="c.full ? \'full\' : \'partial\'" :style="c.style"></div></div>' +
      '            <div class="oa-stepper">' +
      '              <label :for="\'q_\' + a.id">{{ showsRange(a) ? T.atLeast : T.amount }} <span class="oa-units" v-if="a.quantity > 1">{{ a.quantity }}&times;{{ a.unit }}</span></label>' +
      '              <div class="oa-stepper-row">' +
      '                <button type="button" class="oa-step" aria-label="less" :disabled="a.quantity <= (a.min_quantity || 0)" @click="setQuantity(a, a.quantity - 1)">&minus;</button>' +
      '                <input :id="\'q_\' + a.id" class="oa-num" type="number" inputmode="numeric" pattern="[0-9]*" :min="a.min_quantity || 0" :max="maxQuantity(a)" :value="a.quantity" @change="setQuantity(a, $event.target.value)" @keydown.enter.prevent="$event.target.blur()">' +
      '                <button type="button" class="oa-step" aria-label="more" :disabled="maxQuantity(a) != null && a.quantity >= maxQuantity(a)" @click="setQuantity(a, a.quantity + 1)">+</button>' +
      '              </div>' +
      '              <div class="oa-stepper-price" :class="{ \'is-zero\': a.quantity === 0 }">{{ money(a.price * a.quantity) }}</div>' +
      '            </div>' +
      '            <div class="oa-stepper" v-if="showsRange(a)">' +
      '              <label :for="\'m_\' + a.id">{{ T.upTo }} <span class="oa-units" v-if="a.quantity + a.tolerance > 1">{{ a.quantity + a.tolerance }}&times;{{ a.unit }}</span></label>' +
      '              <div class="oa-stepper-row">' +
      '                <button type="button" class="oa-step" aria-label="less" :disabled="a.tolerance <= (a.min_tolerance || 0)" @click="setTolerance(a, a.tolerance - 1)">&minus;</button>' +
      '                <input :id="\'m_\' + a.id" class="oa-num" type="number" inputmode="numeric" pattern="[0-9]*" :min="a.quantity + (a.min_tolerance || 0)" :value="a.quantity + a.tolerance" @change="setMax(a, $event.target.value)" @keydown.enter.prevent="$event.target.blur()">' +
      '                <button type="button" class="oa-step" aria-label="more" @click="setTolerance(a, a.tolerance + 1)">+</button>' +
      '              </div>' +
      '              <div class="oa-stepper-price" :class="{ \'is-zero\': a.quantity + a.tolerance === 0 }">{{ money(a.price * (a.quantity + a.tolerance)) }}</div>' +
      '            </div>' +
      '          </div>' +
      '          <div class="oa-line" :class="{ \'is-empty\': a.quantity + a.tolerance === 0 }">' +
      '            <div class="oa-outcome" v-if="a.quantity + a.tolerance > 0" v-html="outcomeHtml(a, derived[a.id])"></div>' +
      '          </div>' +
      '        </div>' +
      '      </article>' +
      '    </section>' +
      '    </template>' +
      '    <p class="oa-empty" v-if="rows.length === 0">{{ orders.length ? T.noMatch : T.noOpenOrders }}</p>' +
      '  </main>' +

      // ---- footer (fixed) -------------------------------------------------
      '  <footer class="oa-footer" v-if="state === \'ready\'">' +
      '    <button type="button" class="oa-btn oa-btn-plain oa-cancel" v-if="mineCount > 0 || (groupOrder && groupOrder.persisted)" :disabled="saving" @click="showCancelDialog = true">{{ T.cancelOrder }}</button>' +
      '    <div class="oa-totals">' +
      '      <div class="oa-total">' +
      '        <span class="oa-label">{{ T.total }} · {{ T.items(mineCount) }}</span>' +
      '        <strong>{{ money(total) }}</strong>' +
      '        <small v-if="maxTotal > total">{{ T.upToTotal }} {{ money(maxTotal) }}</small>' +
      '      </div>' +
      '      <div class="oa-balance" :class="balanceOk ? \'ok\' : \'bad\'" v-if="newBalance != null">' +
      '        <span class="oa-label oa-label-long">{{ cfg.charge_members_manually ? T.balanceAfter : T.creditAfter }}</span>' +
      '        <span class="oa-label oa-label-short">{{ cfg.charge_members_manually ? T.balanceShort : T.creditShort }}</span>' +
      '        <strong>{{ money(newBalance) }}</strong>' +
      '      </div>' +
      '      <div class="oa-gauge-wrap" v-if="helping" :class="{ celebrating: celebrating }" :title="celebrating ? T.celebrate : T.helpingDetail(helping.count, helping.total)">' +
      '        <img class="oa-party" v-if="celebrating" :src="celebrateUrl" :alt="T.celebrate">' +
      '        <div class="oa-gauge" :class="helping.level">' +
      '          <span class="oa-label oa-label-long">{{ T.helping }}</span>' +
      '          <span class="oa-label oa-label-short">{{ T.helpingShort }}</span>' +
      '          <div class="oa-gauge-row"><div class="oa-gauge-bar"><div class="oa-gauge-fill" :style="{ width: helping.pct + \'%\' }"></div></div><strong>{{ helping.pct }}%</strong></div>' +
      '          <small>{{ T.helpingDetail(helping.count, helping.total) }}</small>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="oa-actions">' +
      '      <button type="button" class="oa-btn oa-btn-primary oa-save" :disabled="!canSave" @click="save()">' +
      '        <span v-if="saving">{{ T.saving }}</span><span v-else-if="dirty">{{ T.save }}</span><span v-else>{{ T.saved }}</span>' +
      '      </button>' +
      '    </div>' +
      '  </footer>' +

      '  <div class="oa-toast" :class="toast.type" v-if="toast" @click="toast = null">{{ toast.text }}</div>' +

      '  <div class="oa-modal-backdrop" v-if="showRangeDialog" @click.self="showRangeDialog = false">' +
      '    <div class="oa-modal" role="dialog" aria-modal="true" aria-labelledby="oa-range-title">' +
      '      <h3 id="oa-range-title">{{ T.rangeDialogTitle }}</h3>' +
      '      <p>{{ T.rangeDialogBody(helping ? helping.count : 0, helping ? helping.total : 0) }}</p>' +
      '      <div class="oa-modal-actions">' +
      '        <button type="button" class="oa-btn oa-btn-primary" @click="addExtra">{{ T.rangeDialogAdd }}</button>' +
      '        <button type="button" class="oa-btn" @click="save(true)">{{ T.rangeDialogSave }}</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      '  <div class="oa-modal-backdrop" v-if="showCancelDialog" @click.self="showCancelDialog = false">' +
      '    <div class="oa-modal" role="dialog" aria-modal="true" aria-labelledby="oa-cancel-title">' +
      '      <h3 id="oa-cancel-title">{{ T.cancelTitle }}</h3>' +
      '      <p>{{ T.cancelBody }}</p>' +
      '      <div class="oa-modal-actions">' +
      '        <button type="button" class="oa-btn oa-btn-danger" @click="clearOrder">{{ T.cancelConfirm }}</button>' +
      '        <button type="button" class="oa-btn" v-if="dirty" @click="showCancelDialog = false; reload()">{{ T.cancelUndo }}</button>' +
      '        <button type="button" class="oa-btn" @click="showCancelDialog = false">{{ T.cancelKeep }}</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
  };

  // ---- boot -------------------------------------------------------------------

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    // opt-in/out links anywhere in the app: <a data-fs-ui="modern|legacy" href=...>
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('[data-fs-ui]') : null;
      if (!link) return;
      writeUiPref(link.getAttribute('data-fs-ui'));
    });

    var el = document.getElementById('ordering-app');
    if (!el) return;
    if (!window.Vue) {
      el.innerHTML = '<div class="alert alert-danger">Vue failed to load.</div>';
      return;
    }
    writeUiPref('modern');
    var app = Vue.createApp(OrderingApp, { dataUrl: el.getAttribute('data-url'), celebrateUrl: el.getAttribute('data-celebrate') });
    // surface unexpected errors instead of a silently blank page
    app.config.errorHandler = function (err, vm, info) {
      if (window.console) console.error('ordering app error', info, err);
      var box = document.createElement('div');
      box.className = 'alert alert-danger';
      box.textContent = 'Something went wrong on this page (' + (err && err.message ? err.message : err) + ').';
      if (!el.querySelector('.alert-danger')) el.insertBefore(box, el.firstChild);
    };
    app.mount(el);
    window.FoodsoftOrderingApp = OrderingApp;
  });
})();
