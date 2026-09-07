// Modern "copy order" page (Vue 3): create a new order from an earlier one
// while seeing what demand every article had, so the coordinator can decide
// what to include. Plain ES5 on purpose (the production Uglifier is ES5 only).
//
// Mounted on #order-copy-app (app/views/order_copy/show.html.haml). The JSON at
// data-url (OrderCopySerializer) carries the copied order and its demand, the
// supplier's available articles with a short demand history, and the defaults
// for the new order. Creating POSTs to OrderCopyController#create.
(function () {
  'use strict';

  var M = window.FoodsoftArticleMatch;
  var SUGGESTIONS = 3;      // under an article that can no longer be ordered
  var ALTERNATIVES = 3;     // visible beside a last-time article (selected ones always show)
  var ALT_POOL = 30;        // candidates kept per article for the "show more" dialog

  function fmtUnits(n) { return Math.abs(n - Math.round(n)) < 0.005 ? String(Math.round(n)) : n.toFixed(1); }

  var T = {
    title: function (name) { return 'New order from ' + name; },
    back: 'All orders',
    classic: 'Classic copy',
    intro: 'Tick the articles for the new order. Each one shows what happened last time so you can keep what people want and drop what nobody ordered.',
    lastOrder: 'The order being copied',
    viewSource: 'View',
    closes: 'Closed',
    pickup: 'Pickup',
    households: function (n) { return n + (n === 1 ? ' household' : ' households'); },
    articlesSummary: function (all, demand, none) { return all + ' articles: ' + demand + ' with demand, ' + none + ' nobody ordered'; },
    total: 'Total',
    details: 'Order details',
    starts: 'Opens',
    boxfill: 'Boxfill from',
    ends: 'Closes',
    pickupDate: 'Pickup date',
    endAction: 'When it closes',
    note: 'Note for members',
    supplierNote: 'Instructions for the supplier',
    search: 'Search name or code…',
    all: 'All',
    withDemand: 'Had demand',
    noDemand: 'Nobody ordered',
    newOnes: 'Not in last order',
    allCategories: 'All categories',
    sortDemand: 'Most wanted first',
    sortName: 'By name',
    select: 'Select:',
    selLast: 'as last order',
    selDemand: 'only with demand',
    selAll: 'all',
    selNone: 'none',
    selShown: 'all shown',
    unselShown: 'none shown',
    nothing: 'No articles match.',
    newChip: 'new',
    noneChip: 'nobody ordered',
    notOffered: 'not in last order',
    wanted: function (q, extra) { return 'wanted ' + q + (extra ? ' (+' + extra + ' extra)' : ''); },
    cases: function (n, size) { return fmtUnits(n) + (Math.abs(n - 1) < 0.005 ? ' case' : ' cases') + (size > 1 ? ' of ' + size : ''); },
    shortOf: function (n) { return n + ' short of a case'; },
    noCase: 'no case filled',
    delivered: function (n) { return n + ' delivered'; },
    received: function (n) { return n + ' received'; },
    history: function (ordered, offered, total) { return 'in ' + offered + ' of the last ' + total + (total === 1 ? ' order' : ' orders') + ', wanted in ' + ordered; },
    avg: function (n) { return 'avg ' + n + ' households'; },
    stock: function (n, unit) { return n + ' × ' + unit + ' in stock'; },
    prices: 'net / coop / supplier',
    noSuggestion: 'nothing similar is available',
    add: 'add',
    added: 'added',
    match: function (p) { return p + '%'; },
    selected: function (n) { return n + ' selected'; },
    selectedDetail: function (demand, none, fresh) {
      var p = [];
      if (demand) p.push(demand + ' with demand');
      if (none) p.push(none + ' nobody ordered');
      if (fresh) p.push(fresh + ' new');
      return p.join(' · ');
    },
    create: 'Create order',
    creating: 'Creating…',
    created: 'The order has been created.',
    loadError: 'Could not load the order. Your session may have expired.',
    saveError: 'Creating the order failed. Please try again.',
    reload: 'Reload',
    leave: 'The order has not been created yet. Leave anyway?',
    fix: 'Please fix the following:',
    priceUp: function (pct, prev, when) { return pct + '% more than last time (' + prev + ', ' + when + ')'; },
    priceDown: function (pct, prev, when) { return pct + '% less than last time (' + prev + ', ' + when + ')'; },
    priceSame: function (prev, when) { return 'same as last time (' + when + ')'; },
    priceNoPrev: function (n) { return 'seen ' + n + (n === 1 ? ' price' : ' prices') + ' before'; },
    priceRange: function (low, high) { return 'last year ' + low + ' – ' + high; },
    priceHistory: 'Price history',
    priceHistoryLink: 'price history ›',
    lastTimeTitle: function (n) { return 'Articles you ordered last time and their alternatives'; },
    tabLast: 'Last time & alternatives',
    tabAll: 'All available articles',
    lastTimeHint: function (gone) { return 'The article as ordered last time, then similar available articles; the price difference is for the same amount. Tap to add or remove, "replace" swaps it for the last-time article.' + (gone ? ' ' + gone + (gone === 1 ? ' article' : ' articles') + ' can no longer be ordered (greyed) and will not be pre-selected.' : ''); },
    gone: 'no longer available',
    lastTime: 'last time',
    remove: 'remove',
    replace: '⇄ replace',
    showMore: function (n) { return 'show ' + n + ' more…'; },
    moreTitle: function (name) { return 'More alternatives for ' + name; },
    moreSearch: 'Search all articles…',
    moreNothing: 'No article matches.',
    clear: 'Clear',
    alternativesLabel: 'Alternatives',
    unitsDiffer: 'units differ',
    cheaperBy: function (d) { return d + ' cheaper'; },
    dearerBy: function (d) { return d + ' more'; },
    samePrice: 'same price',
    priceNow: 'Now',
    priceLast: 'Last time',
    priceLow: 'Low (12 months)',
    priceHigh: 'High (12 months)',
    priceAvg: 'Average (12 months)',
    priceHint: 'Prices of this article and every earlier listing with the same name (the catalogue gets a new entry at each sync). Net price per unit.',
    priceEmpty: 'No earlier prices are known for this article.',
    colDate: 'Date',
    colPrice: 'Price',
    colChange: 'Change',
    colPack: 'Pack',
    colOrders: 'Orders',
    currentRow: 'current',
    deletedRow: 'old listing',
    otherUnit: 'other unit',
    close: 'Close',
    loadingPrices: 'Loading prices…',
    needEnds: 'Please set when the order closes.',
    needPickup: 'Please set the pickup date.',
    notSet: 'not set'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
  }

  // textareas grow with their content instead of scrolling
  function grow(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }

  // One alternative as a tappable card: score, name, pack/grower/origin/price and
  // the difference, then the same price details as the article cards (coop and
  // supplier price, "N% more than last time" chip opening the history dialog,
  // and the six-order history line). Used in the last-time rows and the dialog.
  var AltCard = {
    props: {
      s: { type: Object, required: true },        // { a, score, delta, comparable, sameUnit }
      selected: { type: Boolean, default: false },
      replaceable: { type: Boolean, default: false },
      money: { type: Function, required: true },
      priceChip: { type: Function, required: true },
      historyText: { type: Function, required: true },
      deltaChip: { type: Function, required: true }
    },
    emits: ['toggle', 'replace', 'prices'],
    data: function () { return { T: T }; },
    methods: { tint: M.tint, ink: M.ink },
    template:
      '<div class="oc-suggestion" role="button" tabindex="0" :class="{ selected: selected }" :style="{ background: tint(s.score), color: ink(s.score), borderColor: ink(s.score) }" @click="$emit(\'toggle\')" @keydown.enter.prevent="$emit(\'toggle\')" :title="s.a.name">' +
      '  <span class="oc-sug-name"><b>{{ T.match(Math.round(s.score * 100)) }}</b> {{ s.a.name }}</span>' +
      '  <small>{{ [s.a.unit_quantity + \'×\' + s.a.unit, s.a.manufacturer, s.a.origin].filter(Boolean).join(\' · \') }}</small>' +
      '  <button type="button" class="oc-pricebox" @click.stop.prevent="$emit(\'prices\')" :title="T.priceHistory">' +
      '    <small class="oc-sug-prices"><strong>{{ money(s.a.price) }}</strong> · {{ money(s.a.fc_price) }} · {{ money(s.a.supplier_price) }} · <em :class="deltaChip(s).kind">{{ deltaChip(s).text }}</em></small>' +
      '    <span class="oc-pricechip" v-if="priceChip(s.a)" :class="priceChip(s.a).kind">{{ priceChip(s.a).text }}</span>' +
      '    <span class="oc-pricelink">{{ T.priceHistoryLink }}</span>' +
      '  </button>' +
      '  <small class="oc-sug-hist" v-if="s.a.history && s.a.history.offered">{{ historyText(s.a) }}</small>' +
      '  <i>{{ selected ? \'✓ \' + T.added : \'+ \' + T.add }}<span class="oc-replace" v-if="replaceable && !selected" @click.stop="$emit(\'replace\')">{{ T.replace }}</span></i>' +
      '</div>'
  };

  var OrderCopyApp = {
    components: { 'oc-alt': AltCard },
    directives: {
      autogrow: {
        mounted: function (el) { grow(el); el.addEventListener('input', function () { grow(el); }); },
        updated: function (el) { grow(el); }
      }
    },
    props: { dataUrl: { type: String, required: true } },

    data: function () {
      return {
        state: 'loading',
        errorMessage: null,
        d: null,
        form: {},
        selected: {},       // article id -> true
        filter: 'all',      // all | demand | nodemand | new
        category: '',
        query: '',
        sort: 'name',       // name | demand (within a category)
        detailsOpen: true,
        tab: 'last',        // last | all
        saving: false,
        errors: [],
        toast: null,
        priceDialog: null,   // { article, loading, data, error } while the history dialog is open
        altDialog: null,     // { a, list } while the "more alternatives" dialog is open
        altQuery: '',        // search in that dialog: empty shows the namesakes, text searches everything
        T: T
      };
    },

    computed: {
      cfg: function () { return (this.d && this.d.config) || {}; },
      articles: function () {
        var out = [];
        if (!this.d) return out;
        this.d.categories.forEach(function (c) {
          c.articles.forEach(function (a) { out.push(a); });
        });
        return out;
      },
      selectedList: function () {
        var sel = this.selected;
        return this.articles.filter(function (a) { return sel[a.id]; });
      },
      selectedStats: function () {
        var s = { total: 0, demand: 0, none: 0, fresh: 0 };
        this.selectedList.forEach(function (a) {
          s.total++;
          if (!a.in_source) s.fresh++; else if (a.demand.households > 0) s.demand++; else s.none++;
        });
        return s;
      },
      counts: function () {
        var c = { all: 0, demand: 0, nodemand: 0, fresh: 0 };
        this.articles.forEach(function (a) {
          c.all++;
          if (!a.in_source) c.fresh++; else if (a.demand.households > 0) c.demand++; else c.nodemand++;
        });
        return c;
      },
      // categories with only the articles that pass the filters, sorted
      visibleCategories: function () {
        var self = this, q = this.query.trim().toLowerCase();
        if (!this.d) return [];
        return this.d.categories.map(function (c) {
          if (self.category && c.name !== self.category) return null;
          var list = c.articles.filter(function (a) { return self.passes(a, q); });
          if (!list.length) return null;
          list = list.slice().sort(function (x, y) {
            if (self.sort === 'demand') {
              var dx = self.demandRank(x), dy = self.demandRank(y);
              if (dx !== dy) return dy - dx;
            }
            return x.name.localeCompare(y.name);
          });
          return { name: c.name, articles: list };
        }).filter(Boolean).sort(function (x, y) { return x.name.localeCompare(y.name); });
      },
      visibleArticles: function () {
        var out = [];
        this.visibleCategories.forEach(function (c) { c.articles.forEach(function (a) { out.push(a); }); });
        return out;
      },
      canCreate: function () { return this.selectedStats.total > 0 && !this.saving; },

      // articles of the copied order that are still available, most wanted first,
      // each with its alternatives (only those that have any)
      lastTimeWithAlternatives: function () {
        var self = this, sel = this.selected;
        if (!this.d) return [];
        var rows = this.articles.filter(function (a) { return a.in_source; }).map(function (a) { return { a: a, available: true }; });
        this.d.unavailable.forEach(function (u) { rows.push({ a: u, available: false }); });
        return rows.sort(function (x, y) { return x.a.name.localeCompare(y.a.name); })
          .map(function (r) {
            var pool = self.alternativesFor(r.a);
            // chosen alternatives always stay visible; the rest fill up to the usual three
            var chosen = pool.filter(function (s) { return sel[s.a.id]; });
            var others = pool.filter(function (s) { return !sel[s.a.id]; });
            var visible = chosen.concat(others).slice(0, Math.max(ALTERNATIVES, chosen.length));
            return { a: r.a, available: r.available, suggestions: visible, more: pool.length - visible.length };
          });
      },

      // available articles by product word ("apple", "pepper"), so alternatives are
      // found among a few dozen namesakes instead of the whole catalogue
      productGroups: function () {
        var groups = {};
        this.articles.forEach(function (a) {
          var key = M.stem(M.firstWord(a.name));
          (groups[key] = groups[key] || []).push(a);
        });
        return groups;
      },

      // unavailable articles with the best available matches (same product word,
      // scored like the swap page), best first
      goneCount: function () { return this.d ? this.d.unavailable.length : 0; }
    },

    created: function () {
      var self = this;
      this.load();
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { self.priceDialog = null; self.altDialog = null; } });
      window.addEventListener('beforeunload', function (e) {
        if (self.state !== 'ready' || self.saving || self._created) return;
        e.preventDefault();
        e.returnValue = T.leave;
        return T.leave;
      });
    },

    methods: {
      load: function () {
        var self = this;
        this.state = 'loading';
        fetch(this.dataUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) {
            if ((r.headers.get('content-type') || '').indexOf('json') === -1) throw new Error('notjson');
            return r.json();
          })
          .then(function (json) { self.apply(json); self.state = 'ready'; })
          .catch(function () { self.state = 'error'; self.errorMessage = T.loadError; });
      },

      apply: function (json) {
        this.d = json;
        this.form = {
          starts: json.defaults.starts || '',
          ends: json.defaults.ends || '',
          boxfill: json.defaults.boxfill || '',
          pickup: json.defaults.pickup || '',
          end_action: json.defaults.end_action || 'no_end_action',
          note: json.defaults.note || '',
          supplier_note: json.defaults.supplier_note || ''
        };
        this.selectAs('last');
        if (window.innerWidth < 768) this.detailsOpen = false;
      },

      passes: function (a, q) {
        if (this.filter === 'demand' && !(a.in_source && a.demand.households > 0)) return false;
        if (this.filter === 'nodemand' && !(a.in_source && a.demand.households === 0)) return false;
        if (this.filter === 'new' && a.in_source) return false;
        if (q) {
          var hay = (a.name + ' ' + a.order_number + ' ' + a.origin + ' ' + a.manufacturer + ' ' + a.note).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      },

      // households last time, then average over recent orders; new articles last
      demandRank: function (a) {
        if (a.in_source) return 1000 + a.demand.households * 10 + (a.demand.units_to_order > 0 ? 5 : 0);
        return a.history ? a.history.avg_households : 0;
      },

      // none | partial | filled | new
      kind: function (a) {
        if (!a.in_source) return 'new';
        if (a.demand.households === 0) return 'none';
        return a.demand.units_to_order > 0 ? 'filled' : 'partial';
      },

      // one line of what happened last time
      demandLine: function (a) {
        var d = a.demand, parts = [];
        if (!d) return [];
        if (d.households === 0) return [{ text: T.noneChip, kind: 'muted' }];
        parts.push({ text: T.households(d.households), kind: 'strong' });
        parts.push({ text: T.wanted(d.wanted, d.extra), kind: '' });
        if (d.units_to_order > 0) parts.push({ text: T.cases(d.units_to_order, d.unit_size), kind: 'ok' });
        else parts.push({ text: T.noCase, kind: 'warn' });
        if (d.missing_units > 0) parts.push({ text: T.shortOf(d.missing_units), kind: 'warn' });
        if (d.units_received != null && d.units_received !== d.units_to_order) parts.push({ text: T.received(fmtUnits(d.units_received)), kind: 'info' });
        if (d.delivered > 0) parts.push({ text: T.delivered(fmtUnits(d.delivered)), kind: 'info' });
        return parts;
      },

      // 0..100 fill of the last case, for the small bar
      fillPercent: function (a) {
        var d = a.demand;
        if (!d || !d.unit_size) return 0;
        var have = (d.wanted % d.unit_size) + d.extra;
        if (d.units_to_order > 0 && d.missing_units === 0) return 100;
        return Math.min(100, Math.round(have / d.unit_size * 100));
      },

      historyBars: function (a) {
        if (!a.history) return [];
        var max = 1;
        a.history.households.forEach(function (n) { if (n != null && n > max) max = n; });
        return a.history.households.map(function (n) {
          return { height: n == null ? 0 : Math.max(8, Math.round(n / max * 100)), missing: n == null, n: n };
        }).reverse(); // oldest left, newest right
      },

      toggle: function (a) { this.selected[a.id] = !this.selected[a.id]; },

      categorySelected: function (c) {
        var sel = this.selected;
        return c.articles.every(function (a) { return sel[a.id]; });
      },
      toggleCategory: function (c) {
        var on = !this.categorySelected(c), sel = this.selected;
        c.articles.forEach(function (a) { sel[a.id] = on; });
      },

      // last | demand | all | none | shown | unshown
      selectAs: function (mode) {
        var sel = {}, self = this;
        if (mode === 'shown' || mode === 'unshown') {
          sel = this.selected;
          this.visibleArticles.forEach(function (a) { sel[a.id] = (mode === 'shown'); });
          return;
        }
        this.articles.forEach(function (a) {
          if (mode === 'last') sel[a.id] = a.in_source;
          else if (mode === 'demand') sel[a.id] = a.in_source && a.demand.households > 0;
          else if (mode === 'all') sel[a.id] = true;
          else sel[a.id] = false;
        });
        this.selected = sel;
      },

      money: function (v) { return money(v, this.cfg.currency_unit); },
      fmtUnits: fmtUnits,

      historyText: function (a) {
        var h = a.history;
        return T.history(h.ordered, h.offered, this.d.history.orders.length) + (h.ordered ? ' · ' + T.avg(h.avg_households) : '');
      },

      // "8% more than last time ($5.99, 11 Jul)" as {text, kind}; null without history
      priceChip: function (a) {
        var p = a.prices;
        if (!p) return null;
        if (p.change_pct == null) return { text: T.priceNoPrev(p.count), kind: 'muted' };
        var prev = this.money(p.previous), when = p.previous_date;
        if (p.change_pct > 0) return { text: T.priceUp(p.change_pct, prev, when), kind: p.change_pct >= 10 ? 'bad' : 'warn' };
        if (p.change_pct < 0) return { text: T.priceDown(-p.change_pct, prev, when), kind: 'ok' };
        return { text: T.priceSame(prev, when), kind: 'muted' };
      },

      // Similar available articles for a target (same product word, scored like the
      // swap page), best first, one per name and unit (the cheapest), with the price
      // difference for the same amount when the units can be compared
      suggestionsFor: function (target, excludeId, limit) {
        var list = [], seen = {}, unique = [];
        var pool = this.productGroups[M.stem(M.firstWord(target.name))] || [];
        pool.forEach(function (a) {
          if (a.id === excludeId || !M.sameProduct(a.name, target.name) || M.isUnavailableName(a.name)) return;
          var ratio = M.unitRatio(target.unit, a.unit);
          var equiv = ratio == null ? null : a.price * ratio;
          list.push({ a: a, score: M.similarity(target, a), sameUnit: M.unitKey(a.unit) === M.unitKey(target.unit),
                      comparable: ratio != null, delta: equiv == null ? null : equiv - target.price });
        });
        list.sort(function (x, y) { return y.score - x.score || x.a.price - y.a.price || x.a.name.localeCompare(y.a.name); });
        list.forEach(function (s) {
          var key = M.cleanName(s.a.name) + '|' + M.unitKey(s.a.unit);
          if (seen[key]) return;
          seen[key] = true;
          unique.push(s);
        });
        return unique.slice(0, limit);
      },

      // alternatives of an available article, computed once per article
      alternativesFor: function (a) {
        if (!this._altCache) this._altCache = {};
        if (!this._altCache[a.id]) this._altCache[a.id] = this.suggestionsFor(a, a.id, ALT_POOL);
        return this._altCache[a.id];
      },

      // add the alternative and drop the last-time article
      replaceWith: function (a, s) {
        this.selected[s.a.id] = true;
        this.selected[a.id] = false;
      },
      openMore: function (a) { this.altDialog = { a: a, list: this.alternativesFor(a) }; this.altQuery = ''; },
      closeMore: function () { this.altDialog = null; },
      // choosing in the dialog adds (or removes) the article and closes it; the
      // pick then shows among the row's cards
      pickMore: function (s) { this.toggle(s.a); this.closeMore(); },

      // the dialog's list: the namesakes, or with a query every available article that
      // matches it (name, grower, origin, code), scored against the last-time article
      moreList: function () {
        if (!this.altDialog) return [];
        var q = this.altQuery.trim().toLowerCase(), target = this.altDialog.a;
        if (!q) return this.altDialog.list;
        var list = [];
        this.articles.forEach(function (a) {
          if (a.id === target.id || M.isUnavailableName(a.name)) return;
          var hay = (a.name + ' ' + a.manufacturer + ' ' + a.origin + ' ' + a.order_number).toLowerCase();
          if (hay.indexOf(q) === -1) return;
          var ratio = M.unitRatio(target.unit, a.unit), equiv = ratio == null ? null : a.price * ratio;
          list.push({ a: a, score: M.similarity(target, a), sameUnit: M.unitKey(a.unit) === M.unitKey(target.unit),
                      comparable: ratio != null, delta: equiv == null ? null : equiv - target.price });
        });
        list.sort(function (x, y) { return y.score - x.score || x.a.price - y.a.price || x.a.name.localeCompare(y.a.name); });
        return list.slice(0, 40);
      },

      deltaChip: function (s) {
        if (!s.comparable) return { text: T.unitsDiffer, kind: 'muted' };
        if (Math.abs(s.delta) < 0.005) return { text: T.samePrice, kind: 'muted' };
        if (s.delta < 0) return { text: T.cheaperBy(this.money(-s.delta)), kind: 'ok' };
        return { text: T.dearerBy(this.money(s.delta)), kind: 'warn' };
      },

      openPrices: function (a) {
        var self = this, url = this.d.urls.prices.replace(/0$/, String(a.id));
        this.priceDialog = { article: a, loading: true, data: null, error: null };
        fetch(url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error('failed'); return r.json(); })
          .then(function (json) { if (self.priceDialog) { self.priceDialog.data = json; self.priceDialog.loading = false; } })
          .catch(function () { if (self.priceDialog) { self.priceDialog.error = T.saveError; self.priceDialog.loading = false; } });
      },
      closePrices: function () { this.priceDialog = null; },

      // change of a series row against the next older row with the same unit
      rowChange: function (series, i) {
        var row = series[i], j;
        for (j = i + 1; j < series.length; j++) if (series[j].same_unit === row.same_unit) break;
        if (j >= series.length || !series[j].price) return null;
        var pct = Math.round((row.price - series[j].price) / series[j].price * 100);
        return { pct: pct, kind: pct > 0 ? 'warn' : (pct < 0 ? 'ok' : 'muted') };
      },
      barWidth: function (series, row) {
        var max = 0;
        series.forEach(function (r) { if (r.same_unit && r.price > max) max = r.price; });
        return max > 0 && row.same_unit ? Math.round(row.price / max * 100) : 0;
      },
      tint: M.tint,
      ink: M.ink,
      pct: function (s) { return Math.round(s * 100); },

      save: function () {
        var self = this, token = document.querySelector('meta[name="csrf-token"]');
        var missing = [];
        if (!this.form.ends) missing.push(T.needEnds);
        if (!this.form.pickup) missing.push(T.needPickup);
        if (missing.length) {
          this.errors = missing;
          this.detailsOpen = true;
          window.scrollTo(0, 0);
          return;
        }
        var order = {
          starts: this.form.starts, ends: this.form.ends, boxfill: this.form.boxfill, pickup: this.form.pickup,
          end_action: this.form.end_action, note: this.form.note, supplier_note: this.form.supplier_note,
          article_ids: this.selectedList.map(function (a) { return a.id; })
        };
        this.saving = true;
        this.errors = [];
        fetch(this.d.urls.save, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token ? token.getAttribute('content') : '' },
          body: JSON.stringify({ order: order })
        })
          .then(function (r) { return r.json().then(function (json) { return { ok: r.ok, status: r.status, json: json }; }); })
          .then(function (res) {
            if (res.ok) {
              self._created = true;
              self.notify('ok', T.created);
              window.location.href = res.json.url;
            } else if (res.status === 422) {
              self.errors = res.json.errors || [T.saveError];
              self.detailsOpen = true;
              window.scrollTo(0, 0);
            } else {
              throw new Error('failed');
            }
          })
          .catch(function () { self.notify('error', T.saveError); })
          .then(function () { self.saving = false; });
      },

      notify: function (type, text) {
        var self = this;
        this.toast = { type: type, text: text };
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () { self.toast = null; }, 4000);
      }
    },

    template:
      '<div class="oc">' +
      '  <div class="oc-state" v-if="state === \'loading\'"><span class="oc-spinner"></span></div>' +
      '  <div class="oc-state" v-else-if="state === \'error\'">' +
      '    <div class="oc-alert oc-alert-danger">{{ errorMessage }}</div>' +
      '    <button type="button" class="oc-btn" @click="load">{{ T.reload }}</button>' +
      '  </div>' +

      '  <template v-else>' +
      '  <div class="oc-head">' +
      '    <div class="oc-titlebar">' +
      '      <a class="oc-back" :href="d.urls.back">‹ {{ T.back }}</a>' +
      '      <h1 class="oc-title">{{ T.title(d.source.name) }}</h1>' +
      '      <a class="oc-classic" :href="d.urls.legacy">{{ T.classic }}</a>' +
      '    </div>' +
      '    <p class="oc-intro">{{ T.intro }}</p>' +
      '    <div class="oc-alert oc-alert-danger" v-if="errors.length"><strong>{{ T.fix }}</strong><ul><li v-for="(e, i) in errors" :key="i">{{ e }}</li></ul></div>' +
      '  </div>' +

      // ---- the copied order -----------------------------------------------------------
      '  <section class="oc-card oc-source">' +
      '    <div class="oc-source-head">' +
      '      <span class="oc-label">{{ T.lastOrder }}</span>' +
      '      <a :href="d.urls.source" class="oc-small-link">{{ T.viewSource }}</a>' +
      '    </div>' +
      '    <div class="oc-source-grid">' +
      '      <div class="oc-stat"><strong>{{ d.source.households == null ? \'—\' : d.source.households }}</strong><small>{{ T.households(d.source.households || 0).replace(/^\\d+ /, \'\') }}</small></div>' +
      '      <div class="oc-stat"><strong>{{ d.source.articles_with_demand }}</strong><small>with demand</small></div>' +
      '      <div class="oc-stat none"><strong>{{ d.source.articles_without_demand }}</strong><small>nobody ordered</small></div>' +
      '      <div class="oc-stat" v-if="d.source.total != null"><strong>{{ money(d.source.total) }}</strong><small>{{ T.total }}</small></div>' +
      '    </div>' +
      '    <p class="oc-source-meta">' +
      '      <span v-if="d.source.ends_human">{{ T.closes }} <strong>{{ d.source.ends_human }}</strong></span>' +
      '      <span v-if="d.source.pickup_human">{{ T.pickup }} <strong>{{ d.source.pickup_human }}</strong></span>' +
      '      <span v-if="d.history.orders.length > 1">history over the last {{ d.history.orders.length }} orders</span>' +
      '    </p>' +
      '  </section>' +

      // ---- order details --------------------------------------------------------------------
      '  <section class="oc-card oc-details">' +
      '    <button type="button" class="oc-details-toggle" @click="detailsOpen = !detailsOpen" :aria-expanded="detailsOpen ? \'true\' : \'false\'">' +
      '      <span class="oc-label">{{ T.details }}</span>' +
      '      <span class="oc-details-summary" v-if="!detailsOpen">{{ T.ends }} {{ form.ends ? form.ends.replace(\'T\', \' \') : T.notSet }} · {{ T.pickupDate }} {{ form.pickup || T.notSet }}</span>' +
      '      <span class="oc-caret">{{ detailsOpen ? \'▴\' : \'▾\' }}</span>' +
      '    </button>' +
      '    <div class="oc-form" v-show="detailsOpen">' +
      '      <label class="oc-field"><span>{{ T.starts }}</span><input type="datetime-local" v-model="form.starts"></label>' +
      '      <label class="oc-field" v-if="cfg.use_boxfill"><span>{{ T.boxfill }}</span><input type="datetime-local" v-model="form.boxfill"></label>' +
      '      <label class="oc-field"><span>{{ T.ends }} *</span><input type="datetime-local" v-model="form.ends" required></label>' +
      '      <label class="oc-field"><span>{{ T.pickupDate }} *</span><input type="date" v-model="form.pickup" required></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.endAction }}</span>' +
      '        <select v-model="form.end_action"><option v-for="e in d.end_actions" :key="e.value" :value="e.value">{{ e.label }}</option></select></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.note }}</span><textarea rows="2" v-model="form.note" v-autogrow></textarea></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.supplierNote }}</span><textarea rows="2" v-model="form.supplier_note" v-autogrow></textarea></label>' +
      '    </div>' +
      '  </section>' +

      // ---- tabs ------------------------------------------------------------------------------------------
      '  <div class="oc-tabs" role="tablist">' +
      '    <button type="button" role="tab" :class="{ active: tab === \'last\' }" :aria-selected="tab === \'last\' ? \'true\' : \'false\'" @click="tab = \'last\'">{{ T.tabLast }} <span>{{ lastTimeWithAlternatives.length }}</span></button>' +
      '    <button type="button" role="tab" :class="{ active: tab === \'all\' }" :aria-selected="tab === \'all\' ? \'true\' : \'false\'" @click="tab = \'all\'">{{ T.tabAll }} <span>{{ counts.all }}</span></button>' +
      '  </div>' +

      // ---- tab 1: last time and alternatives ----------------------------------------------------------------
      '  <section v-show="tab === \'last\'">' +
      '    <div class="oc-unavailable oc-lasttime">' +
      '      <strong>{{ T.lastTimeTitle(lastTimeWithAlternatives.length) }}</strong>' +
      '      <small>{{ T.lastTimeHint(goneCount) }}</small>' +
      '      <div class="oc-unavailable-row" v-for="x in lastTimeWithAlternatives" :key="x.a.id" :class="{ gone: !x.available }">' +
      '        <div class="oc-unavailable-name">' +
      '          <span>{{ x.a.name }}</span>' +
      '          <small>{{ [x.a.unit_quantity + \'×\' + x.a.unit, x.a.manufacturer, x.a.origin, money(x.a.price)].filter(Boolean).join(\' · \') }}</small>' +
      '          <div class="oc-demand"><span v-for="(p, i) in demandLine(x.a)" :key="i" :class="p.kind">{{ p.text }}</span></div>' +
      '        </div>' +
      // the same price block as the article cards
      '        <div class="oc-item-side oc-row-side">' +
      '          <button type="button" class="oc-price oc-pricebox" @click.prevent.stop="openPrices(x.a)" :title="T.priceHistory"><strong>{{ money(x.a.price) }}</strong><small :title="T.prices">{{ money(x.a.fc_price) }} · {{ money(x.a.supplier_price) }}</small>' +
      '            <span class="oc-pricechip" v-if="priceChip(x.a)" :class="priceChip(x.a).kind">{{ priceChip(x.a).text }}</span>' +
      '            <span class="oc-pricelink">{{ T.priceHistoryLink }}</span>' +
      '          </button>' +
      '          <div class="oc-history" v-if="x.a.history && x.a.history.offered">' +
      '            <span class="oc-bars"><span v-for="(b, i) in historyBars(x.a)" :key="i" :class="{ missing: b.missing, zero: b.n === 0 }" :style="{ height: b.height + \'%\' }" :title="b.missing ? T.notOffered : T.households(b.n)"></span></span>' +
      '            <small>{{ T.history(x.a.history.ordered, x.a.history.offered, d.history.orders.length) }}<template v-if="x.a.history.ordered"> · {{ T.avg(x.a.history.avg_households) }}</template></small>' +
      '          </div>' +
      '        </div>' +
      '        <div class="oc-suggestions">' +
      '          <button type="button" class="oc-suggestion oc-self" :class="{ selected: selected[x.a.id], gone: !x.available }" :disabled="!x.available" @click="x.available && toggle(x.a)" :title="x.a.name">' +
      '            <b>{{ T.lastTime }}</b> {{ x.a.name }}' +
      '            <small>{{ [x.a.unit_quantity + \'×\' + x.a.unit, x.a.manufacturer, x.a.origin, money(x.a.price)].filter(Boolean).join(\' · \') }}</small>' +
      '            <i v-if="!x.available">{{ T.gone }}</i>' +
      '            <i v-else>{{ selected[x.a.id] ? \'✓ \' + T.added + \' · \' + T.remove : \'+ \' + T.add }}</i>' +
      '          </button>' +
      '          <span class="muted oc-none" v-if="!x.suggestions.length">{{ T.noSuggestion }}</span>' +
      '          <oc-alt v-for="s in x.suggestions" :key="s.a.id" :s="s" :selected="!!selected[s.a.id]" :replaceable="x.available && !!selected[x.a.id]"' +
      '                  :money="money" :price-chip="priceChip" :history-text="historyText" :delta-chip="deltaChip"' +
      '                  @toggle="toggle(s.a)" @replace="replaceWith(x.a, s)" @prices="openPrices(s.a)"></oc-alt>' +
      '          <button type="button" class="oc-linkbtn oc-more" v-if="x.more > 0" @click="openMore(x.a)">{{ T.showMore(x.more) }}</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

      // ---- tab 2: the whole catalogue ---------------------------------------------------------------------------
      '  <template v-if="tab === \'all\'">' +
      // ---- toolbar ---------------------------------------------------------------------------------
      '  <div class="oc-toolbar">' +
      '    <div class="oc-toolbar-row">' +
      '      <span class="oc-searchwrap"><input type="search" class="oc-search" v-model="query" :placeholder="T.search">' +
      '        <button type="button" class="oc-clear" v-if="query" @click="query = \'\'" :aria-label="T.clear">×</button></span>' +
      '      <select class="oc-select" v-model="category"><option value="">{{ T.allCategories }}</option><option v-for="c in d.categories" :key="c.name" :value="c.name">{{ c.name }}</option></select>' +
      '      <select class="oc-select" v-model="sort"><option value="name">{{ T.sortName }}</option><option value="demand">{{ T.sortDemand }}</option></select>' +
      '    </div>' +
      '    <div class="oc-toolbar-row">' +
      '      <div class="oc-filters">' +
      '        <button type="button" :class="{ active: filter === \'all\' }" @click="filter = \'all\'">{{ T.all }} <span>{{ counts.all }}</span></button>' +
      '        <button type="button" :class="{ active: filter === \'demand\' }" @click="filter = \'demand\'">{{ T.withDemand }} <span>{{ counts.demand }}</span></button>' +
      '        <button type="button" :class="{ active: filter === \'nodemand\' }" @click="filter = \'nodemand\'">{{ T.noDemand }} <span>{{ counts.nodemand }}</span></button>' +
      '        <button type="button" :class="{ active: filter === \'new\' }" @click="filter = \'new\'">{{ T.newOnes }} <span>{{ counts.fresh }}</span></button>' +
      '      </div>' +
      '      <div class="oc-quick">' +
      '        <span>{{ T.select }}</span>' +
      '        <button type="button" class="oc-linkbtn" @click="selectAs(\'last\')">{{ T.selLast }}</button>' +
      '        <button type="button" class="oc-linkbtn" @click="selectAs(\'demand\')">{{ T.selDemand }}</button>' +
      '        <button type="button" class="oc-linkbtn" @click="selectAs(\'all\')">{{ T.selAll }}</button>' +
      '        <button type="button" class="oc-linkbtn" @click="selectAs(\'none\')">{{ T.selNone }}</button>' +
      '        <template v-if="query || filter !== \'all\' || category">' +
      '          <span>·</span>' +
      '          <button type="button" class="oc-linkbtn" @click="selectAs(\'shown\')">{{ T.selShown }}</button>' +
      '          <button type="button" class="oc-linkbtn" @click="selectAs(\'unshown\')">{{ T.unselShown }}</button>' +
      '        </template>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +

      // ---- articles ----------------------------------------------------------------------------------
      '  <p class="oc-empty" v-if="!visibleCategories.length">{{ T.nothing }}</p>' +
      '  <section class="oc-category" v-for="c in visibleCategories" :key="c.name">' +
      '    <label class="oc-category-head">' +
      '      <input type="checkbox" :checked="categorySelected(c)" @change="toggleCategory(c)">' +
      '      <span class="oc-category-name">{{ c.name }}</span>' +
      '      <small>{{ c.articles.length }}</small>' +
      '    </label>' +
      '    <div class="oc-list">' +
      '      <label class="oc-item" v-for="a in c.articles" :key="a.id" :class="[\'is-\' + kind(a), { selected: selected[a.id] }]">' +
      '        <input type="checkbox" class="oc-check" :checked="!!selected[a.id]" @change="toggle(a)">' +
      '        <div class="oc-item-main">' +
      '          <div class="oc-item-name">' +
      '            <strong>{{ a.name }}</strong>' +
      '            <span class="oc-chip info" v-if="!a.in_source">{{ T.newChip }}</span>' +
      '            <small class="oc-code" v-if="a.order_number">{{ a.order_number }}</small>' +
      '          </div>' +
      '          <div class="oc-item-meta">' +
      '            <span v-if="a.origin || a.manufacturer">{{ [a.origin, a.manufacturer].filter(Boolean).join(\' · \') }}</span>' +
      '            <span v-if="cfg.stockit && a.quantity_available != null">{{ T.stock(a.quantity_available, a.unit) }}</span>' +
      '            <span v-else>{{ a.unit }}<template v-if="a.unit_quantity > 1"> × {{ a.unit_quantity }}</template></span>' +
      '            <span v-if="a.note" class="oc-note">{{ a.note }}</span>' +
      '          </div>' +
      '          <div class="oc-demand" v-if="a.in_source">' +
      '            <span v-for="(p, i) in demandLine(a)" :key="i" :class="p.kind">{{ p.text }}</span>' +
      '            <span class="oc-fill" v-if="a.demand.households > 0 && a.demand.unit_size > 1" :title="fillPercent(a) + \'% of a case\'"><span :style="{ width: fillPercent(a) + \'%\' }" :class="a.demand.units_to_order > 0 ? \'ok\' : \'warn\'"></span></span>' +
      '          </div>' +
      '          <div class="oc-demand" v-else><span class="muted">{{ T.notOffered }}</span></div>' +
      '        </div>' +
      '        <div class="oc-item-side">' +
      '          <button type="button" class="oc-price oc-pricebox" @click.prevent.stop="openPrices(a)" :title="T.priceHistory"><strong>{{ money(a.price) }}</strong><small :title="T.prices">{{ money(a.fc_price) }} · {{ money(a.supplier_price) }}</small>' +
      '            <span class="oc-pricechip" v-if="priceChip(a)" :class="priceChip(a).kind">{{ priceChip(a).text }}</span>' +
      '            <span class="oc-pricelink">{{ T.priceHistoryLink }}</span>' +
      '          </button>' +
      '          <div class="oc-history" v-if="a.history && a.history.offered">' +
      '            <span class="oc-bars"><span v-for="(b, i) in historyBars(a)" :key="i" :class="{ missing: b.missing, zero: b.n === 0 }" :style="{ height: b.height + \'%\' }" :title="b.missing ? T.notOffered : T.households(b.n)"></span></span>' +
      '            <small>{{ T.history(a.history.ordered, a.history.offered, d.history.orders.length) }}<template v-if="a.history.ordered"> · {{ T.avg(a.history.avg_households) }}</template></small>' +
      '          </div>' +
      '        </div>' +
      '      </label>' +
      '    </div>' +
      '  </section>' +

      '  </template>' +

      '  <footer class="oc-footer">' +
      '    <div class="oc-footer-info">' +
      '      <strong>{{ T.selected(selectedStats.total) }}</strong>' +
      '      <small>{{ T.selectedDetail(selectedStats.demand, selectedStats.none, selectedStats.fresh) }}</small>' +
      '    </div>' +
      '    <button type="button" class="oc-btn oc-btn-primary" :disabled="!canCreate" @click="save">{{ saving ? T.creating : T.create }}</button>' +
      '  </footer>' +
      '  </template>' +

      '  <div class="oc-toast" :class="toast.type" v-if="toast" @click="toast = null">{{ toast.text }}</div>' +

      // ---- more alternatives dialog ----------------------------------------------------------------------
      '  <div class="oc-modal-backdrop" v-if="altDialog" @click.self="closeMore">' +
      '    <div class="oc-modal" role="dialog" aria-modal="true">' +
      '      <div class="oc-modal-head">' +
      '        <div><span class="oc-label">{{ T.alternativesLabel }}</span><h3>{{ T.moreTitle(altDialog.a.name) }}</h3></div>' +
      '        <button type="button" class="oc-modal-close" @click="closeMore" :aria-label="T.close">×</button>' +
      '      </div>' +
      '      <span class="oc-searchwrap oc-more-search"><input type="search" class="oc-search" v-model="altQuery" :placeholder="T.moreSearch">' +
      '        <button type="button" class="oc-clear" v-if="altQuery" @click="altQuery = \'\'" :aria-label="T.clear">×</button></span>' +
      '      <p class="oc-empty" v-if="!moreList().length">{{ T.moreNothing }}</p>' +
      '      <div class="oc-suggestions oc-more-list">' +
      '        <oc-alt v-for="s in moreList()" :key="s.a.id" :s="s" :selected="!!selected[s.a.id]" :replaceable="!!altDialog.a.in_source && !!selected[altDialog.a.id]"' +
      '                :money="money" :price-chip="priceChip" :history-text="historyText" :delta-chip="deltaChip"' +
      '                @toggle="pickMore(s)" @replace="replaceWith(altDialog.a, s); closeMore()" @prices="openPrices(s.a)"></oc-alt>' +
      '      </div>' +
      '      <p class="oc-modal-foot"><button type="button" class="oc-btn" @click="closeMore">{{ T.close }}</button></p>' +
      '    </div>' +
      '  </div>' +

      // ---- price history dialog -----------------------------------------------------------------------
      '  <div class="oc-modal-backdrop" v-if="priceDialog" @click.self="closePrices">' +
      '    <div class="oc-modal" role="dialog" aria-modal="true">' +
      '      <div class="oc-modal-head">' +
      '        <div><span class="oc-label">{{ T.priceHistory }}</span><h3>{{ priceDialog.article.name }}</h3></div>' +
      '        <button type="button" class="oc-modal-close" @click="closePrices" :aria-label="T.close">×</button>' +
      '      </div>' +
      '      <p class="oc-state" v-if="priceDialog.loading"><span class="oc-spinner"></span> {{ T.loadingPrices }}</p>' +
      '      <div class="oc-alert oc-alert-danger" v-else-if="priceDialog.error">{{ priceDialog.error }}</div>' +
      '      <template v-else>' +
      '        <div class="oc-price-summary" v-if="priceDialog.data.summary">' +
      '          <div><small>{{ T.priceNow }}</small><strong>{{ money(priceDialog.data.article.price) }}</strong></div>' +
      '          <div v-if="priceDialog.data.summary.previous != null"><small>{{ T.priceLast }}</small><strong>{{ money(priceDialog.data.summary.previous) }}</strong><small>{{ priceDialog.data.summary.previous_date }}</small></div>' +
      '          <div><small>{{ T.priceLow }}</small><strong class="ok">{{ money(priceDialog.data.summary.low) }}</strong></div>' +
      '          <div><small>{{ T.priceHigh }}</small><strong class="bad">{{ money(priceDialog.data.summary.high) }}</strong></div>' +
      '          <div><small>{{ T.priceAvg }}</small><strong>{{ money(priceDialog.data.summary.avg) }}</strong></div>' +
      '        </div>' +
      '        <p class="oc-modal-hint">{{ T.priceHint }}</p>' +
      '        <p class="oc-empty" v-if="!priceDialog.data.series.length">{{ T.priceEmpty }}</p>' +
      '        <div class="oc-table-wrap" v-else>' +
      '        <table class="oc-price-table">' +
      '          <thead><tr><th>{{ T.colDate }}</th><th>{{ T.colPrice }}</th><th></th><th>{{ T.colChange }}</th><th>{{ T.colPack }}</th><th>{{ T.colOrders }}</th></tr></thead>' +
      '          <tbody>' +
      '            <tr v-for="(r, i) in priceDialog.data.series" :key="i" :class="{ current: r.current, muted: !r.same_unit }">' +
      '              <td>{{ r.date_human }}<small v-if="r.current"> · {{ T.currentRow }}</small><small v-else-if="r.deleted"> · {{ T.deletedRow }}</small></td>' +
      '              <td class="num"><strong>{{ money(r.price) }}</strong></td>' +
      '              <td class="bar"><span :style="{ width: barWidth(priceDialog.data.series, r) + \'%\' }"></span></td>' +
      '              <td class="num"><span v-if="rowChange(priceDialog.data.series, i)" :class="rowChange(priceDialog.data.series, i).kind">{{ rowChange(priceDialog.data.series, i).pct > 0 ? \'+\' : \'\' }}{{ rowChange(priceDialog.data.series, i).pct }}%</span></td>' +
      '              <td>{{ r.unit_quantity }}×{{ r.unit }}<small v-if="!r.same_unit"> · {{ T.otherUnit }}</small><small v-if="r.name !== priceDialog.article.name" :title="r.name"> · {{ r.name }}</small></td>' +
      '              <td class="num">{{ r.orders || \'\' }}</td>' +
      '            </tr>' +
      '          </tbody>' +
      '        </table>' +
      '        </div>' +
      '      </template>' +
      '    </div>' +
      '  </div>' +
      '</div>'
  };

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var el = document.getElementById('order-copy-app');
    if (!el) return;
    if (!window.Vue) {
      el.innerHTML = '<div class="alert alert-danger">Vue failed to load.</div>';
      return;
    }
    Vue.createApp(OrderCopyApp, { dataUrl: el.getAttribute('data-url') }).mount(el);
  });
})();
