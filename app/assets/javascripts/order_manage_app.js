// Modern order management page (Vue 3) for people with the orders or pickups
// role: the same three views as OrdersController#show (summary, by member, by
// article) as cards with search, plus the action buttons and comments.
// Plain ES5 on purpose (the production Uglifier is ES5 only).
//
// Mounted on #order-manage-app (app/views/order_manage/show.html.haml). The
// JSON at data-url comes from OrderManageSerializer. Comments and result
// changes are sent to the existing OrderCommentsController and
// GroupOrderArticlesController (both answer with JS snippets, which we ignore
// and simply reload the data afterwards). Actions such as "Close!" submit a
// hidden form to the existing OrdersController routes.
(function () {
  'use strict';

  var STORAGE_KEY = 'foodsoft.ui';
  var OLD_KEYS = ['foodsoft.ordering.ui', 'foodsoft.dashboard.ui'];
  var VIEW_KEY = 'foodsoft.manage.view';

  function writeUiPref(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
      OLD_KEYS.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  // All user-facing strings in one place so they can be moved to I18n later.
  var T = {
    back: 'Orders',
    classic: 'Classic view',
    loading: 'Loading…',
    loadFailed: 'The order could not be loaded.',
    reload: 'Reload',
    openedBy: function (who) { return 'opened by ' + who; },
    openFrom: function (a) { return 'open from ' + a; },
    until: function (b) { return 'until ' + b; },
    pickup: function (d) { return 'pickup ' + d; },
    sentOn: function (when) { return 'sent to the supplier ' + when; },
    notSent: 'not sent to the supplier yet',
    note: 'Note',
    households: 'Households',
    articles: 'Articles',
    net: 'Net',
    gross: 'Gross',
    // actions
    close: 'Close order',
    closeTitle: function (name) { return 'Close ' + name + '?'; },
    closeBody: 'Members can no longer change their orders once it is closed. There is no going back.',
    closeConfirm: 'Close it',
    stockOrder: 'Stock order',
    edit: 'Edit',
    swap: 'Swap articles',
    send: 'Send to supplier',
    sendAgainTitle: 'Send again?',
    sendAgainBody: function (when) { return 'The order was already sent to the supplier ' + when + '. Send it again?'; },
    sendConfirm: 'Send it',
    receive: 'Receive',
    downloads: 'Download',
    invoice: 'Show invoice',
    newInvoice: 'Add invoice',
    caseReport: 'Case report',
    del: 'Delete',
    delTitle: 'Delete this order?',
    delBody: 'The order and everything members ordered in it will be removed.',
    delConfirm: 'Delete it',
    cancel: 'Cancel',
    // toolbar
    search: 'Search for something…',
    summary: 'Summary',
    byMember: 'Members',
    byArticle: 'Articles',
    showUnordered: 'Show items nobody is getting',
    unorderedCount: function (n) { return n + ' hidden'; },
    nothing: 'Nothing matches.',
    // summary
    wanted: function (q, t) { return t > 0 ? q + ' + ' + t : String(q); },
    wantedLabel: 'wanted',
    unitsLabel: 'cases',
    casesOf: function (n, size) { return n + ' × ' + size; },
    pricesLabel: 'net / gross / supplier',
    full: 'full',
    short: function (n) { return n + ' short'; },
    unused: 'not enough for a case',
    nobody: 'nobody wants it',
    stockUnits: 'units',
    summaryTotal: 'Total net / gross',
    summaryCount: function (n) { return n + (n === 1 ? ' article ordered' : ' articles ordered'); },
    // members / articles
    ordered: 'ordered',
    received: 'received',
    result: 'gets',
    total: 'total',
    cost: 'Cost',
    savedBy: function (who, when) { return who + ', ' + when; },
    nothingOrdered: 'Nothing ordered.',
    noHouseholds: 'No household ordered this.',
    caseLine: function (units, size, unit) {
      return units + (units === 1 ? ' case' : ' cases') + ' ordered, ' + (units * size) + ' × ' + unit + ' in total';
    },
    addHousehold: 'Add household',
    addHouseholdTitle: function (name) { return 'Give a household ' + name; },
    household: 'Household',
    amount: 'Amount',
    save: 'Save',
    saving: 'Saving…',
    // comments
    comments: 'Comments',
    noComments: 'No comments yet.',
    commentPlaceholder: 'Write a comment…',
    addComment: 'Add comment',
    commentTooShort: 'A comment needs at least 3 characters.',
    saveFailed: 'That could not be saved.',
    saved: 'Saved.'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
  }

  function csrfToken() {
    var m = document.querySelector('meta[name="csrf-token"]');
    return m ? m.getAttribute('content') : '';
  }

  // Submit a hidden form, the way rails-ujs does for data-method links.
  function submitForm(url, method) {
    var form = document.createElement('form');
    form.method = 'post';
    form.action = url;
    var add = function (name, value) {
      var input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };
    if (method && method.toLowerCase() !== 'post') add('_method', method);
    add('authenticity_token', csrfToken());
    document.body.appendChild(form);
    form.submit();
  }

  // Form-encoded XHR to one of the classic JS endpoints. The response body is
  // a JS snippet meant for the classic page; we only care whether it worked.
  function postForm(url, method, fields) {
    var body = Object.keys(fields).map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(fields[k]);
    }).join('&');
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/javascript, application/json, */*',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRF-Token': csrfToken()
      },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r;
    });
  }

  function norm(s) { return (s || '').toString().toLowerCase(); }

  // used / partused / unused / unavailable, as OrdersHelper#order_article_class
  function articleState(a) {
    if (a.units > 0) return a.missing_units === 0 ? 'used' : 'partused';
    if (a.quantity > 0) return 'unused';
    return 'unavailable';
  }

  var OrderManageApp = {
    props: { dataUrl: String },

    data: function () {
      var view = 'summary';
      try { view = localStorage.getItem(VIEW_KEY) || 'summary'; } catch (e) { /* ignore */ }
      if (['summary', 'members', 'articles'].indexOf(view) < 0) view = 'summary';
      return {
        T: T,
        state: 'loading',
        errorMessage: '',
        d: null,
        view: view,
        query: '',
        showUnordered: false,
        expanded: {},
        dialog: null,          // {title, body, confirm, danger, action}
        downloadsOpen: false,
        comment: '',
        busy: false,
        toast: null,
        adding: null,          // {article, ordergroup_id, result}
        results: {}            // goa id -> value being edited
      };
    },

    computed: {
      cfg: function () { return (this.d && this.d.config) || {}; },
      order: function () { return this.d ? this.d.order : null; },
      can: function () { return (this.d && this.d.can) || {}; },
      urls: function () { return (this.d && this.d.urls) || {}; },
      q: function () { return norm(this.query).trim(); },

      metaLine: function () {
        var o = this.order, parts = [];
        if (!o) return parts;
        parts.push(T.openedBy(o.created_by));
        if (o.starts_human) parts.push(T.openFrom(o.starts_human) + (o.ends_human ? ' ' + T.until(o.ends_human) : ''));
        if (o.pickup_human) parts.push(T.pickup(o.pickup_human));
        return parts;
      },

      articles: function () { return this.d ? this.d.articles : []; },
      orderedArticles: function () { return this.articles.filter(function (a) { return a.ordered; }); },
      unorderedCount: function () { return this.articles.length - this.orderedArticles.length; },

      // ---- summary: articles by category, filtered ----------------------------
      summaryGroups: function () {
        var q = this.q, groups = [], byName = {};
        this.articles.forEach(function (a) {
          if (q && norm(a.name).indexOf(q) < 0 && norm(a.note).indexOf(q) < 0) return;
          var key = a.category || '';
          if (!byName[key]) { byName[key] = { name: key, articles: [] }; groups.push(byName[key]); }
          byName[key].articles.push(a);
        });
        groups.sort(function (x, y) { return x.name < y.name ? -1 : (x.name > y.name ? 1 : 0); });
        return groups;
      },
      summaryTotals: function () {
        var net = 0, gross = 0;
        this.articles.forEach(function (a) { net += a.total_net || 0; gross += a.total_gross || 0; });
        return { net: net, gross: gross };
      },

      // ---- by article --------------------------------------------------------------
      articleCards: function () {
        var q = this.q, list = this.showUnordered ? this.articles : this.orderedArticles;
        if (!q) return list;
        return list.filter(function (a) {
          if (norm(a.name).indexOf(q) >= 0) return true;
          return a.lines.some(function (l) { return norm(l.ordergroup).indexOf(q) >= 0; });
        });
      },

      // ---- by member ------------------------------------------------------------------
      memberCards: function () {
        var q = this.q, list = this.d ? this.d.group_orders : [];
        if (!q) return list;
        return list.filter(function (g) {
          if (norm(g.name).indexOf(q) >= 0) return true;
          return g.lines.some(function (l) { return norm(l.name).indexOf(q) >= 0; });
        });
      },

      // ---- actions ------------------------------------------------------------------------
      actions: function () {
        var o = this.order, u = this.urls, can = this.can, self = this, list = [];
        if (!o) return list;
        if (can.orders) {
          if (o.open) {
            list.push({ key: 'close', label: T.close, kind: 'success', click: function () { self.confirmClose(); } });
            list.push({ key: 'stock', label: T.stockOrder, href: u.stock_order });
            list.push({ key: 'edit', label: T.edit, href: u.edit });
            list.push({ key: 'swap', label: T.swap, href: u.swap });
          } else if (!o.closed && !o.stockit) {
            list.push({ key: 'send', label: T.send, kind: (o.last_sent_mail_human ? '' : 'primary'), click: function () { self.confirmSend(); } });
          }
          if (!o.open && !o.stockit) {
            list.push({ key: 'receive', label: T.receive, kind: (o.received ? '' : 'success'), href: u.receive });
          }
        }
        if (!o.open) list.push({ key: 'downloads', label: T.downloads, menu: true });
        if (can.finance || can.invoices) {
          if (o.invoice) list.push({ key: 'invoice', label: T.invoice, href: o.invoice.url });
          else if (!o.open && u.new_invoice) list.push({ key: 'invoice', label: T.newInvoice, href: u.new_invoice });
        }
        list.push({ key: 'report', label: T.caseReport, href: u.nearly_full });
        if (can.orders && !o.closed) {
          list.push({ key: 'delete', label: T.del, kind: 'danger', click: function () { self.confirmDelete(); } });
        }
        return list;
      },

      commentOk: function () { return this.comment.trim().length >= 3; }
    },

    watch: {
      view: function (v) { try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* ignore */ } }
    },

    created: function () { this.load(); },

    methods: {
      money: function (v) { return money(v, this.cfg.currency_unit); },
      stateOf: articleState,
      stateLabel: function (a) {
        if (this.order && this.order.stockit) return null;
        switch (articleState(a)) {
          case 'used': return { text: T.full, kind: 'ok' };
          case 'partused': return { text: T.short(a.missing_units), kind: 'warn' };
          case 'unused': return { text: T.unused, kind: 'bad' };
          default: return { text: T.nobody, kind: 'muted' };
        }
      },
      households: function (a) {
        return a.lines.filter(function (l) { return l.quantity + l.tolerance > 0 || l.result > 0; }).length;
      },
      lineClass: function (l) {
        return {
          'is-none': l.result === 0,
          'is-tolerance': l.result > l.quantity
        };
      },
      toggle: function (id) {
        var next = {};
        Object.keys(this.expanded).forEach(function (k) { next[k] = true; });
        if (next[id]) delete next[id]; else next[id] = true;
        this.expanded = next;
      },
      sumResult: function (a) {
        return a.lines.reduce(function (s, l) { return s + (l.result || 0); }, 0);
      },
      sumPrice: function (a) {
        return a.lines.reduce(function (s, l) { return s + (l.total_price || 0); }, 0);
      },

      load: function () {
        var self = this;
        self.state = self.d ? 'ready' : 'loading';
        fetch(self.dataUrl, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(function (json) { self.d = json; self.state = 'ready'; })
          .catch(function (e) { self.state = 'error'; self.errorMessage = T.loadFailed + ' (' + e.message + ')'; });
      },

      // ---- confirm dialogs for the destructive actions --------------------------------
      confirmClose: function () {
        var self = this;
        this.dialog = { title: T.closeTitle(this.order.name), body: T.closeBody, confirm: T.closeConfirm, danger: false,
          action: function () { submitForm(self.urls.finish, 'post'); } };
      },
      confirmSend: function () {
        var self = this, o = this.order;
        if (!o.last_sent_mail_human) { submitForm(self.urls.send_to_supplier, 'post'); return; }
        this.dialog = { title: T.sendAgainTitle, body: T.sendAgainBody(o.last_sent_mail_human), confirm: T.sendConfirm, danger: false,
          action: function () { submitForm(self.urls.send_to_supplier, 'post'); } };
      },
      confirmDelete: function () {
        var self = this;
        this.dialog = { title: T.delTitle, body: T.delBody, confirm: T.delConfirm, danger: true,
          action: function () { submitForm(self.urls.delete, 'delete'); } };
      },
      runDialog: function () {
        var d = this.dialog;
        this.dialog = null;
        if (d && d.action) d.action();
      },

      // ---- results (finance, finished orders) ----------------------------------------------
      resultValue: function (l) {
        return this.results[l.id] != null ? this.results[l.id] : l.result;
      },
      bump: function (l, delta) {
        var v = Math.max(0, Number(this.resultValue(l)) + delta);
        this.saveResult(l, v);
      },
      onResultInput: function (l, e) {
        var next = {};
        var self = this;
        Object.keys(self.results).forEach(function (k) { next[k] = self.results[k]; });
        next[l.id] = e.target.value;
        this.results = next;
      },
      commitResult: function (l) {
        var v = Number(this.resultValue(l));
        if (!isFinite(v) || v < 0) v = l.result;
        if (v !== l.result) this.saveResult(l, v);
      },
      saveResult: function (l, value) {
        var self = this;
        self.busy = true;
        postForm(self.urls.group_order_articles + '/' + l.id, 'PATCH', { 'group_order_article[result]': value })
          .then(function () { self.flash(T.saved); self.results = {}; self.load(); })
          .catch(function () { self.flash(T.saveFailed, true); })
          .then(function () { self.busy = false; });
      },
      startAdd: function (a) {
        var groups = this.d.ordergroups || [];
        this.adding = { article: a, ordergroup_id: (groups[0] ? groups[0].id : null), result: 1 };
      },
      submitAdd: function () {
        var self = this, ad = this.adding;
        if (!ad || !ad.ordergroup_id) return;
        self.busy = true;
        postForm(self.urls.group_order_articles, 'POST', {
          'group_order_article[order_article_id]': ad.article.id,
          'group_order_article[ordergroup_id]': ad.ordergroup_id,
          'group_order_article[result]': ad.result
        })
          .then(function () { self.adding = null; self.flash(T.saved); self.load(); })
          .catch(function () { self.flash(T.saveFailed, true); })
          .then(function () { self.busy = false; });
      },

      // ---- comments -----------------------------------------------------------------------------
      submitComment: function () {
        var self = this;
        if (!self.commentOk) { self.flash(T.commentTooShort, true); return; }
        self.busy = true;
        postForm(self.urls.comment, 'POST', {
          'order_comment[order_id]': self.order.id,
          'order_comment[user_id]': self.d.user.id,
          'order_comment[text]': self.comment
        })
          .then(function () { self.comment = ''; self.flash(T.saved); self.load(); })
          .catch(function () { self.flash(T.saveFailed, true); })
          .then(function () { self.busy = false; });
      },

      flash: function (text, error) {
        var self = this;
        self.toast = { text: text, error: !!error };
        clearTimeout(self._toastTimer);
        self._toastTimer = setTimeout(function () { self.toast = null; }, 2500);
      },
      closeMenus: function () { this.downloadsOpen = false; }
    },

    template:
      '<div class="om" @click="closeMenus">' +

      '  <div class="om-state" v-if="state === \'loading\'"><span class="om-spinner"></span></div>' +
      '  <div class="om-state" v-else-if="state === \'error\'">' +
      '    <div class="om-alert om-alert-danger">{{ errorMessage }}</div>' +
      '    <button type="button" class="om-btn" @click="load">{{ T.reload }}</button>' +
      '  </div>' +

      '  <template v-else>' +

      // ---- header ---------------------------------------------------------------------------
      '  <div class="om-topbar">' +
      '    <a class="om-back" :href="urls.orders">‹ {{ T.back }}</a>' +
      '    <a class="om-classic" :href="urls.legacy" data-fs-ui="legacy">{{ T.classic }}</a>' +
      '  </div>' +
      '  <header class="om-head">' +
      '    <h1>{{ order.name }} <span class="om-chip" :class="\'state-\' + order.state">{{ order.state_human }}</span></h1>' +
      '    <p class="om-meta">' +
      '      <span v-if="order.supplier"><a :href="order.supplier.url">{{ order.supplier.name }}</a></span>' +
      '      <span v-for="(m, i) in metaLine" :key="i">{{ m }}</span>' +
      '      <span v-if="!order.open && !order.stockit" :class="{ \'om-muted\': !order.last_sent_mail_human }">{{ order.last_sent_mail_human ? T.sentOn(order.last_sent_mail_human) : T.notSent }}</span>' +
      '    </p>' +
      '    <div class="om-note" v-if="order.note"><span class="om-label">{{ T.note }}</span>{{ order.note }}</div>' +
      '    <div class="om-tiles">' +
      '      <div class="om-tile" :title="d.stats.ordergroup_names.join(\', \')"><span class="om-label">{{ T.households }}</span><strong>{{ d.stats.ordergroups }}</strong></div>' +
      '      <div class="om-tile"><span class="om-label">{{ T.articles }}</span><strong>{{ d.stats.articles_ordered }}</strong></div>' +
      '      <div class="om-tile"><span class="om-label">{{ T.net }}</span><strong>{{ money(d.stats.net_sum) }}</strong></div>' +
      '      <div class="om-tile"><span class="om-label">{{ T.gross }}</span><strong>{{ money(d.stats.gross_sum) }}</strong></div>' +
      '    </div>' +
      '  </header>' +

      // ---- actions ---------------------------------------------------------------------------
      '  <div class="om-actions" v-if="actions.length">' +
      '    <template v-for="a in actions" :key="a.key">' +
      '      <div class="om-menu" v-if="a.menu" @click.stop>' +
      '        <button type="button" class="om-btn" @click="downloadsOpen = !downloadsOpen">{{ a.label }} ▾</button>' +
      '        <div class="om-menu-list" v-if="downloadsOpen">' +
      '          <a v-for="dl in urls.downloads" :key="dl.url" :href="dl.url">{{ dl.label }}</a>' +
      '        </div>' +
      '      </div>' +
      '      <a v-else-if="a.href" class="om-btn" :class="a.kind ? \'om-btn-\' + a.kind : \'\'" :href="a.href">{{ a.label }}</a>' +
      '      <button v-else type="button" class="om-btn" :class="a.kind ? \'om-btn-\' + a.kind : \'\'" @click="a.click">{{ a.label }}</button>' +
      '    </template>' +
      '  </div>' +

      // ---- toolbar -----------------------------------------------------------------------------
      '  <div class="om-toolbar">' +
      '    <input type="search" class="om-search" v-model="query" :placeholder="T.search">' +
      '    <div class="om-tabs">' +
      '      <button type="button" :class="{ active: view === \'summary\' }" @click="view = \'summary\'">{{ T.summary }}</button>' +
      '      <button type="button" :class="{ active: view === \'members\' }" @click="view = \'members\'">{{ T.byMember }} <small>{{ d.group_orders.length }}</small></button>' +
      '      <button type="button" :class="{ active: view === \'articles\' }" @click="view = \'articles\'">{{ T.byArticle }} <small>{{ orderedArticles.length }}</small></button>' +
      '    </div>' +
      '    <label class="om-toggle" v-if="view === \'articles\' && unorderedCount">' +
      '      <input type="checkbox" v-model="showUnordered"> {{ T.showUnordered }} <small>{{ T.unorderedCount(unorderedCount) }}</small>' +
      '    </label>' +
      '  </div>' +

      // ---- summary ------------------------------------------------------------------------------
      '  <section class="om-section" v-if="view === \'summary\'">' +
      '    <p class="om-empty" v-if="!summaryGroups.length">{{ T.nothing }}</p>' +
      '    <div v-for="g in summaryGroups" :key="g.name" class="om-category">' +
      '      <h2 class="om-category-title">{{ g.name }} <small>{{ g.articles.length }}</small></h2>' +
      '      <div class="om-list">' +
      '        <article v-for="a in g.articles" :key="a.id" class="om-card om-article" :class="\'is-\' + stateOf(a)">' +
      '          <div class="om-article-row" @click="toggle(a.id)">' +
      '            <div class="om-article-main">' +
      '              <div class="om-article-name">{{ a.name }} <span class="om-unit">{{ a.unit }}</span></div>' +
      '              <div class="om-article-note" v-if="a.note">{{ a.note }}</div>' +
      '              <div class="om-article-prices"><span class="om-label">{{ T.pricesLabel }}</span> {{ money(a.price.net) }} / {{ money(a.price.gross) }} / {{ money(a.price.supplier) }}</div>' +
      '            </div>' +
      '            <div class="om-article-figs">' +
      '              <div class="om-fig" v-if="!order.stockit"><span class="om-label">{{ T.wantedLabel }}</span><strong>{{ T.wanted(a.quantity, a.tolerance) }}</strong><small>{{ households(a) }} hh</small></div>' +
      '              <div class="om-fig"><span class="om-label">{{ order.stockit ? T.stockUnits : T.unitsLabel }}</span><strong>{{ a.units }}</strong><small v-if="a.unit_quantity > 1">{{ T.casesOf(a.units, a.unit_quantity) }}</small></div>' +
      '              <span class="om-chip" v-if="stateLabel(a)" :class="stateLabel(a).kind">{{ stateLabel(a).text }}</span>' +
      '            </div>' +
      '          </div>' +
      '          <div class="om-lines" v-if="expanded[a.id]">' +
      '            <p class="om-empty" v-if="!a.lines.length">{{ T.noHouseholds }}</p>' +
      '            <div v-for="l in a.lines" :key="l.id" class="om-line" :class="lineClass(l)">' +
      '              <span class="om-line-name">{{ l.ordergroup }}</span>' +
      '              <span class="om-line-fig"><span class="om-label">{{ T.ordered }}</span>{{ T.wanted(l.quantity, l.tolerance) }}</span>' +
      '              <span class="om-line-fig om-line-result"><span class="om-label">{{ T.result }}</span>{{ l.result }}</span>' +
      '              <span class="om-line-price">{{ money(l.total_price) }}</span>' +
      '            </div>' +
      '          </div>' +
      '        </article>' +
      '      </div>' +
      '    </div>' +
      '    <div class="om-card om-totals" v-if="summaryGroups.length && !q">' +
      '      <span>{{ T.summaryTotal }} <strong>{{ money(summaryTotals.net) }} / {{ money(summaryTotals.gross) }}</strong></span>' +
      '      <span>{{ T.summaryCount(d.stats.articles_ordered) }}</span>' +
      '    </div>' +
      '  </section>' +

      // ---- by member --------------------------------------------------------------------------------
      '  <section class="om-section" v-else-if="view === \'members\'">' +
      '    <p class="om-empty" v-if="!memberCards.length">{{ T.nothing }}</p>' +
      '    <div class="om-list">' +
      '      <article v-for="g in memberCards" :key="g.id" class="om-card om-group">' +
      '        <header class="om-group-head">' +
      '          <h3>{{ g.name }}</h3>' +
      '          <div class="om-group-total"><strong>{{ money(g.price) }}</strong><small v-if="g.updated_on_human">{{ T.savedBy(g.updated_by, g.updated_on_human) }}</small></div>' +
      '        </header>' +
      '        <p class="om-empty" v-if="!g.lines.length">{{ T.nothingOrdered }}</p>' +
      '        <div v-for="l in g.lines" :key="l.id" class="om-line" :class="lineClass(l)">' +
      '          <span class="om-line-name">{{ l.name }} <span class="om-unit">{{ l.unit }}</span><small v-if="l.unit_quantity > 1" class="om-pkg">× {{ l.unit_quantity }}</small></span>' +
      '          <span class="om-line-fig"><span class="om-label">{{ T.ordered }}</span>{{ T.wanted(l.quantity, l.tolerance) }}</span>' +
      '          <span class="om-line-fig om-line-result"><span class="om-label">{{ T.result }}</span>' +
      '            <template v-if="can.edit_results"><button type="button" class="om-mini" :disabled="busy" @click="bump(l, -1)">−</button><input class="om-result" type="number" min="0" step="any" :value="resultValue(l)" @input="onResultInput(l, $event)" @change="commitResult(l)"><button type="button" class="om-mini" :disabled="busy" @click="bump(l, 1)">+</button></template>' +
      '            <template v-else>{{ l.result }}</template>' +
      '          </span>' +
      '          <span class="om-line-price"><small>× {{ money(l.fc_price) }} =</small> {{ money(l.total_price) }}</span>' +
      '        </div>' +
      '      </article>' +
      '    </div>' +
      '  </section>' +

      // ---- by article ---------------------------------------------------------------------------------
      '  <section class="om-section" v-else>' +
      '    <p class="om-empty" v-if="!articleCards.length">{{ T.nothing }}</p>' +
      '    <div class="om-list">' +
      '      <article v-for="a in articleCards" :key="a.id" class="om-card om-group om-article" :class="\'is-\' + stateOf(a)">' +
      '        <header class="om-group-head">' +
      '          <div>' +
      '            <h3>{{ a.name }} <span class="om-unit">{{ a.unit }}</span> <span class="om-chip" v-if="stateLabel(a) && !a.ordered" :class="stateLabel(a).kind">{{ stateLabel(a).text }}</span></h3>' +
      '            <small class="om-muted">{{ money(a.price.fc) }}<template v-if="a.unit_quantity > 1"> · × {{ a.unit_quantity }}</template> · {{ T.caseLine(a.units, a.unit_quantity, a.unit) }}</small>' +
      '          </div>' +
      '          <div class="om-group-total"><strong>{{ money(sumPrice(a)) }}</strong><small>{{ sumResult(a) }} {{ T.received }}</small></div>' +
      '        </header>' +
      '        <p class="om-empty" v-if="!a.lines.length">{{ T.noHouseholds }}</p>' +
      '        <div v-for="l in a.lines" :key="l.id" class="om-line" :class="lineClass(l)">' +
      '          <span class="om-line-name">{{ l.ordergroup }}</span>' +
      '          <span class="om-line-fig"><span class="om-label">{{ T.ordered }}</span>{{ T.wanted(l.quantity, l.tolerance) }}</span>' +
      '          <span class="om-line-fig om-line-result"><span class="om-label">{{ T.result }}</span>' +
      '            <template v-if="can.edit_results"><button type="button" class="om-mini" :disabled="busy" @click="bump(l, -1)">−</button><input class="om-result" type="number" min="0" step="any" :value="resultValue(l)" @input="onResultInput(l, $event)" @change="commitResult(l)"><button type="button" class="om-mini" :disabled="busy" @click="bump(l, 1)">+</button></template>' +
      '            <template v-else>{{ l.result }}</template>' +
      '          </span>' +
      '          <span class="om-line-price">{{ money(l.total_price) }}</span>' +
      '        </div>' +
      '        <div class="om-group-foot" v-if="can.edit_results">' +
      '          <button type="button" class="om-btn om-btn-small" @click="startAdd(a)">{{ T.addHousehold }}</button>' +
      '        </div>' +
      '      </article>' +
      '    </div>' +
      '  </section>' +

      // ---- comments ------------------------------------------------------------------------------------
      '  <section class="om-section om-comments">' +
      '    <h2 class="om-section-title">{{ T.comments }} <small>{{ d.comments.length }}</small></h2>' +
      '    <p class="om-empty" v-if="!d.comments.length">{{ T.noComments }}</p>' +
      '    <div class="om-card om-comment" v-for="c in d.comments" :key="c.id">' +
      '      <div class="om-comment-meta"><strong>{{ c.ordergroup || c.user }}</strong> <small>{{ c.user }} · {{ c.created_human }}</small></div>' +
      '      <div class="om-comment-text">{{ c.text }}</div>' +
      '    </div>' +
      '    <div class="om-card om-comment-form">' +
      '      <textarea rows="3" v-model="comment" :placeholder="T.commentPlaceholder"></textarea>' +
      '      <button type="button" class="om-btn om-btn-primary" :disabled="busy || !commentOk" @click="submitComment">{{ busy ? T.saving : T.addComment }}</button>' +
      '    </div>' +
      '  </section>' +

      // ---- dialogs + toast ---------------------------------------------------------------------------------
      '  <div class="om-modal-backdrop" v-if="dialog" @click.self="dialog = null">' +
      '    <div class="om-modal" role="dialog" aria-modal="true">' +
      '      <h3>{{ dialog.title }}</h3>' +
      '      <p>{{ dialog.body }}</p>' +
      '      <div class="om-modal-actions">' +
      '        <button type="button" class="om-btn" :class="dialog.danger ? \'om-btn-danger\' : \'om-btn-primary\'" @click="runDialog">{{ dialog.confirm }}</button>' +
      '        <button type="button" class="om-btn" @click="dialog = null">{{ T.cancel }}</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="om-modal-backdrop" v-if="adding" @click.self="adding = null">' +
      '    <div class="om-modal" role="dialog" aria-modal="true">' +
      '      <h3>{{ T.addHouseholdTitle(adding.article.name) }}</h3>' +
      '      <label class="om-field"><span class="om-label">{{ T.household }}</span>' +
      '        <select v-model="adding.ordergroup_id"><option v-for="og in d.ordergroups" :key="og.id" :value="og.id">{{ og.name }}</option></select></label>' +
      '      <label class="om-field"><span class="om-label">{{ T.amount }} ({{ adding.article.unit }})</span>' +
      '        <input type="number" min="0" step="any" v-model="adding.result"></label>' +
      '      <div class="om-modal-actions">' +
      '        <button type="button" class="om-btn om-btn-primary" :disabled="busy" @click="submitAdd">{{ busy ? T.saving : T.save }}</button>' +
      '        <button type="button" class="om-btn" @click="adding = null">{{ T.cancel }}</button>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      '  <div class="om-toast" v-if="toast" :class="{ error: toast.error }">{{ toast.text }}</div>' +

      '  </template>' +
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

    var el = document.getElementById('order-manage-app');
    if (!el) return;
    if (!window.Vue) {
      el.innerHTML = '<div class="alert alert-danger">Vue failed to load.</div>';
      return;
    }
    writeUiPref('modern');
    var app = Vue.createApp(OrderManageApp, { dataUrl: el.getAttribute('data-url') });
    app.config.errorHandler = function (err) {
      el.innerHTML = '<div class="alert alert-danger">Something went wrong on this page: ' + (err && err.message) + '</div>';
      if (window.console) console.error(err);
    };
    app.mount(el);
  });
})();
