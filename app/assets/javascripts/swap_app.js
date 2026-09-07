// Modern swap page (Vue 3): replace articles in an open order with similar
// available ones. Plain ES5 on purpose (the production Uglifier is ES5 only).
//
// Mounted on #swap-app (app/views/orders/swap.html.haml). The JSON at data-url
// (SwapSerializer) lists the order's articles and every available article of
// the supplier; matching and scoring happen here. Saving PUTs only the rows
// whose choice differs from the current article (SwapController#update).
//
// Similarity: the article name counts most, the origin a little, and the
// supplier/manufacturer not at all. Each option in the select is tinted from
// red (poor match) to green (near identical) by that score.
(function () {
  'use strict';

  var T = {
    title: function (name) { return 'Swap articles in ' + name; },
    intro: 'Pick a similar available article for anything the supplier can no longer deliver. Members\' amounts carry over, so choose the same unit and case size where you can.',
    classic: 'Classic view',
    back: 'Back to order',
    unavailableOpen: function (open, total) {
      if (!total) return 'No articles are marked unavailable.';
      if (!open) return 'All ' + total + ' unavailable ' + (total === 1 ? 'article has' : 'articles have') + ' an available alternative chosen.';
      return open + ' of ' + total + ' unavailable ' + (total === 1 ? 'article still needs' : 'articles still need') + ' an available alternative chosen.';
    },
    search: 'Search articles…',
    all: 'All',
    unavailable: 'Unavailable',
    changed: 'Changed',
    nothing: 'No articles match.',
    wanted: function (q, max) { return q === max ? 'wanted ' + q : 'wanted ' + q + ' (up to ' + max + ')'; },
    cases: function (n) { return n + (n === 1 ? ' case' : ' cases'); },
    short: function (n, cases) { return n + ' short of ' + (cases > 0 ? 'another case' : 'a case'); },
    households: function (n) { return n + (n === 1 ? ' household' : ' households'); },
    article: 'Article',
    replaceWith: 'Replace with',
    keep: 'Keep this article',
    chooseOne: 'Choose an alternative…',
    noneFound: 'No similar article with the same unit.',
    showAll: 'Show all articles',
    showSimilar: 'Show similar only',
    match: function (p) { return p + '% match'; },
    origin: 'origin',
    unitDiffers: 'different unit',
    askFactor: function (from, to) { return 'How should members\' amounts be converted from ' + from + ' to ' + to + '?'; },
    customOpen: 'Custom conversion…',
    customClose: 'Use the automatic conversion',
    customSameUnit: 'Same unit: amounts are kept as they are unless you enter a multiplier.',
    factorLabel: function (from, to) { return '1×' + from + ' = '; },
    factorUnit: function (to) { return '×' + to; },
    factorEmpty: 'Leave empty to keep everyone\'s numbers as they are.',
    sameCaseNote: function (q0, u0, q1, u1) { return 'Suggested ' + q1 + '/' + q0 + ', assuming a case of ' + q0 + '×' + u0 + ' holds the same as a case of ' + q1 + '×' + u1 + '. Change it if the cases differ.'; },
    factorExample: function (from, to, f) { return 'Example: 1×' + from + ' becomes ' + f + '×' + to + '.'; },
    factorMembers: function (pairs) { return 'Members\' amounts ' + pairs + '.'; },
    factorExtra: function (pairs) { return 'Extra: ' + pairs + '.'; },
    factorRounded: 'Rounded to whole units.',
    factorZero: function (n) { return n + (n === 1 ? ' member' : ' members') + ' would end up with 0 and be dropped from this article.'; },
    factorBad: 'Enter a number above 0, e.g. 8, 0.125 or 1/8.',
    unitConvert: function (f, from, to) { return 'amounts ×' + f + ': 1×' + from + ' becomes ' + f + '×' + to; },
    convertLabel: function (f) { return 'Multiply everyone\'s amounts by ' + f; },
    convertHint: function (f, from, to) { return 'A member who ordered 1×' + from + ' will get ' + f + '×' + to + '. Untick to keep the numbers as they are.'; },
    perEquiv: function (f, unit) { return 'for ' + f + '×' + unit; },
    perUnit: function (unit) { return 'per ' + unit; },
    cheaperHint: function (name, origin, d) { return name + (origin ? ' (' + origin + ')' : '') + ' is ' + d + ' cheaper'; },
    noDemand: 'nobody has ordered this yet',
    fillsCases: function (n, size) { return 'demand fills ' + n + (n === 1 ? ' case' : ' cases') + ' of ' + size; },
    fillsShort: function (n, more, size) { return (n ? n + (n === 1 ? ' case' : ' cases') + ' filled, ' : '') + more + ' more needed for a case of ' + size; },
    use: 'Use it',
    caseDiffers: function (a, b) { return 'case of ' + b + ' instead of ' + a; },
    cheaper: function (d) { return d + ' cheaper'; },
    dearer: function (d) { return d + ' more'; },
    samePrice: 'same price',
    priceUnknown: function (p, u, p0, u0) { return p + ' per ' + u + ' vs ' + p0 + ' per ' + u0 + ', not comparable'; },
    unitsDiffer: 'units differ',
    changes: function (n) { return n + (n === 1 ? ' change' : ' changes'); },
    noChanges: 'No changes yet',
    save: 'Update order',
    saving: 'Saving…',
    reset: 'Undo all',
    saved: 'The order has been updated.',
    partly: function (n) { return n + ' could not be swapped. See the marked articles.'; },
    loadError: 'Could not load the order. Your session may have expired.',
    saveError: 'Saving failed. Please try again.',
    closed: 'This order is closed and can no longer be changed.',
    reload: 'Reload',
    leave: 'You have unsaved changes. Leave anyway?'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
  }

  // ---- text similarity, units and colours: see article_match.js ----------------------
  var M = window.FoodsoftArticleMatch;
  var UNAVAILABLE_RE = M.UNAVAILABLE_RE, isUnavailableName = M.isUnavailableName, cleanName = M.cleanName,
      sameProduct = M.sameProduct, similarity = M.similarity, unitKey = M.unitKey, unitRatio = M.unitRatio,
      conversionFactor = M.conversionFactor, equivalentPrice = M.equivalentPrice, parseFactor = M.parseFactor,
      scaleAmount = M.scaleAmount, caseFill = M.caseFill, tint = M.tint, ink = M.ink;

  // a cheaper article is only suggested on the card when it is this similar
  var CHEAPER_MIN_SCORE = 0.75;


  // A dropdown we draw ourselves, so every option row carries its similarity
  // colour on every platform (native <select> popups ignore option colours on
  // macOS and iOS). Closed it looks like a select; open it lists the options
  // with name, origin, price, pack, price difference and the match score.
  var SwPicker = {
    props: {
      options: { type: Array, required: true },   // [{a, score, current, delta}]
      modelValue: { default: '' },
      score: { default: null },                     // score of the chosen article once it differs
      currency: { type: String, default: '' },
      id: { type: String, default: null },
      ariaLabel: { type: String, default: null }
    },
    emits: ['update:modelValue'],
    data: function () { return { open: false, T: T }; },
    computed: {
      chosen: function () {
        var v = this.modelValue;
        return this.options.filter(function (o) { return o.a.article_id === v; })[0] || null;
      },
      buttonStyle: function () {
        return this.score != null ? { borderColor: ink(this.score), background: tint(this.score) } : null;
      }
    },
    mounted: function () {
      var self = this;
      this._outside = function (e) { if (self.open && !self.$el.contains(e.target)) self.open = false; };
      this._key = function (e) { if (e.key === 'Escape') self.open = false; };
      document.addEventListener('click', this._outside, true);
      document.addEventListener('keydown', this._key);
    },
    beforeUnmount: function () {
      document.removeEventListener('click', this._outside, true);
      document.removeEventListener('keydown', this._key);
    },
    methods: {
      choose: function (value) { this.$emit('update:modelValue', value); this.open = false; },
      tint: tint,
      ink: ink,
      money: function (v) { return money(v, this.currency); },
      deltaText: function (d) {
        if (Math.abs(d) < 0.005) return '';
        return (d < 0 ? '−' : '+') + money(Math.abs(d), this.currency);
      },
      optionStyle: function (o) {
        return o.current ? null : { background: tint(o.score), color: ink(o.score) };
      }
    },
    template:
      '<div class="sw-picker" :class="{ open: open }">' +
      '  <button type="button" class="sw-picker-btn" :id="id" :aria-label="ariaLabel" :style="buttonStyle" :aria-expanded="open ? \'true\' : \'false\'" aria-haspopup="listbox" @click="open = !open">' +
      '    <span class="sw-picker-text" :class="{ placeholder: !chosen }">' +
      '      <template v-if="chosen"><strong>{{ chosen.a.name }}</strong><small> · {{ [chosen.a.origin, money(chosen.a.price), chosen.a.unit_quantity + \'×\' + chosen.a.unit].filter(Boolean).join(\' · \') }}</small></template>' +
      '      <template v-else>{{ options.length ? T.chooseOne : T.noneFound }}</template>' +
      '    </span>' +
      '    <span class="sw-picker-caret">▾</span>' +
      '  </button>' +
      '  <div class="sw-picker-list" role="listbox" v-if="open">' +
      '    <button type="button" class="sw-picker-opt none" :class="{ selected: !chosen }" @click="choose(\'\')">{{ T.chooseOne }}</button>' +
      '    <button type="button" class="sw-picker-opt" v-for="o in options" :key="o.a.article_id" :class="{ selected: chosen && chosen.a.article_id === o.a.article_id, current: o.current }" :style="optionStyle(o)" role="option" @click="choose(o.a.article_id)">' +
      '      <span class="sw-opt-main">' +
      '        <span class="sw-opt-name"><span class="sw-opt-keep" v-if="o.current">{{ T.keep }} · </span>{{ o.a.name }}</span>' +
      '        <span class="sw-opt-meta">{{ [o.a.origin, o.a.manufacturer, money(o.a.price), o.a.unit_quantity + \'×\' + o.a.unit].filter(Boolean).join(\' · \') }}</span>' +
      '      </span>' +
      '      <span class="sw-opt-side" v-if="!o.current">' +
      '        <span class="sw-opt-factor" v-if="o.factor > 1">×{{ o.factor }}</span>' +
      '        <span class="sw-opt-delta muted" v-if="o.ratio == null">{{ T.unitsDiffer }}</span>' +
      '        <span class="sw-opt-delta" v-else-if="deltaText(o.delta)" :class="o.delta < 0 ? \'ok\' : \'warn\'">{{ deltaText(o.delta) }}</span>' +
      '        <span class="sw-opt-score">{{ Math.round(o.score * 100) }}%</span>' +
      '      </span>' +
      '    </button>' +
      '  </div>' +
      '</div>'
  };

  var SwapApp = {
    components: { 'sw-picker': SwPicker },
    props: { dataUrl: { type: String, required: true } },

    data: function () {
      return {
        state: 'loading',
        errorMessage: null,
        d: null,
        choice: {},       // order_article id -> article id ('' = nothing chosen)
        showAll: {},      // order_article id -> true when every article is offered
        convert: {},      // order_article id -> false when the member amounts must NOT be multiplied
        customFactor: {}, // order_article id -> text typed when no automatic conversion exists
        showCustom: {},   // order_article id -> true when the conversion panel was opened by hand
        rowErrors: {},    // order_article id -> message from the last save
        filter: 'all',    // all | unavailable | changed
        query: '',
        saving: false,
        toast: null,
        T: T
      };
    },

    computed: {
      cfg: function () { return (this.d && this.d.config) || {}; },
      articlesById: function () {
        var out = {};
        if (this.d) this.d.articles.forEach(function (a) { out[a.article_id] = a; });
        return out;
      },
      rows: function () {
        var self = this;
        if (!this.d) return [];
        return this.d.order_articles.map(function (oa) { return self.buildRow(oa); });
      },
      unavailableRows: function () { return this.rows.filter(function (r) { return r.unavailable; }); },
      openRows: function () { return this.unavailableRows.filter(function (r) { return !r.resolved; }); },
      changedRows: function () { return this.rows.filter(function (r) { return r.changed; }); },
      visibleRows: function () {
        var q = cleanName(this.query), f = this.filter;
        return this.rows.filter(function (r) {
          if (f === 'unavailable' && !r.unavailable) return false;
          if (f === 'changed' && !r.changed) return false;
          if (q && cleanName(r.oa.name + ' ' + r.oa.origin + ' ' + r.oa.manufacturer).indexOf(q) === -1) return false;
          return true;
        });
      },
      dirty: function () { return this.changedRows.length > 0; }
    },

    created: function () {
      var self = this;
      this.load();
      window.addEventListener('beforeunload', function (e) {
        if (!self.dirty || self.saving) return;
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

      // take a snapshot from the server and reset the choices to match it
      apply: function (json) {
        var self = this;
        this.d = json;
        this._optionsCache = {};
        this.choice = {};
        this.convert = {};
        this.customFactor = {};
        this.showCustom = {};
        this.rowErrors = {};
        json.order_articles.forEach(function (oa) {
          self.choice[oa.id] = self.articlesById[oa.article_id] && !isUnavailableName(oa.name) ? oa.article_id : '';
        });
      },

      buildRow: function (oa) {
        var self = this;
        var chosenId = this.choice[oa.id];
        var chosen = chosenId ? this.articlesById[chosenId] : null;
        var options = this.optionsFor(oa);
        var unavailable = isUnavailableName(oa.name) || !oa.available;
        var changed = !!chosen && chosen.article_id !== oa.article_id;
        var resolved = !!chosen && !isUnavailableName(chosen.name) && !(chosen.article_id === oa.article_id && !oa.available);
        var auto = changed ? conversionFactor(oa.unit, chosen.unit) : 1, factor = auto;
        // the conversion panel: forced when no whole-number conversion exists, optional otherwise
        var needsFactor = changed && auto == null, customOpen = needsFactor || (changed && !!this.showCustom[oa.id]);
        var custom = null, customError = false;
        if (customOpen) {
          var typed = this.customFactor[oa.id];
          if (typed == null) {
            var ratio = unitRatio(oa.unit, chosen.unit);
            if (auto != null) typed = String(auto);
            else if (ratio != null) typed = String(+ratio.toFixed(4));
            // across bases assume a case of each holds the same amount: 12×3LB ≈ 80×CT
            else if (oa.unit_quantity > 0 && chosen.unit_quantity > 0) typed = chosen.unit_quantity + '/' + oa.unit_quantity;
            else typed = '';
            this.customFactor[oa.id] = typed;
          }
          custom = parseFactor(typed);
          customError = !!typed.trim() && custom == null;
          factor = custom != null ? custom : 1;
        }
        var useFactor = customOpen ? (custom != null && custom !== 1) : (factor > 1 && this.convert[oa.id] !== false);
        // the cheapest near-identical alternative, like the classic "cheaper?" column
        var cheaper = null;
        options.forEach(function (o) {
          if (o.current || isUnavailableName(o.a.name) || o.score < CHEAPER_MIN_SCORE || o.ratio == null) return;
          if (o.delta < -0.005 && (!cheaper || o.delta < cheaper.delta)) cheaper = o;
        });
        return {
          oa: oa,
          options: options,
          chosen: chosen,
          score: changed ? similarity(oa, chosen) : null,
          unavailable: unavailable,
          changed: changed,
          resolved: resolved,
          factor: factor,
          useFactor: useFactor,
          needsFactor: needsFactor,
          customOpen: customOpen,
          customError: customError,
          sameCaseNote: (needsFactor && unitRatio(oa.unit, chosen.unit) == null && oa.unit_quantity > 0 && chosen.unit_quantity > 0)
            ? T.sameCaseNote(oa.unit_quantity, oa.unit, chosen.unit_quantity, chosen.unit) : null,
          example: (customOpen && useFactor) ? this.exampleFor(oa, chosen, factor) : null,
          cheaper: (!changed && cheaper) ? cheaper : null,
          cheaperFill: (!changed && cheaper) ? this.fillFor(oa, cheaper.a, cheaper.factor || 1) : null,
          diffs: chosen ? this.diffsFor(oa, chosen, useFactor ? factor : 1) : [],
          error: this.rowErrors[oa.id] || null
        };
      },

      // candidates sorted by similarity, same product word unless "show all".
      // Cached per row: the list only depends on the data and the "show all" flag,
      // and scoring 700 articles for 50 rows on every keystroke made typing lag.
      optionsFor: function (oa) {
        var all = !!this.showAll[oa.id], key = oa.id + ':' + (all ? 1 : 0);
        if (!this._optionsCache) this._optionsCache = {};
        if (!this._optionsCache[key]) this._optionsCache[key] = this.computeOptions(oa, all);
        return this._optionsCache[key];
      },

      computeOptions: function (oa, all) {
        var self = this;
        var list = [];
        this.d.articles.forEach(function (a) {
          var s = similarity(oa, a);
          // the supplier flagged it too: keep it visible, but red and last
          if (isUnavailableName(a.name)) s = Math.min(s, 0.2);
          var factor = conversionFactor(oa.unit, a.unit);
          if (!all && !sameProduct(a.name, oa.name)) return;
          var equiv = equivalentPrice(oa, a);
          list.push({ a: a, score: s, current: a.article_id === oa.article_id, factor: factor, ratio: unitRatio(oa.unit, a.unit), equivPrice: equiv, delta: equiv - oa.price });
        });
        // the current article first, then best match first
        list.sort(function (x, y) { return (y.current - x.current) || (y.score - x.score) || x.a.name.localeCompare(y.a.name); });
        return list;
      },

      // what differs between the current article and the chosen one
      diffsFor: function (oa, a, factor) {
        var out = [], cu = this.cfg.currency_unit;
        var ratio = unitRatio(oa.unit, a.unit);
        // across bases the typed multiplier is the only way to compare prices
        if (ratio == null && factor !== 1) ratio = factor;
        var equivPrice = ratio == null ? a.price : a.price * ratio, d = equivPrice - oa.price;
        if (a.article_id === oa.article_id) return out;
        var conv = conversionFactor(oa.unit, a.unit);
        if (conv == null) out.push({ text: T.unitDiffers + ': ' + oa.unit + ' → ' + a.unit, kind: factor !== 1 ? 'warn' : 'bad' });
        else if (factor !== 1 && factor !== conv) out.push({ text: T.unitConvert(factor, oa.unit, a.unit).replace(/becomes .*$/, 'becomes ' + scaleAmount(1, factor) + '×' + a.unit), kind: 'ok' });
        else if (conv > 1) out.push({ text: T.unitConvert(conv, oa.unit, a.unit), kind: factor > 1 ? 'ok' : 'warn' });
        if (a.unit_quantity !== oa.unit_quantity) out.push({ text: T.caseDiffers(oa.unit_quantity, a.unit_quantity), kind: 'warn' });
        if (conv != null || factor !== 1) out.push(this.fillFor(oa, a, factor));
        if (cleanName(a.origin) !== cleanName(oa.origin)) out.push({ text: T.origin + ' ' + (a.origin || '?'), kind: 'info' });
        var equiv = '';
        if (ratio != null && ratio !== 1) {
          equiv = ' (' + money(equivPrice, cu) + ' ' + (ratio > 1 && Math.abs(ratio - Math.round(ratio)) < 1e-6 ? T.perEquiv(Math.round(ratio), a.unit) : T.perUnit(oa.unit)) + ')';
        }
        if (ratio == null) out.push({ text: T.priceUnknown(money(a.price, cu), a.unit, money(oa.price, cu), oa.unit), kind: 'price muted' });
        else if (Math.abs(d) < 0.005) out.push({ text: T.samePrice + equiv, kind: 'price muted' });
        else if (d < 0) out.push({ text: T.cheaper(money(-d, cu)) + equiv, kind: 'price ok' });
        else out.push({ text: T.dearer(money(d, cu)) + equiv, kind: 'price warn' });
        return out;
      },

      pickCheaper: function (r) { this.choice[r.oa.id] = r.cheaper.a.article_id; },

      // what a typed conversion does to the real member amounts
      exampleFor: function (oa, a, factor) {
        var lines = [T.factorExample(oa.unit, a.unit, scaleAmount(1, factor))], zero = 0, rounded = false;
        var amounts = oa.amounts || [];
        var wanted = amounts.filter(function (p) { return p[0] > 0; }).map(function (p) {
          var n = scaleAmount(p[0], factor);
          if (n === 0 && scaleAmount(p[1], factor) === 0) zero++;
          if (Math.abs(p[0] * factor - n) > 1e-9) rounded = true;
          return p[0] + '→' + n;
        });
        var extra = amounts.filter(function (p) { return p[1] > 0; }).map(function (p) { return p[1] + '→' + scaleAmount(p[1], factor); });
        if (wanted.length) lines.push(T.factorMembers(wanted.join(', ')));
        if (extra.length) lines.push(T.factorExtra(extra.join(', ')));
        if (rounded) lines.push(T.factorRounded);
        return { lines: lines, zero: zero ? T.factorZero(zero) : null };
      },

      // would the current demand fill the other article's case? (amounts converted if needed)
      fillFor: function (oa, a, factor) {
        if (!(oa.quantity + oa.tolerance)) return { text: T.noDemand, kind: 'muted' };
        var f = caseFill(scaleAmount(oa.quantity, factor), scaleAmount(oa.tolerance, factor), a.unit_quantity);
        if (f.units > 0 && !f.missing) return { text: T.fillsCases(f.units, a.unit_quantity), kind: 'ok' };
        return { text: T.fillsShort(f.units, f.missing, a.unit_quantity), kind: f.units > 0 ? 'warn' : 'bad' };
      },

      toggleAll: function (oa) {
        this.showAll[oa.id] = !this.showAll[oa.id];
      },

      toggleCustom: function (r) {
        var open = !this.showCustom[r.oa.id];
        this.showCustom[r.oa.id] = open;
        if (!open) delete this.customFactor[r.oa.id];
      },

      // typing is debounced: each change rebuilds the row and its example
      typeFactor: function (oaId, value) {
        var self = this;
        if (!this._factorTimers) this._factorTimers = {};
        clearTimeout(this._factorTimers[oaId]);
        this._factorTimers[oaId] = setTimeout(function () { self.customFactor[oaId] = value; }, 250);
      },

      unitKey: unitKey,
      displayName: function (name) { return (name || '').replace(UNAVAILABLE_RE, '').replace(/\s+/g, ' ').trim(); },
      tint: tint,
      ink: ink,
      pct: function (s) { return Math.round(s * 100); },
      money: function (v) { return money(v, this.cfg.currency_unit); },

      reset: function () { this.apply(this.d); },

      save: function () {
        var self = this, changes = {};
        this.changedRows.forEach(function (r) {
          changes[r.oa.id] = { article_id: r.chosen.article_id, factor: r.useFactor ? r.factor : 1 };
        });
        var token = document.querySelector('meta[name="csrf-token"]');
        this.saving = true;
        fetch(this.d.urls.save, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-CSRF-Token': token ? token.getAttribute('content') : ''
          },
          body: JSON.stringify({ changes: changes })
        })
          .then(function (r) {
            if (r.status === 410) { self.state = 'error'; self.errorMessage = T.closed; throw new Error('closed'); }
            if (!r.ok) throw new Error('failed');
            return r.json();
          })
          .then(function (json) {
            self.apply(json.data);
            var failed = Object.keys(json.errors || {});
            self.rowErrors = json.errors || {};
            if (failed.length) {
              self.filter = 'all';
              self.notify('error', T.partly(failed.length));
            } else {
              self.notify('ok', T.saved);
            }
          })
          .catch(function (e) { if (e.message !== 'closed') self.notify('error', T.saveError); })
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
      '<div class="sw">' +
      '  <div class="sw-state" v-if="state === \'loading\'"><span class="sw-spinner"></span></div>' +
      '  <div class="sw-state" v-else-if="state === \'error\'">' +
      '    <div class="sw-alert sw-alert-danger">{{ errorMessage }}</div>' +
      '    <button type="button" class="sw-btn" @click="load">{{ T.reload }}</button>' +
      '  </div>' +

      '  <template v-else>' +
      '  <div class="sw-head">' +
      '    <div class="sw-titlebar">' +
      '      <a class="sw-back" :href="d.urls.back">‹ {{ T.back }}</a>' +
      '      <h1 class="sw-title">{{ T.title(d.order.name) }}</h1>' +
      '      <a class="sw-classic" :href="d.urls.legacy">{{ T.classic }}</a>' +
      '    </div>' +
      '    <p class="sw-intro">{{ T.intro }}</p>' +
      '    <div class="sw-summary" :class="{ ok: unavailableRows.length && !openRows.length, open: openRows.length }">' +
      '      {{ T.unavailableOpen(openRows.length, unavailableRows.length) }}' +
      '    </div>' +
      '  </div>' +

      '  <div class="sw-toolbar">' +
      '    <div class="sw-toolbar-row">' +
      '      <span class="sw-searchwrap"><input type="search" class="sw-search" v-model="query" :placeholder="T.search">' +
      '        <button type="button" class="sw-clear" v-if="query" @click="query = \'\'" aria-label="Clear">×</button></span>' +
      '      <div class="sw-filters">' +
      '        <button type="button" :class="{ active: filter === \'all\' }" @click="filter = \'all\'">{{ T.all }} <span>{{ rows.length }}</span></button>' +
      '        <button type="button" :class="{ active: filter === \'unavailable\', bad: openRows.length }" @click="filter = \'unavailable\'">{{ T.unavailable }} <span>{{ unavailableRows.length }}</span></button>' +
      '        <button type="button" :class="{ active: filter === \'changed\' }" @click="filter = \'changed\'">{{ T.changed }} <span>{{ changedRows.length }}</span></button>' +
      '      </div>' +
      '    </div>' +
      // column headings, desktop only (cards stack on phones)
      '    <div class="sw-colhead" v-if="visibleRows.length"><span>{{ T.article }}</span><span>{{ T.replaceWith }}</span></div>' +
      '  </div>' +

      '  <p class="sw-empty" v-if="!visibleRows.length">{{ T.nothing }}</p>' +
      '  <div class="sw-list">' +
      '    <article class="sw-card" v-for="r in visibleRows" :key="r.oa.id" :class="{ \'is-unavailable\': r.unavailable && !r.resolved, \'is-changed\': r.changed, \'is-error\': r.error }">' +
      '      <div class="sw-card-head">' +
      '        <div class="sw-name">' +
      '          <span class="sw-chip bad" v-if="r.unavailable">{{ T.unavailable }}</span>' +
      '          <strong>{{ displayName(r.oa.name) }}</strong>' +
      '          <small class="sw-origin" v-if="r.oa.origin || r.oa.manufacturer">{{ [r.oa.origin, r.oa.manufacturer].filter(Boolean).join(\' · \') }}</small>' +
      '        </div>' +
      '        <div class="sw-price"><strong>{{ money(r.oa.price) }}</strong><small>{{ r.oa.unit_quantity }}×{{ r.oa.unit }}</small></div>' +
      '      </div>' +
      '      <p class="sw-meta">' +
      '        <span>{{ T.wanted(r.oa.quantity, r.oa.quantity + r.oa.tolerance) }}</span>' +
      '        <span>{{ T.households(r.oa.households) }}</span>' +
      '        <span :class="r.oa.units > 0 ? \'ok\' : \'\'">{{ T.cases(r.oa.units) }}</span>' +
      '        <span class="warn" v-if="r.oa.missing_units > 0">{{ T.short(r.oa.missing_units, r.oa.units) }}</span>' +
      '      </p>' +
      '      <div class="sw-replace">' +
      '        <div class="sw-select-row">' +
      '          <sw-picker :id="\'sw-select-\' + r.oa.id" :options="r.options" :score="r.score" :currency="cfg.currency_unit" :aria-label="T.replaceWith" v-model="choice[r.oa.id]"></sw-picker>' +
      '          <span class="sw-match" v-if="r.score != null" :style="{ background: tint(r.score), color: ink(r.score) }">{{ T.match(pct(r.score)) }}</span>' +
      '        </div>' +
      '        <p class="sw-cheaper" v-if="r.cheaper">' +
      '          <span class="sw-chip price ok">{{ T.cheaperHint(r.cheaper.a.name, r.cheaper.a.origin, money(-r.cheaper.delta)) }}</span>' +
      '          <span class="sw-chip" :class="r.cheaperFill.kind">{{ r.cheaperFill.text }}</span>' +
      '          <button type="button" class="sw-linkbtn" @click="pickCheaper(r)">{{ T.use }}</button>' +
      '        </p>' +
      '        <p class="sw-diffs" v-if="r.diffs.length || r.error">' +
      '          <span class="sw-chip bad" v-if="r.error">{{ r.error }}</span>' +
      '          <span class="sw-chip" v-for="(x, i) in r.diffs" :key="i" :class="x.kind">{{ x.text }}</span>' +
      '        </p>' +
      '        <div class="sw-convert sw-ask" v-if="r.customOpen">' +
      '          <strong>{{ T.askFactor(r.oa.unit, r.chosen.unit) }}</strong>' +
      '          <small v-if="r.sameCaseNote">{{ r.sameCaseNote }}</small>' +
      '          <small v-else-if="r.factor === 1 && unitKey(r.oa.unit) === unitKey(r.chosen.unit)">{{ T.customSameUnit }}</small>' +
      '          <div class="sw-ask-row">' +
      '            <span>{{ T.factorLabel(r.oa.unit, r.chosen.unit) }}</span>' +
      '            <input type="text" inputmode="decimal" class="sw-ask-input" :class="{ bad: r.customError }" :value="customFactor[r.oa.id]" @input="typeFactor(r.oa.id, $event.target.value)" placeholder="8, 0.125 or 1/8">' +
      '            <span>{{ T.factorUnit(r.chosen.unit) }}</span>' +
      '          </div>' +
      '          <small v-if="r.customError" class="sw-bad">{{ T.factorBad }}</small>' +
      '          <small v-else-if="!r.example">{{ T.factorEmpty }}</small>' +
      '          <template v-else>' +
      '            <small v-for="(l, i) in r.example.lines" :key="i">{{ l }}</small>' +
      '            <small class="sw-bad" v-if="r.example.zero">{{ r.example.zero }}</small>' +
      '          </template>' +
      '        </div>' +
      '        <label class="sw-convert" v-else-if="r.changed && r.factor > 1">' +
      '          <input type="checkbox" :checked="r.useFactor" @change="convert[r.oa.id] = $event.target.checked">' +
      '          <span><strong>{{ T.convertLabel(r.factor) }}</strong><small>{{ T.convertHint(r.factor, r.oa.unit, r.chosen.unit) }}</small></span>' +
      '        </label>' +
      '        <button type="button" class="sw-linkbtn" v-if="r.changed && !r.needsFactor" @click="toggleCustom(r)">{{ r.customOpen ? T.customClose : T.customOpen }}</button>' +
      '        <button type="button" class="sw-linkbtn" @click="toggleAll(r.oa)">{{ showAll[r.oa.id] ? T.showSimilar : T.showAll }}</button>' +
      '      </div>' +
      '    </article>' +
      '  </div>' +

      '  <footer class="sw-footer">' +
      '    <button type="button" class="sw-btn" :disabled="!dirty || saving" @click="reset">{{ T.reset }}</button>' +
      '    <span class="sw-footer-info">{{ dirty ? T.changes(changedRows.length) : T.noChanges }}</span>' +
      '    <button type="button" class="sw-btn sw-btn-primary" :disabled="!dirty || saving" @click="save">{{ saving ? T.saving : T.save }}</button>' +
      '  </footer>' +
      '  </template>' +

      '  <div class="sw-toast" :class="toast.type" v-if="toast" @click="toast = null">{{ toast.text }}</div>' +
      '</div>'
  };

  function ready(fn) {
    if (document.readyState !== 'loading') fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var el = document.getElementById('swap-app');
    if (!el) return;
    if (!window.Vue) {
      el.innerHTML = '<div class="alert alert-danger">Vue failed to load.</div>';
      return;
    }
    Vue.createApp(SwapApp, { dataUrl: el.getAttribute('data-url') }).mount(el);
  });
})();
