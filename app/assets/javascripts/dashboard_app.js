// Modern, mobile-first dashboard (Vue 3).
//
// Mounted on #dashboard-app (app/views/dashboard/show.html.haml). All data comes
// from the JSON endpoint in data-url (DashboardSerializer). Read-mostly: the only
// writes are the task accept/decline/done buttons, which POST to the existing
// TasksController actions and then reload the data.
//
// Members opt in/out with localStorage[foodsoft.ui] = 'modern'|'legacy' (shared by all modern pages).
// The classic home page redirects here when it says 'modern' (dashboard/_legacy_switch).
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

  var T = {
    hi: function (name) { return 'Hi ' + name; },
    availableCredit: 'Available credit',
    accountBalance: 'Account balance',
    balanceLine: function (balance, open, finished) {
      var parts = ['Balance ' + balance];
      if (open) parts.push(open + ' in current orders');
      if (finished) parts.push(finished + ' awaiting settlement');
      return parts.join(' · ');
    },
    lowCredit: function (threshold) { return 'Your credit is below ' + threshold + '. Please deposit funds soon or you may not be able to order.'; },
    creditOk: 'Thanks for keeping your account topped up.',
    statement: 'Account statement',
    howToPay: 'How to pay',
    updated: function (when) { return 'Last transaction ' + when; },
    notEnoughApples: 'Your ordergroup does not have enough apple points to place orders right now.',
    noticeBoard: 'Notice board',
    wikiLinks: 'Wiki',
    messages: 'Newest messages',
    allMessages: 'All messages',
    threads: 'Threads',
    newMessage: 'New message',
    reply: 'Reply',
    currentOrders: 'Current orders',
    noOpenOrders: 'There are no current orders.',
    closesIn: function (s) { return 'closes in ' + s; },
    closesSoon: 'closing soon',
    pastClosing: 'past closing time',
    closes: 'Closes',
    pickup: 'Pickup',
    yourOrder: 'Your order',
    notOrdered: 'Not ordered yet',
    savedBy: function (who, when) { return 'saved by ' + who + ', ' + when; },
    order: 'Order',
    orderAll: 'Order from all at once',
    view: 'View',
    casesToFill: function (n) { return n + (n === 1 ? ' case' : ' cases') + ' to fill'; },
    fullCases: function (n) { return n + ' full ' + (n === 1 ? 'case' : 'cases'); },
    groupTotal: 'Group total',
    ofSupplier: function (b) { return 'of ' + b; },
    minMet: function (m) { return m + ' minimum met'; },
    minShort: function (m) { return m + ' minimum not met'; },
    splits: function (n) { return n + ' splits'; },
    tasks: 'Tasks',
    toAccept: 'Waiting for your answer',
    myTasks: 'Your upcoming tasks',
    openTasks: 'Help wanted',
    allTasks: 'All tasks',
    accept: 'Accept',
    decline: 'Decline',
    take: 'Take this task',
    markDone: 'Mark done',
    peopleNeeded: function (n) { return n + (n === 1 ? ' more person needed' : ' more people needed'); },
    due: 'Due',
    finishedOrders: 'Awaiting settlement',
    finishedHint: 'Closed orders that have not been settled yet.',
    closedOrders: 'Settled orders',
    allOrders: 'All past orders',
    recentTransactions: 'Recent transactions',
    noTransactions: 'No transactions yet.',
    quickLinks: 'Shortcuts',
    apples: 'Engagement of your ordergroup',
    applePoints: function (p) { return 'Apple points: ' + p; },
    appleDesc: function (a) { return 'For every ' + a + ' of orders, your group should do one task.'; },
    appleWarning: function (t) { return 'Below ' + t + ' points you are not allowed to order.'; },
    moreInfo: 'More information',
    classic: 'Classic view',
    refresh: 'Refresh',
    loadError: 'Could not load the dashboard. Your session may have expired.',
    actionError: 'That did not work. Please try again.',
    reload: 'Reload',
    searchPlaceholder: 'Search for an item…',
    clear: 'Clear',
    searchHint: 'Searches the open orders, then recent ones. You can order or change an amount right from the results.',
    searchShort: function (n) { return 'Type at least ' + n + ' letters'; },
    searchNone: 'No items match.',
    inOpenOrders: 'Open orders',
    inRecentOrders: 'Recent orders',
    caseOf: function (n) { return 'case of ' + n; },
    youHave: function (q, t) { return 'You: ' + q + (t ? ', up to ' + (q + t) : ''); },
    youGot: function (n) { return 'You got ' + n; },
    youOrdered: function (q) { return 'You ordered ' + q; },
    change: 'Change',
    addToOrder: 'Order',
    goToItem: 'Go to item',
    done: 'Done',
    autosaving: 'Saving…',
    autosaved: 'Saved',
    unsavedLeave: 'Your last change has not been saved yet.',
    loadingItem: 'Loading…',
    itemGone: 'That item is no longer in the order. Please reload.',
    notEnoughCredit: 'Not enough credit for this change.',
    searchError: 'Search failed. Please try again.'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
  }

  var SEARCH_MIN = 2;
  var AUTOSAVE_DELAY = 800;  // ms after the last change in the quick edit

  // JSON or a thrown {status, body}; the ordering endpoints explain errors in body.message
  function parseJson(r) {
    if ((r.headers.get('content-type') || '').indexOf('json') === -1) throw { status: r.status };
    return r.json().then(function (json) {
      if (!r.ok) throw { status: r.status, body: json };
      return json;
    });
  }

  // what the member pays for an order, as the ordering page's total
  function orderCost(articles, cfg) {
    var sum = 0;
    articles.forEach(function (a) { sum += a.price * (cfg.tolerance_is_costly ? a.quantity + a.tolerance : a.quantity); });
    return sum;
  }

  // "3 days" / "5 hours" / "20 minutes" from a millisecond difference
  function humanDuration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 60) return m + (m === 1 ? ' minute' : ' minutes');
    var h = Math.round(m / 60);
    if (h < 48) return h + (h === 1 ? ' hour' : ' hours');
    var d = Math.round(h / 24);
    return d + (d === 1 ? ' day' : ' days');
  }

  // the ordering page's item card (ordering_app.js, loaded first in application.js)
  var ArticleCard = window.FoodsoftOrdering && window.FoodsoftOrdering.ArticleCard;

  var DashboardApp = {
    components: ArticleCard ? { 'oa-article-card': ArticleCard } : {},

    props: { dataUrl: { type: String, required: true } },

    data: function () {
      return {
        state: 'loading',
        errorMessage: null,
        d: null,          // the whole payload
        busy: {},         // task id -> true while an action is in flight
        toast: null,
        now: Date.now(),
        q: '',            // item search
        search: null,     // {query, open: [], recent: []} for the last answered query
        searching: false,
        searchError: false,
        edit: null,       // quick edit: {id, hit, loading} then the loaded card (see startEdit)
        T: T
      };
    },

    computed: {
      cfg: function () { return (this.d && this.d.config) || {}; },
      og: function () { return this.d && this.d.ordergroup; },
      hasTasks: function () {
        var t = this.d && this.d.tasks;
        return t && (t.mine.length || t.to_accept.length || t.open.length);
      },
      creditValue: function () {
        if (!this.og) return null;
        return this.cfg.charge_members_manually ? this.og.account_balance : this.og.available_funds;
      }
    },

    created: function () {
      var self = this;
      this.load();
      setInterval(function () { self.now = Date.now(); }, 60000);
      window.addEventListener('beforeunload', function (e) {
        var ed = self.edit;
        if (ed && (ed.dirty || ed.saving)) {
          e.preventDefault();
          e.returnValue = T.unsavedLeave;
          return T.unsavedLeave;
        }
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
          .then(function (json) { self.d = json; self.state = 'ready'; })
          .catch(function () { self.state = 'error'; self.errorMessage = T.loadError; });
      },

      // POST to one of the classic TasksController actions, then refresh
      taskAction: function (task, url) {
        var self = this;
        var token = document.querySelector('meta[name="csrf-token"]');
        this.busy[task.id] = true;
        fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'X-CSRF-Token': token ? token.getAttribute('content') : '', 'Accept': 'text/html,application/json' }
        })
          .then(function (r) { if (!r.ok) throw new Error('failed'); })
          .then(function () { self.reloadQuiet(); })
          .catch(function () { self.notify('error', T.actionError); })
          .then(function () { delete self.busy[task.id]; });
      },

      reloadQuiet: function () {
        var self = this;
        fetch(this.dataUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { return r.json(); })
          .then(function (json) { self.d = json; })
          .catch(function () { /* keep what we have */ });
      },

      notify: function (type, text) {
        var self = this;
        this.toast = { type: type, text: text };
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(function () { self.toast = null; }, 4000);
      },

      switchToClassic: function () {
        writeUiPref('legacy');
        window.location.href = this.d.urls.legacy;
      },

      money: function (v) { return money(v, this.cfg.currency_unit); },

      // ---- item search ----------------------------------------------------------
      onSearch: function () {
        var self = this;
        clearTimeout(this._searchTimer);
        this.closeEdit();
        if (this.q.length < SEARCH_MIN) { this.search = null; this.searching = false; return; }
        this.searching = true;
        this._searchTimer = setTimeout(function () { self.runSearch(); }, 300);
      },

      runSearch: function () {
        var self = this, query = this.q;
        var seq = this._searchSeq = (this._searchSeq || 0) + 1;
        fetch(this.d.urls.search + '?q=' + encodeURIComponent(query), { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(parseJson)
          .then(function (json) {
            if (seq !== self._searchSeq) return;
            self.search = json; self.searchError = false; self.searching = false;
          })
          .catch(function () {
            if (seq !== self._searchSeq) return;
            self.searchError = true; self.searching = false;
          });
      },

      clearSearch: function () {
        this.q = '';
        this.onSearch();
        if (this.$refs.search) this.$refs.search.focus();
      },

      hitUrl: function (h) {
        return (readUiPref() === 'modern' && h.urls.order_modern) ? h.urls.order_modern : h.urls.order;
      },

      hitMeta: function (h) {
        var parts = [];
        if (h.manufacturer) parts.push(h.manufacturer);
        if (h.price != null) parts.push(this.money(h.price) + (h.unit ? ' / ' + h.unit : ''));
        if (h.unit_quantity > 1) parts.push(T.caseOf(h.unit_quantity));
        return parts.join(' · ');
      },

      // Load the order's snapshot so the ordering page's own item card can edit
      // this article (amount, "up to", case progress, what you get).
      startEdit: function (h) {
        var self = this;
        this.closeEdit();
        this.edit = { id: h.id, hit: h, loading: true };
        fetch(h.urls.data, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(parseJson)
          .then(function (snap) {
            if (!self.edit || self.edit.id !== h.id) return;
            var cfg = snap.config || {}, all = [], target = null;
            (snap.categories || []).forEach(function (c) { c.articles.forEach(function (a) {
              // the card expects what OrderingApp#wrapOrder adds
              a.order_id = snap.order.id; a.stockit = !!snap.order.stockit;
              all.push(a);
              if (a.id === h.id) target = a;
            }); });
            if (!target) throw { body: { message: T.itemGone } };
            self.edit = {
              id: h.id, hit: h, snap: snap, a: target, cfg: cfg,
              before: orderCost(all, cfg),  // cost of what the server has, for the credit rule
              dirty: false,                 // changed since the last save was sent
              saving: false,
              again: false,                 // changed while a save was in flight
              status: '',                   // '' | pending | saving | saved | credit | error
              errorMessage: null
            };
          })
          .catch(function (err) {
            self.edit = null;
            self.notify('error', (err && err.body && err.body.message) || T.actionError);
          });
      },

      // Close the card; a change still waiting for its autosave goes out now.
      closeEdit: function () {
        var e = this.edit;
        clearTimeout(this._saveTimer);
        if (e && e.snap && e.dirty && e.status === 'pending') this.saveEdit(e);
        this.edit = null;
      },

      snapArticles: function (snap) {
        var out = [];
        (snap.categories || []).forEach(function (c) { c.articles.forEach(function (a) { out.push(a); }); });
        return out;
      },

      // credit left after the edited order, as the ordering page's footer shows it
      editBalance: function (e) {
        if (!e || !e.snap) return null;
        var funds = e.snap.funds || {};
        var base = e.cfg.charge_members_manually ? funds.account_balance : funds.available_funds;
        return base == null ? null : base - orderCost(this.snapArticles(e.snap), e.cfg);
      },

      // the ordering page refuses to save below the minimum; reducing is always fine here
      editBalanceOk: function (e) {
        var bal = this.editBalance(e);
        if (bal == null || bal >= (e.cfg.minimum_balance || 0)) return true;
        return orderCost(this.snapArticles(e.snap), e.cfg) <= e.before;
      },

      // Every change saves itself shortly after the last click.
      editChanged: function () {
        var self = this, e = this.edit;
        if (!e || !e.snap) return;
        e.dirty = true;
        clearTimeout(this._saveTimer);
        if (!this.editBalanceOk(e)) { e.status = 'credit'; return; }
        e.status = 'pending';
        this._saveTimer = setTimeout(function () { self.saveEdit(e); }, AUTOSAVE_DELAY);
      },

      // Save the whole order with this one article changed: OrderingController#update
      // zeroes any article left out. One save at a time; changes made meanwhile follow.
      saveEdit: function (e) {
        var self = this, h = e.hit;
        if (!e.dirty || !this.editBalanceOk(e)) return;
        if (e.saving) { e.again = true; return; }
        var token = document.querySelector('meta[name="csrf-token"]');
        var articles = this.snapArticles(e.snap);
        var cost = orderCost(articles, e.cfg);
        e.saving = true; e.dirty = false; e.status = 'saving';
        fetch(h.urls.save, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': token ? token.getAttribute('content') : ''
          },
          body: JSON.stringify({
            lock_version: e.snap.group_order.lock_version,
            articles: articles.map(function (a) { return { id: a.id, quantity: a.quantity, tolerance: a.tolerance }; })
          })
        })
          .then(parseJson)
          .then(function (json) {
            // keep the member's edits, take the server's version and funds for the next save
            e.snap.group_order = json.group_order;
            e.snap.funds = json.funds;
            e.before = cost;
            self.snapArticles(json).forEach(function (a) {
              if (a.id === h.id) { h.quantity = a.quantity; h.tolerance = a.tolerance; }
            });
            e.status = e.dirty ? 'pending' : 'saved';
            self.reloadQuiet();  // order totals and credit changed
          })
          .catch(function (err) {
            e.dirty = true;
            e.again = false;
            e.status = 'error';
            e.errorMessage = (err && err.body && err.body.message) || T.actionError;
            if (self.edit !== e) self.notify('error', e.errorMessage);
          })
          .then(function () {
            e.saving = false;
            if (e.again) { e.again = false; self.saveEdit(e); }
          });
      },

      // members who opted into the modern ordering page go straight there
      orderUrl: function (o) {
        return (readUiPref() === 'modern' && o.urls.order_modern) ? o.urls.order_modern : o.urls.order;
      },

      closing: function (o) {
        if (!o.ends) return null;
        var diff = new Date(o.ends).getTime() - this.now;
        if (diff < 0) return { text: T.pastClosing, level: 'past' };
        if (diff < 6 * 3600000) return { text: T.closesIn(humanDuration(diff)), level: 'urgent' };
        if (diff < 48 * 3600000) return { text: T.closesIn(humanDuration(diff)), level: 'soon' };
        return { text: T.closesIn(humanDuration(diff)), level: 'normal' };
      },

      dueLevel: function (t) {
        if (!t.due_date) return '';
        var diff = new Date(t.due_date).getTime() - this.now;
        return diff < 0 ? 'past' : (diff < 2 * 86400000 ? 'soon' : '');
      },

      // case figures under the group total (the item count is deliberately left out)
      badges: function (o) {
        var s = o.stats || {}, out = [];
        if (s.cases_to_fill) out.push({ text: T.casesToFill(s.cases_to_fill), kind: 'warn' });
        if (s.full_cases != null) out.push({ text: T.fullCases(s.full_cases), kind: 'info' });
        if (s.splits != null) out.push({ text: T.splits(s.splits), kind: 'info' });
        return out;
      },
      // the group total with the supplier total and minimum-order status
      groupTotal: function (o) {
        var s = o.stats || {};
        if (s.coop_total == null) return null;
        var t = { amount: this.money(s.coop_total), notes: [] };
        if (s.supplier_total != null && s.supplier_total !== s.coop_total) t.notes.push({ text: T.ofSupplier(this.money(s.supplier_total)) });
        if (s.min_order_value != null) {
          t.notes.push(s.min_order_met
            ? { text: T.minMet(this.money(s.min_order_value)), kind: 'ok' }
            : { text: T.minShort(this.money(s.min_order_value)), kind: 'bad' });
        }
        return t;
      }
    },

    template:
      '<div class="da">' +

      '  <div class="da-state" v-if="state === \'loading\'"><span class="da-spinner"></span></div>' +
      '  <div class="da-state" v-else-if="state === \'error\'">' +
      '    <div class="da-alert da-alert-danger">{{ errorMessage }}</div>' +
      '    <button type="button" class="da-btn" @click="load">{{ T.reload }}</button>' +
      '  </div>' +

      '  <template v-else>' +

      // ---- top bar ----------------------------------------------------------------------
      '  <div class="da-topbar">' +
      '    <span class="da-group" v-if="og">{{ og.name }}</span>' +
      '    <a href="#" class="da-classic" @click.prevent="switchToClassic">{{ T.classic }}</a>' +
      '  </div>' +
      // Two columns on desktop: account and tasks on the left, orders on the right.
      // On phones the wrappers dissolve (display: contents) and each section's
      // `order` sets the sequence, so tasks can come first.
      '  <div class="da-body">' +
      '  <div class="da-side">' +
      // ---- credit ---------------------------------------------------------------------
      '  <header class="da-hero da-o-hero">' +
      '    <div class="da-credit" v-if="og" :class="og.credit_ok ? \'ok\' : \'low\'">' +
      '      <span class="da-label">{{ cfg.charge_members_manually ? T.accountBalance : T.availableCredit }}</span>' +
      '      <strong class="da-credit-value">{{ money(creditValue) }}</strong>' +
      '      <small class="da-credit-detail">{{ T.balanceLine(money(og.account_balance), og.value_of_open_orders ? money(og.value_of_open_orders) : null, og.value_of_finished_orders ? money(og.value_of_finished_orders) : null) }}</small>' +
      '      <p class="da-credit-msg">{{ og.credit_ok ? T.creditOk : T.lowCredit(money(og.low_credit_threshold)) }}</p>' +
      '      <div class="da-hero-actions">' +
      '        <a class="da-btn da-btn-small" :href="og.urls.statement">{{ T.statement }}</a>' +
      '        <a class="da-btn da-btn-small" :href="og.urls.payments" v-if="og.urls.payments">{{ T.howToPay }}</a>' +
      '      </div>' +
      '    </div>' +
      '    <div class="da-alert da-alert-warning" v-if="og && og.not_enough_apples">{{ T.notEnoughApples }}</div>' +
      '  </header>' +

      // ---- shortcuts ------------------------------------------------------------------------------
      '  <section class="da-section da-o-links" v-if="d.quick_links.length || d.wiki_links_html">' +
      '    <h2>{{ T.quickLinks }}</h2>' +
      '    <div class="da-card da-wiki da-wiki-links" v-if="d.wiki_links_html" v-html="d.wiki_links_html"></div>' +
      '    <div class="da-links">' +
      '      <div class="da-linkgroup" v-for="g in d.quick_links" :key="g.title">' +
      '        <span class="da-label">{{ g.title }}</span>' +
      '        <a class="da-chip link" v-for="l in g.items" :key="l.url" :href="l.url">{{ l.label }}</a>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

      // ---- tasks ------------------------------------------------------------------------
      '  <section class="da-section da-o-tasks" v-if="hasTasks">' +
      '    <h2>{{ T.tasks }} <small><a :href="d.urls.tasks">{{ T.allTasks }}</a></small></h2>' +
      '    <div class="da-card da-tasks" v-if="d.tasks.to_accept.length">' +
      '      <h4>{{ T.toAccept }}</h4>' +
      '      <div class="da-task" v-for="t in d.tasks.to_accept" :key="\'a\' + t.id">' +
      '        <div class="da-task-main">' +
      '          <a :href="t.urls.show" class="da-task-title">{{ t.title }}</a>' +
      '          <div class="da-task-meta"><span v-if="t.due_date_human" :class="dueLevel(t)">{{ T.due }} {{ t.due_date_human }}</span><span v-if="t.workgroup">{{ t.workgroup }}</span></div>' +
      '        </div>' +
      '        <div class="da-task-actions">' +
      '          <button type="button" class="da-btn da-btn-small da-btn-primary" :disabled="busy[t.id]" @click="taskAction(t, t.urls.accept)">{{ T.accept }}</button>' +
      '          <button type="button" class="da-btn da-btn-small" :disabled="busy[t.id]" @click="taskAction(t, t.urls.reject)">{{ T.decline }}</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="da-card da-tasks" v-if="d.tasks.mine.length">' +
      '      <h4>{{ T.myTasks }}</h4>' +
      '      <div class="da-task" v-for="t in d.tasks.mine" :key="\'m\' + t.id">' +
      '        <div class="da-task-main">' +
      '          <a :href="t.urls.show" class="da-task-title">{{ t.title }}</a>' +
      '          <div class="da-task-meta"><span v-if="t.due_date_human" :class="dueLevel(t)">{{ T.due }} {{ t.due_date_human }}</span><span v-if="t.workgroup">{{ t.workgroup }}</span></div>' +
      '        </div>' +
      '        <div class="da-task-actions">' +
      '          <button type="button" class="da-btn da-btn-small" :disabled="busy[t.id]" @click="taskAction(t, t.urls.done)">{{ T.markDone }}</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="da-card da-tasks" v-if="d.tasks.open.length">' +
      '      <h4>{{ T.openTasks }}</h4>' +
      '      <div class="da-task" v-for="t in d.tasks.open" :key="\'o\' + t.id">' +
      '        <div class="da-task-main">' +
      '          <a :href="t.urls.show" class="da-task-title">{{ t.title }}</a>' +
      '          <div class="da-task-meta">' +
      '            <span v-if="t.due_date_human" :class="dueLevel(t)">{{ T.due }} {{ t.due_date_human }}</span>' +
      '            <span v-if="t.workgroup">{{ t.workgroup }}</span>' +
      '            <span class="da-needed" v-if="t.still_required > 0">{{ T.peopleNeeded(t.still_required) }}</span>' +
      '          </div>' +
      '        </div>' +
      '        <div class="da-task-actions" v-if="!t.accepted_by_me">' +
      '          <button type="button" class="da-btn da-btn-small da-btn-primary" :disabled="busy[t.id]" @click="taskAction(t, t.urls.accept)">{{ T.take }}</button>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

      // ---- apple points ---------------------------------------------------------------------
      '  <section class="da-section da-o-apples" v-if="d.apples">' +
      '    <h2>{{ T.apples }}</h2>' +
      '    <div class="da-card">' +
      '      <p>{{ T.applePoints(d.apples.points) }}</p>' +
      '      <div class="da-progress"><div class="da-bar" :class="d.apples.bar_state" :style="{ width: d.apples.bar_width + \'%\' }"></div></div>' +
      '      <p class="da-muted">{{ T.appleDesc(money(d.apples.mean_order_amount_per_job)) }} ' +
      '        <strong v-if="d.apples.stop_ordering_under">{{ T.appleWarning(d.apples.stop_ordering_under) }}</strong> ' +
      '        <a :href="d.apples.more_info_url" target="_blank" rel="noopener" v-if="d.apples.more_info_url">{{ T.moreInfo }}</a></p>' +
      '    </div>' +
      '  </section>' +

      // ---- recent transactions ------------------------------------------------------------------
      '  <section class="da-section da-o-tx" v-if="og">' +
      '    <h2>{{ T.recentTransactions }} <small><a :href="og.urls.statement">{{ T.statement }}</a></small></h2>' +
      '    <p class="da-empty" v-if="!d.transactions.length">{{ T.noTransactions }}</p>' +
      '    <div class="da-card da-list" v-else>' +
      '      <div class="da-row" v-for="tx in d.transactions" :key="tx.id">' +
      '        <div class="da-row-main">' +
      '          <div class="da-row-title">{{ tx.note }}</div>' +
      '          <div class="da-row-meta"><span>{{ tx.created_on_human }}</span><span>{{ tx.user }}</span><span v-if="tx.type">{{ tx.type }}</span></div>' +
      '        </div>' +
      '        <div class="da-row-side"><strong :class="tx.amount < 0 ? \'da-bad\' : \'da-ok\'">{{ money(tx.amount) }}</strong></div>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

      '  </div>' +
      '  <div class="da-main">' +
      // ---- item search: open orders first, then recent ones ---------------------------
      '  <section class="da-section da-o-search" v-if="d.urls.search">' +
      '    <div class="da-searchbar">' +
      '      <div class="da-search-field">' +
      '        <input class="da-search" ref="search" type="search" inputmode="search" autocomplete="off" :placeholder="T.searchPlaceholder" v-model.trim="q" @input="onSearch" @keydown.esc="clearSearch">' +
      '        <span class="da-spinner da-spinner-small" v-if="searching"></span>' +
      '      </div>' +
      '      <button type="button" class="da-btn da-search-clear" :disabled="!q" @click="clearSearch">{{ T.clear }}</button>' +
      '    </div>' +
      '    <p class="da-search-hint" v-if="q.length < 2">{{ T.searchHint }}</p>' +
      '    <div class="da-card da-results" v-if="q.length >= 2 && (search || searchError)">' +
      '      <p class="da-empty" v-if="searchError">{{ T.searchError }}</p>' +
      '      <p class="da-empty" v-else-if="!search.open.length && !search.recent.length">{{ T.searchNone }}</p>' +
      '      <template v-else>' +
      '      <h4 v-if="search.open.length">{{ T.inOpenOrders }}</h4>' +
      '      <div class="da-hit" v-for="h in search.open" :key="\'o\' + h.id" :class="{ \'is-mine\': h.quantity || h.tolerance, \'is-editing\': edit && edit.id === h.id }">' +
      // the open item card repeats all of this, so it is hidden while the card is open
      '        <div class="da-hit-main" v-if="!edit || edit.id !== h.id">' +
      '          <a class="da-hit-title" :href="hitUrl(h)" v-if="h.urls.order">{{ h.name }}<small v-if="h.origin"> ({{ h.origin }})</small></a>' +
      '          <span class="da-hit-title" v-else>{{ h.name }}</span>' +
      '          <div class="da-row-meta"><span>{{ h.order.name }}</span><span v-if="hitMeta(h)">{{ hitMeta(h) }}</span></div>' +
      '          <div class="da-hit-note" v-if="h.note">{{ h.note }}</div>' +
      '        </div>' +
      '        <div class="da-hit-side" v-if="!edit || edit.id !== h.id">' +
      '          <span class="da-hit-mine" v-if="h.quantity || h.tolerance">{{ T.youHave(h.quantity, h.tolerance) }}</span>' +
      '          <button type="button" class="da-btn da-btn-small" :class="{ \'da-btn-primary\': !h.quantity && !h.tolerance }" v-if="h.urls.save" @click="startEdit(h)">{{ h.quantity || h.tolerance ? T.change : T.addToOrder }}</button>' +
      '          <a class="da-btn da-btn-small" :href="hitUrl(h)" v-if="h.urls.order">{{ T.goToItem }}</a>' +
      '        </div>' +
      '        <div class="da-quickedit" v-else>' +
      '          <p class="da-muted" v-if="edit.loading"><span class="da-spinner da-spinner-small"></span> {{ T.loadingItem }}</p>' +
      '          <template v-else>' +
      '          <div class="oa oa-embed"><oa-article-card :a="edit.a" :cfg="edit.cfg" @change="editChanged"></oa-article-card></div>' +
      '          <div class="da-quickedit-foot">' +
      '            <span class="da-quickedit-credit" :class="editBalanceOk(edit) ? \'da-ok\' : \'da-bad\'" v-if="editBalance(edit) != null">{{ cfg.charge_members_manually ? T.accountBalance : T.availableCredit }} {{ money(editBalance(edit)) }}</span>' +
      '            <span class="da-autosave" :class="edit.status" role="status">' +
      '              <template v-if="edit.status === \'pending\' || edit.status === \'saving\'"><span class="da-spinner da-spinner-small"></span> {{ T.autosaving }}</template>' +
      '              <template v-else-if="edit.status === \'saved\'">&#10003; {{ T.autosaved }}</template>' +
      '              <template v-else-if="edit.status === \'credit\'">{{ T.notEnoughCredit }}</template>' +
      '              <template v-else-if="edit.status === \'error\'">{{ edit.errorMessage }} <button type="button" class="da-linkbtn" @click="startEdit(edit.hit)">{{ T.reload }}</button></template>' +
      '            </span>' +
      '            <button type="button" class="da-btn da-btn-small" @click="closeEdit">{{ T.done }}</button>' +
      '          </div>' +
      '          </template>' +
      '        </div>' +
      '      </div>' +
      '      <h4 v-if="search.recent.length">{{ T.inRecentOrders }}</h4>' +
      '      <component :is="h.urls.show ? \'a\' : \'div\'" class="da-hit da-hit-past" v-for="h in search.recent" :key="\'r\' + h.id" :href="h.urls.show" :class="{ \'is-mine\': h.quantity || h.tolerance }">' +
      '        <div class="da-hit-main">' +
      '          <span class="da-hit-title">{{ h.name }}<small v-if="h.origin"> ({{ h.origin }})</small></span>' +
      '          <div class="da-row-meta"><span>{{ h.order.name }}</span><span v-if="h.order.pickup_human || h.order.ends_human">{{ h.order.pickup_human || h.order.ends_human }}</span><span v-if="hitMeta(h)">{{ hitMeta(h) }}</span></div>' +
      '          <div class="da-hit-note" v-if="h.note">{{ h.note }}</div>' +
      '        </div>' +
      '        <div class="da-hit-side">' +
      '          <span class="da-hit-mine" v-if="h.result != null && (h.quantity || h.tolerance)">{{ T.youGot(h.result) }}</span>' +
      '          <span class="da-hit-mine" v-else-if="h.quantity">{{ T.youOrdered(h.quantity) }}</span>' +
      '        </div>' +
      '      </component>' +
      '      </template>' +
      '    </div>' +
      '  </section>' +

      // ---- notice board (the wiki's dashboard page) --------------------------------
      '  <section class="da-section da-o-notice" v-if="d.notice">' +
      '    <h2>{{ d.notice.title || T.noticeBoard }} <small v-if="d.notice.url"><a :href="d.notice.url">{{ T.view }}</a></small></h2>' +
      '    <div class="da-card da-wiki" v-html="d.notice.html"></div>' +
      '  </section>' +

      // ---- current orders -----------------------------------------------------------
      '  <section class="da-section da-o-orders" v-if="og">' +
      '    <h2>{{ T.currentOrders }} <small v-if="d.open_orders.length">{{ d.open_orders.length }}</small>' +
      '      <a class="da-btn da-btn-small da-btn-primary da-orderall" :href="d.urls.ordering_all" v-if="d.open_orders.length > 1 && d.urls.ordering_all">{{ T.orderAll }}</a></h2>' +
      '    <p class="da-empty" v-if="!d.open_orders.length">{{ T.noOpenOrders }}</p>' +
      '    <div class="da-grid">' +
      '    <article class="da-card da-order" v-for="o in d.open_orders" :key="o.id" :class="{ \'is-ordered\': o.my_order, \'has-note\': o.note_html }">' +
      '      <div class="da-order-head">' +
      '        <h3>{{ o.name }}</h3>' +
      '        <span class="da-closing" v-if="closing(o)" :class="closing(o).level">{{ closing(o).text }}</span>' +
      '      </div>' +
      '      <div class="da-note" v-if="o.note_html" v-html="o.note_html"></div>' +
      '      <p class="da-order-meta">' +
      '        <span v-if="o.ends_human">{{ T.closes }} <strong>{{ o.ends_human }}</strong></span>' +
      '        <span v-if="o.pickup_human">{{ T.pickup }} <strong>{{ o.pickup_human }}</strong></span>' +
      '      </p>' +
      '      <div class="da-order-foot">' +
      // the whole group's figures in one quiet box: total, minimum, cases
      '        <div class="da-group-total" v-if="groupTotal(o) || badges(o).length">' +
      '          <span class="da-label">{{ T.groupTotal }}</span>' +
      '          <div v-if="groupTotal(o)"><strong>{{ groupTotal(o).amount }}</strong>' +
      '            <small v-if="groupTotal(o).notes.length"><span v-for="(n, i) in groupTotal(o).notes" :key="i" :class="n.kind">{{ n.text }}</span></small></div>' +
      '          <p class="da-stats" v-if="badges(o).length"><span v-for="(b, i) in badges(o)" :key="i" :class="b.kind">{{ b.text }}</span></p>' +
      '        </div>' +
      // your amount with the Order button always to its right
      '        <div class="da-order-act">' +
      '          <div class="da-mine" v-if="o.my_order">' +
      '            <span class="da-label">{{ T.yourOrder }}</span>' +
      '            <strong>{{ money(o.my_order.price) }}</strong>' +
      '            <small>{{ T.savedBy(o.my_order.updated_by, o.my_order.updated_on_human) }}</small>' +
      '          </div>' +
      '          <div class="da-mine none" v-else>{{ T.notOrdered }}</div>' +
      '          <a class="da-btn da-btn-primary" :href="orderUrl(o)" v-if="o.urls.order">{{ T.order }}</a>' +
      '        </div>' +
      '      </div>' +
      '    </article>' +
      '    </div>' +
      '  </section>' +

      // ---- newest public messages ------------------------------------------------------------
      '  <section class="da-section da-o-messages" v-if="d.messages && d.messages.list.length">' +
      '    <h2>{{ T.messages }} <small><a :href="d.messages.urls.all">{{ T.allMessages }}</a> · <a :href="d.messages.urls.threads">{{ T.threads }}</a></small></h2>' +
      '    <div class="da-card da-list">' +
      '      <div class="da-row" v-for="m in d.messages.list" :key="m.id">' +
      '        <div class="da-row-main">' +
      '          <a class="da-row-title" :href="m.urls.show">{{ m.subject }}</a>' +
      '          <div class="da-row-meta"><span>{{ m.sender }}</span><span>{{ m.created_at_human }}</span></div>' +
      '        </div>' +
      '        <div class="da-row-side"><a class="da-btn da-btn-small" :href="m.urls.reply">{{ T.reply }}</a></div>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

      // ---- finished, not yet settled --------------------------------------------------------
      '  <section class="da-section da-o-finished" v-if="og && d.finished_orders.length">' +
      '    <h2>{{ T.finishedOrders }} <small>{{ T.finishedHint }}</small></h2>' +
      '    <div class="da-card da-list">' +
      '      <a class="da-row" v-for="o in d.finished_orders" :key="o.id" :href="o.urls.show || d.urls.orders">' +
      '        <div class="da-row-main">' +
      '          <div class="da-row-title">{{ o.name }}</div>' +
      '          <div class="da-row-meta"><span v-if="o.pickup_human">{{ T.pickup }} {{ o.pickup_human }}</span><span v-if="o.ends_human">{{ T.closes }} {{ o.ends_human }}</span></div>' +
      '        </div>' +
      '        <div class="da-row-side"><strong v-if="o.my_order">{{ money(o.my_order.price) }}</strong><span class="da-muted" v-else>—</span></div>' +
      '      </a>' +
      '    </div>' +
      '  </section>' +

      // ---- settled orders (the orders overview page shows these too) ---------------------------
      '  <section class="da-section da-o-closed" v-if="og && d.closed_orders && d.closed_orders.length">' +
      '    <h2>{{ T.closedOrders }} <small><a :href="d.urls.orders_archive">{{ T.allOrders }}</a></small></h2>' +
      '    <div class="da-card da-list">' +
      '      <a class="da-row" v-for="o in d.closed_orders" :key="o.id" :href="o.urls.show || d.urls.orders_archive" :class="{ \'da-row-muted\': !o.my_order }">' +
      '        <div class="da-row-main">' +
      '          <div class="da-row-title">{{ o.name }}</div>' +
      '          <div class="da-row-meta"><span v-if="o.pickup_human">{{ T.pickup }} {{ o.pickup_human }}</span><span v-if="o.ends_human">{{ T.closes }} {{ o.ends_human }}</span></div>' +
      '        </div>' +
      '        <div class="da-row-side"><strong v-if="o.my_order">{{ money(o.my_order.price) }}</strong><span class="da-muted" v-else>—</span></div>' +
      '      </a>' +
      '    </div>' +
      '  </section>' +

      '  </div>' +
      '  </div>' +

      '  <footer class="da-foot">' +
      '    <button type="button" class="da-linkbtn" @click="load">{{ T.refresh }}</button>' +
      '  </footer>' +

      '  </template>' +

      '  <div class="da-toast" :class="toast.type" v-if="toast" @click="toast = null">{{ toast.text }}</div>' +
      '</div>'
  };

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    document.addEventListener('click', function (e) {
      var link = e.target.closest ? e.target.closest('[data-fs-ui]') : null;
      if (!link) return;
      writeUiPref(link.getAttribute('data-fs-ui'));
    });

    var el = document.getElementById('dashboard-app');
    if (!el) return;
    if (!window.Vue) {
      el.innerHTML = '<div class="alert alert-danger">Vue failed to load.</div>';
      return;
    }
    writeUiPref('modern');
    Vue.createApp(DashboardApp, { dataUrl: el.getAttribute('data-url') }).mount(el);
  });
})();
