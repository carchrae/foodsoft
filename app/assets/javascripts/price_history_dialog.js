// Price history dialog shared by the modern pages (copy order, ordering), Vue 3
// in plain ES5. Fetches `url` (JSON from OrderCopySerializer#price_history) and
// shows the price summary and every earlier price of the article and its
// namesakes. Styled by order_copy_app.scss, so it renders inside its own .oc.
(function () {
  'use strict';

  var T = {
    priceHistory: 'Price history',
    close: 'Close',
    loading: 'Loading prices…',
    error: 'Could not load the prices. Please try again.',
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
    otherUnit: 'other unit'
  };

  function money(v, unit) {
    if (v == null || !isFinite(v)) return '—';
    if (window.I18n && typeof I18n.toCurrency === 'function') {
      return I18n.toCurrency(v, { unit: unit || '', precision: 2 });
    }
    return (v < 0 ? '-' : '') + (unit || '') + Math.abs(v).toFixed(2);
  }

  window.FoodsoftPriceDialog = {
    props: {
      name: { type: String, required: true },
      url: { type: String, required: true },
      currencyUnit: { type: String, default: '' }
    },
    emits: ['close'],

    data: function () { return { T: T, loading: true, data: null, error: null }; },

    created: function () {
      var self = this;
      fetch(this.url, { credentials: 'same-origin', headers: { 'Accept': 'application/json' } })
        .then(function (r) { if (!r.ok) throw new Error('failed'); return r.json(); })
        .then(function (json) { self.data = json; self.loading = false; })
        .catch(function () { self.error = T.error; self.loading = false; });
    },

    methods: {
      money: function (v) { return money(v, this.currencyUnit); },
      // change against the next older price with the same kind of unit
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
      }
    },

    template:
      '<div class="oc oc-dialog-host">' +
      '  <div class="oc-modal-backdrop" @click.self="$emit(\'close\')">' +
      '    <div class="oc-modal" role="dialog" aria-modal="true">' +
      '      <div class="oc-modal-head">' +
      '        <div><span class="oc-label">{{ T.priceHistory }}</span><h3>{{ name }}</h3></div>' +
      '        <button type="button" class="oc-modal-close" @click="$emit(\'close\')" :aria-label="T.close">×</button>' +
      '      </div>' +
      '      <p class="oc-state" v-if="loading"><span class="oc-spinner"></span> {{ T.loading }}</p>' +
      '      <div class="oc-alert oc-alert-danger" v-else-if="error">{{ error }}</div>' +
      '      <template v-else>' +
      '        <div class="oc-price-summary" v-if="data.summary">' +
      '          <div><small>{{ T.priceNow }}</small><strong>{{ money(data.article.price) }}</strong></div>' +
      '          <div v-if="data.summary.previous != null"><small>{{ T.priceLast }}</small><strong>{{ money(data.summary.previous) }}</strong><small>{{ data.summary.previous_date }}</small></div>' +
      '          <div><small>{{ T.priceLow }}</small><strong class="ok">{{ money(data.summary.low) }}</strong></div>' +
      '          <div><small>{{ T.priceHigh }}</small><strong class="bad">{{ money(data.summary.high) }}</strong></div>' +
      '          <div><small>{{ T.priceAvg }}</small><strong>{{ money(data.summary.avg) }}</strong></div>' +
      '        </div>' +
      '        <p class="oc-modal-hint">{{ T.priceHint }}</p>' +
      '        <p class="oc-empty" v-if="!data.series.length">{{ T.priceEmpty }}</p>' +
      '        <div class="oc-table-wrap" v-else>' +
      '        <table class="oc-price-table">' +
      '          <thead><tr><th>{{ T.colDate }}</th><th>{{ T.colPrice }}</th><th></th><th>{{ T.colChange }}</th><th>{{ T.colPack }}</th><th>{{ T.colOrders }}</th></tr></thead>' +
      '          <tbody>' +
      '            <tr v-for="(r, i) in data.series" :key="i" :class="{ current: r.current, muted: !r.same_unit }">' +
      '              <td>{{ r.date_human }}<small v-if="r.current"> · {{ T.currentRow }}</small><small v-else-if="r.deleted"> · {{ T.deletedRow }}</small></td>' +
      '              <td class="num"><strong>{{ money(r.price) }}</strong></td>' +
      '              <td class="bar"><span :style="{ width: barWidth(data.series, r) + \'%\' }"></span></td>' +
      '              <td class="num"><span v-if="rowChange(data.series, i)" :class="rowChange(data.series, i).kind">{{ rowChange(data.series, i).pct > 0 ? \'+\' : \'\' }}{{ rowChange(data.series, i).pct }}%</span></td>' +
      '              <td>{{ r.unit_quantity }}×{{ r.unit }}<small v-if="!r.same_unit"> · {{ T.otherUnit }}</small><small v-if="r.name !== name" :title="r.name"> · {{ r.name }}</small></td>' +
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
})();
