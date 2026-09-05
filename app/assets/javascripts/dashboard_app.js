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
    view: 'View',
    itemsFilled: function (n) { return n + (n === 1 ? ' item' : ' items'); },
    casesToFill: function (n) { return n + (n === 1 ? ' case' : ' cases') + ' to fill'; },
    fullCases: function (n) { return n + ' full ' + (n === 1 ? 'case' : 'cases'); },
    coopTotal: function (a, b) { return 'co-op ' + a + (b ? ' of ' + b : ''); },
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
    reload: 'Reload'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
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

  var DashboardApp = {
    props: { dataUrl: { type: String, required: true } },

    data: function () {
      return {
        state: 'loading',
        errorMessage: null,
        d: null,          // the whole payload
        busy: {},         // task id -> true while an action is in flight
        toast: null,
        now: Date.now(),
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

      badges: function (o) {
        var s = o.stats || {}, out = [], self = this;
        if (s.items_filled != null) out.push({ text: T.itemsFilled(s.items_filled), kind: 'info' });
        if (s.cases_to_fill) out.push({ text: T.casesToFill(s.cases_to_fill), kind: 'warn' });
        if (s.full_cases != null) out.push({ text: T.fullCases(s.full_cases), kind: 'info' });
        if (s.coop_total != null) {
          var other = (s.supplier_total != null && s.supplier_total !== s.coop_total) ? self.money(s.supplier_total) : null;
          out.push({ text: T.coopTotal(self.money(s.coop_total), other), kind: 'dark' });
        }
        if (s.min_order_value != null) {
          out.push(s.min_order_met
            ? { text: T.minMet(self.money(s.min_order_value)), kind: 'ok' }
            : { text: T.minShort(self.money(s.min_order_value)), kind: 'bad' });
        }
        if (s.splits != null) out.push({ text: T.splits(s.splits), kind: 'info' });
        return out;
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

      // ---- hero: greeting + credit ------------------------------------------------
      '  <div class="da-topbar">' +
      '    <span class="da-group" v-if="og">{{ og.name }}</span>' +
      '    <a href="#" class="da-classic" @click.prevent="switchToClassic">{{ T.classic }}</a>' +
      '  </div>' +
      '  <header class="da-hero">' +
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

      // ---- notice board (the wiki's dashboard page) --------------------------------
      '  <section class="da-section" v-if="d.notice">' +
      '    <h2>{{ d.notice.title || T.noticeBoard }} <small v-if="d.notice.url"><a :href="d.notice.url">{{ T.view }}</a></small></h2>' +
      '    <div class="da-card da-wiki" v-html="d.notice.html"></div>' +
      '  </section>' +

      // ---- current orders -----------------------------------------------------------
      '  <section class="da-section" v-if="og">' +
      '    <h2>{{ T.currentOrders }} <small v-if="d.open_orders.length">{{ d.open_orders.length }}</small></h2>' +
      '    <p class="da-empty" v-if="!d.open_orders.length">{{ T.noOpenOrders }}</p>' +
      '    <div class="da-grid">' +
      '    <article class="da-card da-order" v-for="o in d.open_orders" :key="o.id" :class="{ \'is-ordered\': o.my_order }">' +
      '      <div class="da-order-head">' +
      '        <h3>{{ o.name }}</h3>' +
      '        <span class="da-closing" v-if="closing(o)" :class="closing(o).level">{{ closing(o).text }}</span>' +
      '      </div>' +
      '      <p class="da-order-meta">' +
      '        <span v-if="o.ends_human">{{ T.closes }} <strong>{{ o.ends_human }}</strong></span>' +
      '        <span v-if="o.pickup_human">{{ T.pickup }} <strong>{{ o.pickup_human }}</strong></span>' +
      '      </p>' +
      '      <div class="da-note" v-if="o.note_html" v-html="o.note_html"></div>' +
      '      <p class="da-stats"><span v-for="(b, i) in badges(o)" :key="i" :class="b.kind">{{ b.text }}</span></p>' +
      '      <div class="da-order-foot">' +
      '        <div class="da-mine" v-if="o.my_order">' +
      '          <strong>{{ money(o.my_order.price) }}</strong>' +
      '          <small>{{ T.savedBy(o.my_order.updated_by, o.my_order.updated_on_human) }}</small>' +
      '        </div>' +
      '        <div class="da-mine none" v-else>{{ T.notOrdered }}</div>' +
      '        <a class="da-btn da-btn-primary" :href="orderUrl(o)" v-if="o.urls.order">{{ T.order }}</a>' +
      '      </div>' +
      '    </article>' +
      '    </div>' +
      '  </section>' +

      // ---- tasks ------------------------------------------------------------------------
      '  <section class="da-section" v-if="hasTasks">' +
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

      // ---- newest public messages ------------------------------------------------------------
      '  <section class="da-section" v-if="d.messages && d.messages.list.length">' +
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
      '  <section class="da-section" v-if="og && d.finished_orders.length">' +
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
      '  <section class="da-section" v-if="og && d.closed_orders && d.closed_orders.length">' +
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

      // ---- apple points ---------------------------------------------------------------------
      '  <section class="da-section" v-if="d.apples">' +
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
      '  <section class="da-section" v-if="og">' +
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

      // ---- shortcuts ------------------------------------------------------------------------------
      '  <section class="da-section" v-if="d.quick_links.length || d.wiki_links_html">' +
      '    <h2>{{ T.quickLinks }}</h2>' +
      '    <div class="da-card da-wiki da-wiki-links" v-if="d.wiki_links_html" v-html="d.wiki_links_html"></div>' +
      '    <div class="da-links">' +
      '      <div class="da-linkgroup" v-for="g in d.quick_links" :key="g.title">' +
      '        <span class="da-label">{{ g.title }}</span>' +
      '        <a class="da-chip link" v-for="l in g.items" :key="l.url" :href="l.url">{{ l.label }}</a>' +
      '      </div>' +
      '    </div>' +
      '  </section>' +

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
