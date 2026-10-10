// Modern "copy order" page (Vue 3): create a new order from an earlier one
// while seeing what demand every article had, so the coordinator can decide
// what to include. Plain ES5 on purpose (the production Uglifier is ES5 only).
//
// Mounted on #order-copy-app (app/views/order_copy/show.html.haml). The JSON at
// data-url (OrderCopySerializer) carries the copied order and its demand, the
// supplier's available articles with a short demand history, and the defaults
// for the new order. Creating POSTs to OrderCopyController#create.
//
// The same page edits an order (data "mode": "edit", OrdersController#edit):
// only the catalogue, the order's own articles and demand count as "last
// time", the wording comes from T_EDIT and saving PATCHes the order.
(function () {
  'use strict';

  var M = window.FoodsoftArticleMatch;
  var SUGGESTIONS = 3;      // under an article that can no longer be ordered
  var ALT_POOL = 30;        // candidates kept per article for the choice dialog

  // best match first (by the whole percentage shown), then cheapest, then by name
  function byMatch(x, y) {
    return Math.round(y.score * 100) - Math.round(x.score * 100) || x.a.price - y.a.price || x.a.name.localeCompare(y.a.name);
  }

  // "APPLES GALA BAGGED FCY 12x3# (BLOSSOM RIVER)": the grower after the name, in the choice dialog
  function nameWithMaker(a) { return a.name + (a.manufacturer ? ' (' + a.manufacturer + ')' : ''); }

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
    noMatch: 'No articles match.',
    newChip: 'new',
    noneChip: 'nobody ordered',
    notOffered: 'not in last order',
    include: 'Include',
    includeAll: 'Include all',
    allIncluded: 'All included',
    catCount: function (sel, n) { return sel + ' of ' + n + ' included'; },
    included: 'Included',
    inThisOrder: 'in the new order',
    notInThisOrder: 'not in the new order',
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
    reset: 'Reset',
    resetConfirm: 'Throw away your changes and start again from the defaults (last order\'s articles, suggested dates)?',
    restored: 'Your unsaved changes were restored.',
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
    // one-line forms for the dense last-time rows and the choice dialog
    priceShort: function (pct, when) { return (pct > 0 ? '▲ ' + pct + '%' : (pct < 0 ? '▼ ' + (-pct) + '%' : 'no change')) + ' since ' + when; },
    barTitle: function (when, n) { return when + ': ' + (n == null ? 'not in that order' : n + (n === 1 ? ' household' : ' households')); },
    avgOffered: function (n) { return 'avg ' + n + (n === 1 ? ' household' : ' households') + ' when offered'; },
    lastTimeTitle: function (n) { return 'Articles you ordered last time and their alternatives'; },
    tabLast: 'Last time & alternatives',
    tabAll: 'All available articles',
    lastTimeHint: function (gone) { return 'Each article ordered last time and what the new order gets instead: the same article, an alternative or nothing. Tap the choice on the right to change it; price differences are for the same amount.' + (gone ? ' ' + gone + (gone === 1 ? ' article' : ' articles') + ' can no longer be ordered (greyed); an identical new listing is chosen automatically, otherwise nothing.' : ''); },
    gone: 'no longer available',
    lastTime: 'last time',
    sameArticle: 'Same as last time',
    nothing: 'Nothing',
    nothingHint: 'leave it out of the new order',
    choose: 'change',
    chosen: '✓ chosen',
    pick: 'choose',
    cheaperAlts: function (n, saving) { return n + (n === 1 ? ' cheaper alternative' : ' cheaper alternatives') + (n === 1 ? ' (' : ' (up to ') + saving + ' less)'; },
    alternativesCount: function (n) { return n ? n + (n === 1 ? ' alternative' : ' alternatives') : 'no alternatives'; },
    moreTitle: function (name) { return 'Instead of ' + name; },
    moreSearch: 'Search all articles…',
    lastDemand: 'Last time:',
    fitsCases: function (n) { return '✓ last time\'s demand fills ' + fmtUnits(n) + (n === 1 ? ' case' : ' cases'); },
    fitsShort: function (units, missing) { return 'last time\'s demand: ' + (units ? fmtUnits(units) + (units === 1 ? ' case, ' : ' cases, ') : '') + missing + ' short of a case'; },
    fitsNone: 'last time\'s demand fills no case',
    noCategory: 'Other',
    sortBy: 'Sort:',
    sortMatch: 'best match',
    sortPerLb: 'price per lb',
    sortPrice: 'price',
    moreNothing: 'No article matches.',
    clear: 'Clear',
    alternativesLabel: 'Choose for the new order',
    unitsDiffer: 'units differ',
    cheaperBy: function (d) { return d + ' cheaper'; },
    dearerBy: function (d) { return d + ' more'; },
    samePrice: 'same price',
    close: 'Close',
    date: 'Date',
    time: 'Time',
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
  // the difference, the note, then the same price details as the article cards
  // (coop and supplier price, "N% more than last time" chip opening the history
  // dialog, and the six-order history line). Used in the choice dialog.
  var AltCard = {
    props: {
      s: { type: Object, required: true },        // { a, score, delta, comparable, sameUnit }
      selected: { type: Boolean, default: false },
      money: { type: Function, required: true },
      priceChip: { type: Function, required: true },
      historyText: { type: Function, required: true },
      deltaChip: { type: Function, required: true },
      shortChip: { type: Function, required: true },
      fit: { type: Object, default: null }          // demandFit() of this option, null when it cannot be told
    },
    emits: ['toggle', 'prices'],
    data: function () { return { T: T }; },
    computed: {
      // cheaper than the last-time article for the same amount
      cheaper: function () { return this.s.comparable && this.s.delta < -0.005; }
    },
    methods: { tint: M.tint, ink: M.ink, nameWithMaker: nameWithMaker },
    template:
      '<div class="oc-opt" role="button" tabindex="0" :class="{ selected: selected, cheaper: cheaper }" :style="{ borderLeftColor: ink(s.score) }" @click="$emit(\'toggle\')" @keydown.enter.prevent="$emit(\'toggle\')">' +
      '  <div class="oc-opt-main">' +
      '    <div class="oc-opt-name" :title="T.match(Math.round(s.score * 100)) + \' match\'">{{ nameWithMaker(s.a) }} <span class="oc-cheaper-tag" v-if="cheaper">{{ T.cheaperBy(money(-s.delta)) }}</span></div>' +
      '    <div class="oc-opt-meta"><button type="button" class="oc-opt-price" @click.stop.prevent="$emit(\'prices\')" :title="T.priceHistory + \' (\' + T.prices + \': \' + money(s.a.fc_price) + \' · \' + money(s.a.supplier_price) + \')\'"><strong>{{ money(s.a.price) }}</strong> <em :class="deltaChip(s).kind">({{ deltaChip(s).text }})</em><template v-if="shortChip(s.a)"> <em :class="shortChip(s.a).kind">{{ shortChip(s.a).text }}</em></template> ›</button>' +
      '      · {{ [s.a.unit_quantity + \'×\' + s.a.unit, s.a.origin].filter(Boolean).join(\' · \') }}<i v-if="s.a.note"> · {{ s.a.note }}</i><span v-if="s.a.history && s.a.history.ordered" :title="historyText(s.a)"> · {{ T.avgOffered(s.a.history.avg_households) }}</span></div>' +
      '    <div class="oc-opt-fit" v-if="fit" :class="{ ok: fit.ok }">{{ fit.text }}</div>' +
      '  </div>' +
      '  <span class="oc-opt-pick">{{ selected ? T.chosen : T.pick }}</span>' +
      '</div>'
  };

  // Date and time as two fields bound to one "YYYY-MM-DDTHH:MM" value. The native
  // datetime-local popup (Firefox) only has a "Clear" button and stays open; a
  // plain date picker closes on the chosen day and the time is typed. The value
  // is only set while both halves are filled.
  var DateTimeField = {
    props: { modelValue: { type: String, default: '' }, label: { type: String, required: true }, required: { type: Boolean, default: false } },
    emits: ['update:modelValue'],
    data: function () { return { date: '', time: '', T: T }; },
    watch: {
      modelValue: {
        immediate: true,
        handler: function (v) {
          if (v) { this.date = v.split('T')[0] || ''; this.time = (v.split('T')[1] || '').slice(0, 5); }
          else if (this.date && this.time) { this.date = ''; this.time = ''; }
        }
      }
    },
    methods: {
      emitValue: function () { this.$emit('update:modelValue', this.date && this.time ? this.date + 'T' + this.time : ''); }
    },
    template:
      '<div class="oc-field"><span>{{ label }}<template v-if="required"> *</template></span>' +
      '  <div class="oc-datetime">' +
      '    <input type="date" v-model="date" @change="emitValue" :required="required" :aria-label="label + \' – \' + T.date">' +
      '    <input type="time" v-model="time" @change="emitValue" :required="required" :aria-label="label + \' – \' + T.time">' +
      '  </div>' +
      '</div>'
  };

  // the edit page's wording, over T
  var T_EDIT = {
    title: function (name) { return 'Edit ' + name; },
    back: 'Back to the order',
    classic: 'Classic edit',
    intro: 'Include or leave out articles and change the dates. Each article shows the demand it has so far.',
    lastOrder: 'This order so far',
    withDemand: 'Ordered',
    newOnes: 'Not in this order',
    selLast: 'as saved',
    notOffered: 'not in this order',
    inThisOrder: 'in the order',
    notInThisOrder: 'not in the order',
    create: 'Save changes',
    creating: 'Saving…',
    created: 'The order has been saved.',
    saveError: 'Saving the order failed. Please try again.',
    leave: 'Your changes have not been saved yet. Leave anyway?',
    resetConfirm: 'Throw away your changes and go back to the order as it is saved?',
    removeOrdered: function (names) { return 'Members have already ordered ' + names.join(', ') + '. Remove ' + (names.length === 1 ? 'it' : 'them') + ' from the order anyway? Their orders for ' + (names.length === 1 ? 'it' : 'these') + ' are deleted.'; }
  };

  var OrderCopyApp = {
    components: { 'oc-alt': AltCard, 'oc-datetime': DateTimeField, 'oc-price-dialog': window.FoodsoftPriceDialog },
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
        choice: {},         // last-time article id -> article id chosen for the new order, or null for nothing
        filter: 'all',      // all | demand | nodemand | new
        category: '',
        query: '',
        sort: 'name',       // name | demand (within a category)
        detailsOpen: true,
        tab: 'last',        // last | all
        saving: false,
        errors: [],
        toast: null,
        priceDialog: null,   // { article, url } while the history dialog (price_history_dialog.js) is open
        altDialog: null,     // { a, available, list } while a last-time row's choice dialog is open
        altQuery: '',        // search in that dialog: empty shows the namesakes, text searches everything
        altSort: 'match',    // match | perlb (when notes carry a price per lb) | price (when they don't)
        openCats: {},        // catalogue categories expanded by hand; all open while searching or filtering
        T: T
      };
    },

    computed: {
      cfg: function () { return (this.d && this.d.config) || {}; },
      isEdit: function () { return !!(this.d && this.d.mode === 'edit'); },
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

      // the copied order's articles (still available or not) by name, each with
      // its alternatives and what is chosen for the new order
      lastTimeWithAlternatives: function () {
        var self = this;
        if (!this.d) return [];
        return this.lastTimeRows.map(function (r) {
          var alts = self.alternativesFor(r.a);
          // alternatives cheaper for the same amount, and the biggest saving among them
          var cheaper = alts.filter(function (s) { return s.comparable && s.delta < -0.005; });
          var saving = cheaper.reduce(function (m, s) { return Math.max(m, -s.delta); }, 0);
          return { a: r.a, available: r.available, category: r.category, alternatives: alts.length, cheaper: cheaper.length, saving: saving, chosen: self.chosenFor(r) };
        });
      },
      lastTimeRows: function () {
        if (!this.d) return [];
        var rows = [];
        this.d.categories.forEach(function (c) {
          c.articles.forEach(function (a) { if (a.in_source) rows.push({ a: a, available: true, category: c.name }); });
        });
        this.d.unavailable.forEach(function (u) { rows.push({ a: u, available: false, category: u.category || '' }); });
        return rows.sort(function (x, y) { return x.a.name.localeCompare(y.a.name); });
      },
      // the last-time rows by category, categories by name (articles without one last)
      lastTimeGroups: function () {
        var groups = {}, out = [];
        this.lastTimeWithAlternatives.forEach(function (x) {
          if (!groups[x.category]) out.push(groups[x.category] = { name: x.category, rows: [] });
          groups[x.category].rows.push(x);
        });
        return out.sort(function (x, y) { return (!x.name) - (!y.name) || x.name.localeCompare(y.name); });
      },
      articlesById: function () {
        var out = {};
        this.articles.forEach(function (a) { out[a.id] = a; });
        return out;
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

    watch: {
      form: { deep: true, handler: function () { this.saveDraft(); } },
      selected: { deep: true, handler: function () { this.saveDraft(); } },
      choice: { deep: true, handler: function () { this.saveDraft(); } }
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
        var self = this;
        if (json.mode === 'edit') {
          Object.keys(T_EDIT).forEach(function (k) { self.T[k] = T_EDIT[k]; });
          this.tab = 'all';
        }
        this.d = json;
        this.applyDefaults();
        if (window.innerWidth < 768) this.detailsOpen = false;
        if (this.restoreDraft()) this.notify('ok', T.restored);
        // save only edits made from now on, not the watchers firing for the load itself
        this.$nextTick(function () { self._draftReady = true; });
      },

      applyDefaults: function () {
        var json = this.d;
        this.form = {
          starts: json.defaults.starts || '',
          ends: json.defaults.ends || '',
          boxfill: json.defaults.boxfill || '',
          pickup: json.defaults.pickup || '',
          end_action: json.defaults.end_action || 'no_end_action',
          note: json.defaults.note || '',
          supplier_note: json.defaults.supplier_note || ''
        };
        this.choice = {};
        this.selectAs('last');
      },

      // ---- unsaved changes in localStorage, per copied order ------------------------------------
      draftKey: function () { return (this.isEdit ? 'foodsoft.orderEdit.' : 'foodsoft.orderCopy.') + this.d.source.id; },
      saveDraft: function () {
        if (!this._draftReady || this._created) return;
        try {
          localStorage.setItem(this.draftKey(), JSON.stringify({ at: Date.now(), form: this.form, selected: this.selected, choice: this.choice }));
        } catch (e) { /* storage full or blocked: nothing to restore later */ }
      },
      // the saved form, selection and per-row choices, kept to articles that still exist
      restoreDraft: function () {
        var draft;
        try { draft = JSON.parse(localStorage.getItem(this.draftKey()) || 'null'); } catch (e) { draft = null; }
        if (!draft || !draft.form || !draft.selected) return false;
        var known = this.articlesById, sel = {}, choice = {}, self = this;
        Object.keys(draft.form).forEach(function (k) { if (k in self.form) self.form[k] = draft.form[k]; });
        this.articles.forEach(function (a) { sel[a.id] = !!draft.selected[a.id]; });
        this.lastTimeRows.forEach(function (r) {
          var c = draft.choice ? draft.choice[r.a.id] : undefined;
          choice[r.a.id] = c === undefined ? self.choice[r.a.id] : (c != null && known[c] ? c : null);
        });
        this.selected = sel;
        this.choice = choice;
        return true;
      },
      clearDraft: function () {
        try { localStorage.removeItem(this.draftKey()); } catch (e) { /* ignore */ }
      },
      resetAll: function () {
        if (!window.confirm(T.resetConfirm)) return;
        var self = this;
        this._draftReady = false;
        this.clearDraft();
        this.applyDefaults();
        this.errors = [];
        // the watchers fire for the reset itself; only later edits are saved again
        this.$nextTick(function () { self._draftReady = true; });
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

      // the same, condensed for the last-time rows ("8 people wanted 10..16 ·
      // 9 short of a case · got 0.4, 10 delivered · avg 8"); full wording in the titles
      demandShort: function (a) {
        var d = a.demand, parts = [], h = a.history;
        if (!d) return [];
        if (d.households === 0) parts.push({ text: T.noneChip, kind: 'muted' });
        else {
          // "8 people wanted 17..24": the range runs up to what they would also take
          parts.push({ text: d.households + (d.households === 1 ? ' person' : ' people') + ' wanted ' + d.wanted + (d.extra ? '..' + (d.wanted + d.extra) : ''),
                       title: T.households(d.households) + ', ' + T.wanted(d.wanted, d.extra), kind: 'strong' });
          if (d.units_to_order > 0) {
            parts.push({ text: T.cases(d.units_to_order, d.unit_size) + (d.missing_units > 0 ? ', ' + d.missing_units + ' short' : ''), kind: 'ok' });
          } else {
            parts.push({ text: d.missing_units > 0 ? T.shortOf(d.missing_units) : T.noCase, title: T.noCase, kind: 'warn' });
          }
          var got = [];
          if (d.units_received != null && d.units_received !== d.units_to_order) got.push('got ' + fmtUnits(d.units_received));
          if (d.delivered > 0) got.push(T.delivered(fmtUnits(d.delivered)));
          if (got.length) parts.push({ text: got.join(', '), title: [d.units_received != null ? T.received(fmtUnits(d.units_received)) + ' (cases)' : '', d.delivered > 0 ? T.delivered(fmtUnits(d.delivered)) + ' (units to members)' : ''].filter(Boolean).join(', '), kind: 'info' });
        }
        if (h && h.ordered) parts.push({ text: 'avg ' + h.avg_households, title: T.avgOffered(h.avg_households) + ' (' + this.historyText(a) + ')', kind: 'muted' });
        return parts;
      },

      // the catalogue rows' demand: last time's, or "not in last order" with the history average
      catalogueDemand: function (a) {
        if (a.in_source) return this.demandShort(a);
        var parts = [{ text: T.notOffered, kind: 'muted' }], h = a.history;
        if (h && h.ordered) parts.push({ text: 'avg ' + h.avg_households, title: T.avgOffered(h.avg_households) + ' (' + this.historyText(a) + ')', kind: 'muted' });
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
        var orders = this.d.history.orders;
        return a.history.households.map(function (n, i) {
          return { height: n == null ? 0 : Math.max(8, Math.round(n / max * 100)), missing: n == null, n: n,
                   title: T.barTitle(orders[i] ? orders[i].ends_human : '', n) };
        }).reverse(); // oldest left, newest right
      },

      toggle: function (a) { this.selected[a.id] = !this.selected[a.id]; },

      catOpen: function (c) { return !!(this.openCats[c.name] || this.query || this.filter !== 'all' || this.category); },
      toggleCat: function (c) { this.openCats[c.name] = !this.catOpen(c); },
      catSelectedCount: function (c) {
        var sel = this.selected;
        return c.articles.filter(function (a) { return sel[a.id]; }).length;
      },

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
        if (mode === 'last' || mode === 'demand') this.initChoices(mode === 'demand');
      },

      // Each last-time row starts with the article itself, or for one that can no
      // longer be ordered with a perfect match (same name and unit, e.g. the
      // relisted article without "UNAVAILABLE!"), or else nothing.
      initChoices: function (onlyDemand) {
        var self = this, choice = {};
        this.lastTimeRows.forEach(function (r) {
          var a = r.a, pick = null;
          if (r.available) pick = a.id;
          else {
            var perfect = self.alternativesFor(a).filter(function (s) { return self.isPerfect(a, s); })[0];
            if (perfect) pick = perfect.a.id;
          }
          if (pick != null && onlyDemand && !(a.demand && a.demand.households > 0)) pick = null;
          choice[a.id] = pick;
          if (pick != null) self.selected[pick] = true;
        });
        this.choice = choice;
      },
      isPerfect: function (target, s) { return s.sameUnit && M.cleanName(s.a.name) === M.cleanName(target.name); },

      // what a last-time row currently gets: its choice while that is still
      // selected (the "all" tab can untick it), else the article itself when it is
      // selected, else nothing. { kind: none | self | alt, s }
      chosenFor: function (r) {
        var c = this.choice[r.a.id], sel = this.selected;
        if (c != null && sel[c] && c !== r.a.id && this.articlesById[c]) return { kind: 'alt', s: this.scored(r.a, this.articlesById[c]) };
        if (r.available && sel[r.a.id]) return { kind: 'self' };
        return { kind: 'none' };
      },

      // choose an article (or null for nothing) for a last-time row; the article it
      // had before leaves the order unless another row chose it too
      choose: function (target, id) {
        var self = this, prev = this.chosenFor({ a: target, available: !!this.articlesById[target.id] });
        var prevId = prev.kind === 'alt' ? prev.s.a.id : (prev.kind === 'self' ? target.id : null);
        if (prevId != null && prevId !== id) {
          var shared = Object.keys(this.choice).some(function (k) { return String(k) !== String(target.id) && self.choice[k] === prevId; });
          if (!shared) this.selected[prevId] = false;
        }
        this.choice[target.id] = id;
        if (id != null) this.selected[id] = true;
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

      // the same as a one-line chip: "▼ 12% since 29 Aug"
      shortChip: function (a) {
        var p = a.prices;
        if (!p || p.change_pct == null) return null;
        var when = String(p.previous_date || '').replace(/^[A-Za-z]+,\s*/, '').replace(/\s+\d{4}$/, '');
        return { text: T.priceShort(p.change_pct, when), kind: p.change_pct > 0 ? (p.change_pct >= 10 ? 'bad' : 'warn') : (p.change_pct < 0 ? 'ok' : 'muted') };
      },

      // Similar available articles for a target (same product word, scored like the
      // swap page), best first, one per name and unit (the cheapest), with the price
      // difference for the same amount when the units can be compared
      suggestionsFor: function (target, excludeId, limit) {
        var list = [], seen = {}, unique = [];
        var pool = this.productGroups[M.stem(M.firstWord(target.name))] || [];
        var self = this;
        pool.forEach(function (a) {
          if (a.id === excludeId || !M.sameProduct(a.name, target.name) || M.isUnavailableName(a.name)) return;
          list.push(self.scored(target, a));
        });
        list.sort(byMatch);
        list.forEach(function (s) {
          var key = M.cleanName(s.a.name) + '|' + M.unitKey(s.a.unit);
          if (seen[key]) return;
          seen[key] = true;
          unique.push(s);
        });
        return unique.slice(0, limit);
      },

      // an article as an alternative to target: score, unit match and the price
      // difference for the same amount when the units can be compared
      scored: function (target, a) {
        var ratio = M.unitRatio(target.unit, a.unit), equiv = ratio == null ? null : a.price * ratio;
        return { a: a, score: M.similarity(target, a), sameUnit: M.unitKey(a.unit) === M.unitKey(target.unit),
                 comparable: ratio != null, delta: equiv == null ? null : equiv - target.price };
      },

      // alternatives of a last-time article, computed once per article
      alternativesFor: function (a) {
        if (!this._altCache) this._altCache = {};
        if (!this._altCache[a.id]) this._altCache[a.id] = this.suggestionsFor(a, a.id, ALT_POOL);
        return this._altCache[a.id];
      },

      openMore: function (x) { this.altDialog = { a: x.a, available: x.available, list: this.alternativesFor(x.a) }; this.altQuery = ''; this.altSort = 'match'; },
      closeMore: function () { this.altDialog = null; },
      // choosing in the dialog sets the row's choice and closes it
      pickMore: function (id) { this.choose(this.altDialog.a, id); this.closeMore(); },
      dialogChosen: function () {
        return this.altDialog ? this.chosenFor({ a: this.altDialog.a, available: this.altDialog.available }) : null;
      },
      isDialogChoice: function (id) {
        var c = this.dialogChosen();
        if (!c) return false;
        if (id == null) return c.kind === 'none';
        return id === this.altDialog.a.id ? c.kind === 'self' : (c.kind === 'alt' && c.s.a.id === id);
      },

      // the dialog's list: the namesakes, or with a query every available article that
      // matches it (name, grower, origin, code), scored against the last-time article
      moreList: function () {
        var list = this.matchList();
        if (this.altSort === 'price') {
          return list.slice().sort(function (x, y) { return x.a.price - y.a.price || y.score - x.score; });
        }
        if (this.altSort !== 'perlb') return list;
        var self = this;
        // cheapest per lb first; options without one keep their match order at the end
        return list.map(function (s, i) { return { s: s, i: i, p: self.perLb(s.a) }; })
          .sort(function (x, y) {
            if (x.p == null || y.p == null) return (x.p == null) - (y.p == null) || x.i - y.i;
            return x.p - y.p || x.i - y.i;
          })
          .map(function (x) { return x.s; });
      },
      // How last time's demand for target (wanted..wanted+extra, in target's unit)
      // would fill cases of article a, converted to a's unit; ok when it fills
      // whole cases with nothing short. null without demand or comparable units.
      demandFit: function (target, a) {
        var d = target.demand;
        if (!d || !(d.wanted > 0)) return null;
        var ratio = a.id === target.id ? 1 : M.unitRatio(target.unit, a.unit);
        if (ratio == null) return null;
        var fill = M.caseFill(Math.round(d.wanted * ratio), Math.round(d.extra * ratio), a.unit_quantity);
        if (fill.units > 0 && fill.missing === 0) return { ok: true, text: T.fitsCases(fill.units) };
        if (fill.missing > 0) return { ok: false, text: T.fitsShort(fill.units, fill.missing) };
        return { ok: false, text: T.fitsNone };
      },

      // "$2.13 per lb" (or "/lb") in an article's note, as a number; null without one
      perLb: function (a) {
        var m = /\$\s*(\d+(?:\.\d+)?)\s*(?:per|\/)\s*lbs?\b/i.exec((a && a.note) || '');
        return m ? parseFloat(m[1]) : null;
      },
      hasPerLb: function () {
        var self = this;
        return this.matchList().some(function (s) { return self.perLb(s.a) != null; });
      },
      // the dialog's options by match: the namesakes, or with a query every article that matches it
      matchList: function () {
        if (!this.altDialog) return [];
        var q = this.altQuery.trim().toLowerCase(), target = this.altDialog.a;
        if (!q) return this.altDialog.list;
        var list = [], self = this;
        this.articles.forEach(function (a) {
          if (a.id === target.id || M.isUnavailableName(a.name)) return;
          var hay = (a.name + ' ' + a.manufacturer + ' ' + a.origin + ' ' + a.order_number + ' ' + a.note).toLowerCase();
          if (hay.indexOf(q) === -1) return;
          list.push(self.scored(target, a));
        });
        list.sort(byMatch);
        return list.slice(0, 40);
      },

      deltaChip: function (s) {
        if (!s.comparable) return { text: T.unitsDiffer, kind: 'muted' };
        if (Math.abs(s.delta) < 0.005) return { text: T.samePrice, kind: 'muted' };
        if (s.delta < 0) return { text: T.cheaperBy(this.money(-s.delta)), kind: 'ok' };
        return { text: T.dearerBy(this.money(s.delta)), kind: 'warn' };
      },

      openPrices: function (a) {
        this.priceDialog = { article: a, url: this.d.urls.prices.replace(/0$/, String(a.id)) };
      },
      closePrices: function () { this.priceDialog = null; },

      // change of a series row against the next older row with the same unit
      tint: M.tint,
      ink: M.ink,
      nameWithMaker: nameWithMaker,
      pct: function (s) { return Math.round(s * 100); },

      save: function (ignoreWarnings) {
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
        if (ignoreWarnings === true) order.ignore_warnings = true;
        this.saving = true;
        this.errors = [];
        fetch(this.d.urls.save, {
          method: this.isEdit ? 'PATCH' : 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': token ? token.getAttribute('content') : '' },
          body: JSON.stringify({ order: order })
        })
          .then(function (r) { return r.json().then(function (json) { return { ok: r.ok, status: r.status, json: json }; }); })
          .then(function (res) {
            if (res.ok) {
              self._created = true;
              self.clearDraft();
              self.notify('ok', T.created);
              window.location.href = res.json.url;
            } else if (res.status === 422 && self.isEdit && ignoreWarnings !== true && res.json.ordered_ids && res.json.ordered_ids.length) {
              // removing articles members already ordered: ask, then save again without the warning
              var names = res.json.ordered_ids.map(function (id) { var a = self.articlesById[id]; return a ? a.name : '#' + id; });
              self.saving = false;
              if (window.confirm(self.T.removeOrdered(names))) self.save(true);
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
      '      <oc-datetime :label="T.starts" v-model="form.starts"></oc-datetime>' +
      '      <oc-datetime :label="T.boxfill" v-model="form.boxfill" v-if="cfg.use_boxfill"></oc-datetime>' +
      '      <oc-datetime :label="T.ends" v-model="form.ends" required></oc-datetime>' +
      '      <label class="oc-field"><span>{{ T.pickupDate }} *</span><input type="date" v-model="form.pickup" required></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.endAction }}</span>' +
      '        <select v-model="form.end_action"><option v-for="e in d.end_actions" :key="e.value" :value="e.value">{{ e.label }}</option></select></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.note }}</span><textarea rows="2" v-model="form.note" v-autogrow></textarea></label>' +
      '      <label class="oc-field oc-field-wide"><span>{{ T.supplierNote }}</span><textarea rows="2" v-model="form.supplier_note" v-autogrow></textarea></label>' +
      '    </div>' +
      '  </section>' +

      // ---- tabs ------------------------------------------------------------------------------------------
      '  <div class="oc-tabs" role="tablist" v-if="!isEdit">' +
      '    <button type="button" role="tab" :class="{ active: tab === \'last\' }" :aria-selected="tab === \'last\' ? \'true\' : \'false\'" @click="tab = \'last\'">{{ T.tabLast }} <span>{{ lastTimeWithAlternatives.length }}</span></button>' +
      '    <button type="button" role="tab" :class="{ active: tab === \'all\' }" :aria-selected="tab === \'all\' ? \'true\' : \'false\'" @click="tab = \'all\'">{{ T.tabAll }} <span>{{ counts.all }}</span></button>' +
      '  </div>' +

      // ---- tab 1: last time and alternatives ----------------------------------------------------------------
      '  <section v-if="!isEdit" v-show="tab === \'last\'">' +
      '    <div class="oc-unavailable oc-lasttime">' +
      '      <strong>{{ T.lastTimeTitle(lastTimeWithAlternatives.length) }}</strong>' +
      '      <small>{{ T.lastTimeHint(goneCount) }}</small>' +
      '      <template v-for="g in lastTimeGroups" :key="g.name">' +
      '      <h4 class="oc-lt-category">{{ g.name || T.noCategory }} <small>{{ g.rows.length }}</small></h4>' +
      '      <div class="oc-unavailable-row" v-for="x in g.rows" :key="x.a.id" :class="{ gone: !x.available }">' +
      '        <div class="oc-unavailable-name">' +
      '          <span>{{ x.a.name }}</span>' +
      '          <small class="oc-row-meta"><b class="oc-row-price">{{ money(x.a.price) }}</b>' +
      '            · {{ x.a.unit_quantity + \'×\' + x.a.unit }}<template v-if="x.a.manufacturer"> · <b class="oc-maker">{{ x.a.manufacturer }}</b></template><template v-if="x.a.origin"> · {{ x.a.origin }}</template><i class="oc-note" v-if="x.a.note"> · {{ x.a.note }}</i></small>' +
      '        </div>' +
      '        <div class="oc-row-stats">' +
      // the change since last time and the price history, above last time's demand
      '          <button type="button" class="oc-row-meta oc-row-change" @click.prevent.stop="openPrices(x.a)" :title="T.priceHistory + \' (\' + T.prices + \': \' + money(x.a.fc_price) + \' · \' + money(x.a.supplier_price) + \')\'">' +
      '            <em v-if="shortChip(x.a)" :class="shortChip(x.a).kind">{{ shortChip(x.a).text }}</em><template v-else>{{ T.priceHistory }}</template> ›</button>' +
      '          <div class="oc-demand oc-row-demand"><span v-for="(p, i) in demandShort(x.a)" :key="i" :class="p.kind" :title="p.title">{{ p.text }}</span></div>' +
      '        </div>' +
      // what the new order gets for it: looks like a select, opens the choice dialog
      '        <button type="button" class="oc-choice" :class="\'is-\' + x.chosen.kind" @click="openMore(x)" aria-haspopup="dialog">' +
      '          <span class="oc-choice-body" v-if="x.chosen.kind === \'self\'"><b>✓ {{ T.sameArticle }}</b><small class="oc-cheaper" v-if="x.cheaper">{{ T.cheaperAlts(x.cheaper, money(x.saving)) }}</small><small v-else>{{ T.alternativesCount(x.alternatives) }}</small></span>' +
      '          <span class="oc-choice-body" v-else-if="x.chosen.kind === \'alt\'" :style="{ borderColor: ink(x.chosen.s.score) }">' +
      '            <b class="oc-choice-name" :title="x.chosen.s.a.name">{{ x.chosen.s.a.name }}</b>' +
      '            <small>{{ [money(x.chosen.s.a.price), x.chosen.s.a.unit_quantity + \'×\' + x.chosen.s.a.unit, x.chosen.s.a.origin].filter(Boolean).join(\' · \') }} · <em :class="deltaChip(x.chosen.s).kind">{{ deltaChip(x.chosen.s).text }}</em><i class="oc-note" v-if="x.chosen.s.a.note"> · {{ x.chosen.s.a.note }}</i></small>' +
      '          </span>' +
      '          <span class="oc-choice-body" v-else><b>{{ T.nothing }}</b><small>{{ T.alternativesCount(x.alternatives) }}</small></span>' +
      '          <span class="oc-caret">▾</span>' +
      '        </button>' +
      '      </div>' +
      '      </template>' +
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
      '  <p class="oc-empty" v-if="!visibleCategories.length">{{ T.noMatch }}</p>' +
      // same rows as the last-time tab; a big button on the right includes or leaves out the article
      '  <div class="oc-unavailable oc-lasttime oc-catalogue" v-if="visibleCategories.length">' +
      '    <template v-for="c in visibleCategories" :key="c.name">' +
      '    <h4 class="oc-lt-category oc-cat-toggle" :class="{ open: catOpen(c) }">' +
      '      <button type="button" class="oc-cat-open" :aria-expanded="catOpen(c) ? \'true\' : \'false\'" @click="toggleCat(c)"><span class="oc-caret">▸</span> {{ c.name }} <small>{{ T.catCount(catSelectedCount(c), c.articles.length) }}</small></button>' +
      '      <button type="button" class="oc-include oc-include-all" :class="{ on: categorySelected(c) }" :aria-pressed="categorySelected(c) ? \'true\' : \'false\'" @click="toggleCategory(c)"><b>{{ categorySelected(c) ? \'✓ \' + T.allIncluded : \'+ \' + T.includeAll }}</b></button></h4>' +
      '    <template v-if="catOpen(c)">' +
      '    <div class="oc-unavailable-row" v-for="a in c.articles" :key="a.id" :class="[\'is-\' + kind(a), { selected: selected[a.id] }]">' +
      '      <div class="oc-unavailable-name">' +
      '        <span>{{ a.name }} <em class="oc-chip info" v-if="!a.in_source && !isEdit">{{ T.newChip }}</em><em class="oc-chip warn" v-if="a.gone">{{ T.gone }}</em></span>' +
      '        <small class="oc-row-meta"><b class="oc-row-price">{{ money(a.price) }}</b>' +
      '          · {{ a.unit_quantity + \'×\' + a.unit }}<template v-if="a.manufacturer"> · <b class="oc-maker">{{ a.manufacturer }}</b></template><template v-if="a.origin"> · {{ a.origin }}</template><template v-if="cfg.stockit && a.quantity_available != null"> · {{ T.stock(a.quantity_available, a.unit) }}</template><template v-if="a.order_number"> · {{ a.order_number }}</template><i class="oc-note" v-if="a.note"> · {{ a.note }}</i></small>' +
      '      </div>' +
      '      <div class="oc-row-stats">' +
      '        <button type="button" class="oc-row-meta oc-row-change" @click.prevent.stop="openPrices(a)" :title="T.priceHistory + \' (\' + T.prices + \': \' + money(a.fc_price) + \' · \' + money(a.supplier_price) + \')\'">' +
      '          <em v-if="shortChip(a)" :class="shortChip(a).kind">{{ shortChip(a).text }}</em><template v-else>{{ T.priceHistory }}</template> ›</button>' +
      '        <div class="oc-demand oc-row-demand"><span v-for="(p, i) in catalogueDemand(a)" :key="i" :class="p.kind" :title="p.title">{{ p.text }}</span></div>' +
      '      </div>' +
      '      <button type="button" class="oc-include" :class="{ on: selected[a.id] }" :aria-pressed="selected[a.id] ? \'true\' : \'false\'" @click="toggle(a)">' +
      '        <b>{{ selected[a.id] ? \'✓ \' + T.included : \'+ \' + T.include }}</b></button>' +
      '    </div>' +
      '    </template>' +
      '    </template>' +
      '  </div>' +

      '  </template>' +

      '  <footer class="oc-footer">' +
      '    <div class="oc-footer-info">' +
      '      <strong>{{ T.selected(selectedStats.total) }}</strong>' +
      '      <small>{{ T.selectedDetail(selectedStats.demand, selectedStats.none, selectedStats.fresh) }}</small>' +
      '    </div>' +
      '    <span class="oc-footer-actions"><button type="button" class="oc-btn" :disabled="saving" @click="resetAll">{{ T.reset }}</button>' +
      '    <button type="button" class="oc-btn oc-btn-primary" :disabled="!canCreate" @click="save()">{{ saving ? T.creating : T.create }}</button></span>' +
      '  </footer>' +
      '  </template>' +

      '  <div class="oc-toast" :class="toast.type" v-if="toast" @click="toast = null">{{ toast.text }}</div>' +

      // ---- choice dialog of a last-time row ----------------------------------------------------------------
      '  <div class="oc-modal-backdrop" v-if="altDialog" @click.self="closeMore">' +
      '    <div class="oc-modal" role="dialog" aria-modal="true">' +
      '      <div class="oc-modal-head">' +
      '        <div><span class="oc-label">{{ T.alternativesLabel }}</span><h3>{{ T.moreTitle(nameWithMaker(altDialog.a)) }}</h3>' +
      '          <div class="oc-dialog-item">{{ [money(altDialog.a.price), altDialog.a.unit_quantity + \'×\' + altDialog.a.unit, altDialog.a.origin].filter(Boolean).join(\' · \') }}<i v-if="altDialog.a.note"> · {{ altDialog.a.note }}</i></div>' +
      '          <div class="oc-demand oc-row-demand oc-dialog-demand"><span class="muted">{{ T.lastDemand }}</span><span v-for="(p, i) in demandShort(altDialog.a)" :key="i" :class="p.kind" :title="p.title">{{ p.text }}</span></div></div>' +
      '        <button type="button" class="oc-modal-close" @click="closeMore" :aria-label="T.close">×</button>' +
      '      </div>' +
      '      <span class="oc-searchwrap oc-more-search"><input type="search" class="oc-search" v-model="altQuery" :placeholder="T.moreSearch">' +
      '        <button type="button" class="oc-clear" v-if="altQuery" @click="altQuery = \'\'" :aria-label="T.clear">×</button></span>' +
      '      <div class="oc-sortbar" v-if="moreList().length > 1"><span>{{ T.sortBy }}</span>' +
      '        <button type="button" :class="{ active: altSort === \'match\' }" @click="altSort = \'match\'">{{ T.sortMatch }}</button>' +
      '        <button type="button" v-if="hasPerLb()" :class="{ active: altSort === \'perlb\' }" @click="altSort = \'perlb\'">{{ T.sortPerLb }}</button>' +
      '        <button type="button" v-else :class="{ active: altSort === \'price\' }" @click="altSort = \'price\'">{{ T.sortPrice }}</button>' +
      '      </div>' +
      '      <div class="oc-opts">' +
      '        <div class="oc-opt oc-opt-none" role="button" tabindex="0" :class="{ selected: isDialogChoice(null) }" @click="pickMore(null)" @keydown.enter.prevent="pickMore(null)">' +
      '          <div class="oc-opt-main"><div class="oc-opt-name">{{ T.nothing }}</div><div class="oc-opt-meta">{{ T.nothingHint }}</div></div>' +
      '          <span class="oc-opt-pick">{{ isDialogChoice(null) ? T.chosen : T.pick }}</span>' +
      '        </div>' +
      '        <div class="oc-opt oc-opt-self" role="button" tabindex="0" v-if="altDialog.available" :class="{ selected: isDialogChoice(altDialog.a.id) }" @click="pickMore(altDialog.a.id)" @keydown.enter.prevent="pickMore(altDialog.a.id)">' +
      '          <div class="oc-opt-main">' +
      '            <div class="oc-opt-name"><b class="oc-opt-score">{{ T.lastTime }}</b> {{ nameWithMaker(altDialog.a) }}</div>' +
      '            <div class="oc-opt-meta"><button type="button" class="oc-opt-price" @click.stop.prevent="openPrices(altDialog.a)" :title="T.priceHistory"><strong>{{ money(altDialog.a.price) }}</strong><template v-if="shortChip(altDialog.a)"> <em :class="shortChip(altDialog.a).kind">{{ shortChip(altDialog.a).text }}</em></template> ›</button>' +
      '              · {{ [altDialog.a.unit_quantity + \'×\' + altDialog.a.unit, altDialog.a.origin].filter(Boolean).join(\' · \') }}<i v-if="altDialog.a.note"> · {{ altDialog.a.note }}</i></div>' +
      '            <div class="oc-opt-fit" v-if="demandFit(altDialog.a, altDialog.a)" :class="{ ok: demandFit(altDialog.a, altDialog.a).ok }">{{ demandFit(altDialog.a, altDialog.a).text }}</div>' +
      '          </div>' +
      '          <span class="oc-opt-pick">{{ isDialogChoice(altDialog.a.id) ? T.chosen : T.pick }}</span>' +
      '        </div>' +
      '        <oc-alt v-for="s in moreList()" :key="s.a.id" :s="s" :selected="isDialogChoice(s.a.id)"' +
      '                :money="money" :price-chip="priceChip" :history-text="historyText" :delta-chip="deltaChip" :short-chip="shortChip" :fit="demandFit(altDialog.a, s.a)"' +
      '                @toggle="pickMore(s.a.id)" @prices="openPrices(s.a)"></oc-alt>' +
      '      </div>' +
      '      <p class="oc-empty" v-if="!moreList().length">{{ altQuery ? T.moreNothing : T.noSuggestion }}</p>' +
      '      <p class="oc-modal-foot"><button type="button" class="oc-btn" @click="closeMore">{{ T.close }}</button></p>' +
      '    </div>' +
      '  </div>' +

      // ---- price history dialog -----------------------------------------------------------------------
      '  <oc-price-dialog v-if="priceDialog" :name="priceDialog.article.name" :url="priceDialog.url" :currency-unit="cfg.currency_unit" @close="closePrices"></oc-price-dialog>' +
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
