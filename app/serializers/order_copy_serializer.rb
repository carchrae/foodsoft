# Builds the JSON snapshot for the modern "copy order" page
# (app/assets/javascripts/order_copy_app.js): the order being copied with the
# demand it saw, the supplier's available articles, a short demand history
# across the supplier's recent orders, and the defaults for the new order.
#
# Plain Ruby; money values are floats in currency units.
class OrderCopySerializer
  HISTORY_ORDERS = 6

  # Price history looks this far back for the per-article summary; the dialog shows everything.
  SUMMARY_MONTHS = 18
  YEAR_MONTHS = 12
  # "STRAWBERRY CLAMSHELL FCY 8x1# UNAVAILABLE!" and "STRAWBERRY CLAMSHELL FCY 8x1#" are one product
  NAME_KEY = lambda { |name| name.to_s.downcase.gsub(/unavailable!?/, ' ').gsub(/[^a-z0-9#%.\/ ]+/, ' ').squeeze(' ').strip }
  # "1lb", "1 LB" and "LB" are one unit (same rule as article_match.js)
  UNIT_KEY = lambda { |unit| unit.to_s.downcase.gsub(/\s+/, '').sub(/\A1(?=[a-z#])/, '') }

  def initialize(source, view)
    @source = source
    @view = view
  end

  # Full price history of one article and its namesakes (any unit), newest first,
  # for the dialog on the copy page.
  def price_history(article)
    keys = supplier_article_keys
    key = keys[article.id]
    return {article: {id: article.id, name: article.name, unit: article.unit, price: article.price.to_f.round(2)}, series: []} if key.nil?
    ids = keys.select { |_, k| k[0] == key[0] }.keys
    articles = Article.where(id: ids).pluck(:id, :name, :unit, :deleted_at).each_with_object({}) { |(id, name, unit, deleted_at), h| h[id] = [name, unit, deleted_at] }
    prices = ArticlePrice.where(article_id: ids).order('created_at DESC').limit(80).pluck(:id, :article_id, :price, :unit_quantity, :created_at)
    ordered = OrderArticle.unscoped.where(article_price_id: prices.map(&:first)).group(:article_price_id).count
    series = prices.map do |pid, aid, price, uq, at|
      name, unit, deleted_at = articles[aid]
      {
        date: at.to_date.iso8601,
        date_human: @view.format_date(at),
        price: price.to_f.round(2),
        unit: unit.to_s,
        unit_quantity: uq.to_i,
        article_id: aid,
        name: name.to_s,
        same_unit: UNIT_KEY.call(unit) == key[1],
        current: (aid == article.id),
        deleted: !deleted_at.nil?,
        orders: ordered[pid].to_i,
      }
    end
    {
      article: {id: article.id, name: article.name, unit: article.unit, unit_quantity: article.unit_quantity.to_i, price: article.price.to_f.round(2)},
      summary: price_summary_for(article),
      series: series,
    }
  end

  def as_json(*)
    {
      source: source_json,
      defaults: defaults_json,
      categories: categories_json,
      unavailable: unavailable_json,
      history: {orders: history_orders.map { |o| {id: o.id, ends_human: @view.format_date(o.ends)} }},
      config: {
        currency_unit: FoodsoftConfig[:currency_unit] || '',
        use_boxfill: !!FoodsoftConfig[:use_boxfill] && @source.is_boxfill_useful?,
        stockit: @source.stockit?,
      },
      end_actions: Order.end_actions.keys.map { |k| {value: k, label: I18n.t("activerecord.attributes.order.end_actions.#{k}")} },
      urls: {
        data: @view.data_order_copy_path(@source),
        save: @view.order_copy_path(@source),
        back: @view.orders_path,
        source: @view.order_path(@source),
        legacy: @view.new_order_path(order_id: @source.id, supplier_id: @source.supplier_id),
        prices: @view.prices_order_copy_path(@source, article_id: 0),
      },
    }
  end

  private

  def source_json
    oas = source_order_articles
    with_demand = oas.count { |oa| oa.quantity.to_i > 0 || oa.tolerance.to_i > 0 }
    {
      id: @source.id,
      name: @source.name,
      state: @source.state,
      starts_human: (@source.starts ? @view.format_time(@source.starts) : nil),
      ends_human: (@source.ends ? @view.format_time(@source.ends) : nil),
      pickup_human: (@source.pickup ? @view.format_date(@source.pickup) : nil),
      note: @source.note.to_s,
      supplier_note: @source.supplier_note.to_s,
      households: households_in(@source),
      articles: oas.size,
      articles_with_demand: with_demand,
      articles_without_demand: oas.size - with_demand,
      total: (safe_money { @source.sum(:gross) }),
    }
  end

  # New order as OrdersController#new would prefill it when copying
  def defaults_json
    # like the classic copy, but a closing/boxfill time that already passed is not reused
    future = ->(t) { t && t > Time.now ? t : nil }
    order = Order.new(supplier_id: @source.supplier_id, note: @source.note, supplier_note: @source.supplier_note,
                      end_action: @source.end_action, ends: future.call(@source.ends), boxfill: future.call(@source.boxfill)).init_dates
    {
      starts: iso_local(order.starts),
      ends: iso_local(order.ends),
      boxfill: iso_local(order.boxfill),
      pickup: (order.pickup ? order.pickup.strftime('%Y-%m-%d') : nil),
      end_action: order.end_action,
      note: order.note.to_s,
      supplier_note: order.supplier_note.to_s,
    }
  end

  def categories_json
    demand = demand_by_article_id
    history = history_by_article_id
    @source.articles_for_ordering.map do |name, articles|
      {name: name, articles: articles.map { |a| article_json(a, demand[a.id], history[a.id]) }}
    end
  end

  def article_json(a, d, h)
    {
      id: a.id,
      name: a.name.to_s,
      order_number: a.order_number.to_s,
      note: a.note.to_s,
      origin: a.origin.to_s,
      manufacturer: a.manufacturer.to_s,
      unit: a.unit.to_s,
      unit_quantity: a.unit_quantity.to_i,
      price: a.price.to_f.round(2),
      fc_price: (safe_money { a.fc_price }),
      supplier_price: (safe_money { a.supplier_price }),
      quantity_available: (a.respond_to?(:quantity_available) ? a.quantity_available.to_i : nil),
      in_source: !d.nil?,
      demand: d,
      history: h,
      prices: price_summaries[a.id],
    }
  end

  # id -> [name key, unit key] for every listing the supplier ever had (deleted ones
  # too). One pluck of three columns; matching by normalised name happens in Ruby so
  # spelling variants ("APPLES GALA  F/XF", "… UNAVAILABLE!") still line up.
  def supplier_article_keys
    @keys ||= begin
      sid = @source.stockit? ? 0 : @source.supplier_id
      Article.where(supplier_id: sid).pluck(:id, :name, :unit).each_with_object({}) do |(id, name, unit), h|
        h[id] = [NAME_KEY.call(name), UNIT_KEY.call(unit)]
      end
    end
  end

  # Per available article: the price before the current one ("last time"), and the
  # low / high / average over the last year, across every namesake with the same unit.
  def price_summaries
    @price_summaries ||= begin
      keys = supplier_article_keys
      # the available catalogue plus the copied order's own articles (some may be gone)
      available = (@source.articles_for_ordering_ungrouped.to_a + source_order_articles.map(&:article)).uniq(&:id)
      wanted = available.map { |a| keys[a.id] }.compact.to_set
      ids = keys.select { |_, k| wanted.include?(k) }.keys
      rows = ArticlePrice.where(article_id: ids).where('created_at >= ?', SUMMARY_MONTHS.months.ago)
                         .order('created_at DESC').pluck(:article_id, :price, :created_at)
      by_key = Hash.new { |h, k| h[k] = [] }
      rows.each { |aid, price, at| by_key[keys[aid]] << [aid, price.to_f, at] }
      available.each_with_object({}) { |a, out| out[a.id] = summarize(a, by_key[keys[a.id]]) }
    end
  end

  def price_summary_for(article)
    price_summaries[article.id] || summarize(article, [])
  end

  def summarize(a, series)
    return nil if series.empty?
    current = a.price.to_f
    own_latest = series.select { |r| r[0] == a.id }.map { |r| r[2] }.max || Time.now
    # the price in force before this one, at least a day older (siblings created in the same sync are not "last time")
    prev = series.find { |r| r[2] < own_latest - 1.day }
    year = series.select { |r| r[2] >= YEAR_MONTHS.months.ago }.map { |r| r[1] }
    year << current if year.empty?
    {
      previous: (prev ? prev[1].round(2) : nil),
      previous_date: (prev ? @view.format_date(prev[2]) : nil),
      change_pct: (prev && prev[1] > 0 ? ((current - prev[1]) / prev[1] * 100).round : nil),
      low: year.min.round(2),
      high: year.max.round(2),
      avg: (year.sum / year.size).round(2),
      count: series.size,
    }
  end

  # Articles of the copied order that can no longer be ordered
  def unavailable_json
    available = @source.articles_for_ordering_ungrouped.map(&:id)
    demand = demand_by_article_id
    history = history_by_article_id
    source_order_articles.reject { |oa| available.include?(oa.article_id) }.map do |oa|
      a = oa.article
      {id: a.id, name: a.name.to_s, unit: a.unit.to_s, unit_quantity: a.unit_quantity.to_i, origin: a.origin.to_s,
       manufacturer: a.manufacturer.to_s, price: a.price.to_f.round(2),
       fc_price: (safe_money { a.fc_price }), supplier_price: (safe_money { a.supplier_price }),
       demand: demand[oa.article_id], history: history[a.id], prices: price_summaries[a.id]}
    end
  end

  def source_order_articles
    @source_order_articles ||= @source.order_articles.includes(:article, :article_price, :group_order_articles).to_a
  end

  # What each article saw in the copied order
  def demand_by_article_id
    @demand ||= source_order_articles.each_with_object({}) do |oa, out|
      goas = oa.group_order_articles.to_a
      households = goas.count { |g| g.quantity.to_i > 0 || g.tolerance.to_i > 0 }
      delivered = goas.map { |g| g.result.to_f }.sum
      unit_size = (oa.price.unit_quantity rescue oa.article.unit_quantity).to_i
      out[oa.article_id] = {
        households: households,
        wanted: oa.quantity.to_i,
        extra: oa.tolerance.to_i,
        unit_size: unit_size,
        units_to_order: oa.units_to_order.to_i,
        units: oa.units.to_f.round(2),
        units_received: (oa.units_received.nil? ? nil : oa.units_received.to_f.round(2)),
        missing_units: (oa.missing_units.to_i rescue 0),
        delivered: delivered.round(2),
        price: (oa.price.price.to_f.round(2) rescue oa.article.price.to_f.round(2)),
      }
    end
  end

  # The supplier's most recent finished orders, newest first, including the copied one
  def history_orders
    @history_orders ||= begin
      scope = @source.stockit? ? Order.where(supplier_id: 0) : Order.where(supplier_id: @source.supplier_id)
      scope.where("state = 'finished' OR state = 'closed'").where('ends <= ?', @source.ends || Time.now)
           .reorder('ends DESC').limit(HISTORY_ORDERS).to_a
    end
  end

  # Per article: in how many of the recent orders it was offered, in how many
  # somebody wanted it, and the households per order (newest first, nil = not offered)
  def history_by_article_id
    @history ||= begin
      ids = history_orders.map(&:id)
      per_order = Hash.new { |h, k| h[k] = {} }
      OrderArticle.unscoped.where(order_id: ids).includes(:group_order_articles).each do |oa|
        per_order[oa.article_id][oa.order_id] = oa.group_order_articles.count { |g| g.quantity.to_i > 0 || g.tolerance.to_i > 0 }
      end
      per_order.each_with_object({}) do |(article_id, by_order), out|
        series = ids.map { |oid| by_order.key?(oid) ? by_order[oid] : nil }
        offered = series.compact
        out[article_id] = {
          offered: offered.size,
          ordered: offered.count { |n| n > 0 },
          households: series,
          avg_households: (offered.empty? ? 0 : (offered.sum.to_f / offered.size).round(1)),
        }
      end
    end
  end

  def households_in(order)
    GroupOrderArticle.unscoped.joins(:group_order).where(group_orders: {order_id: order.id})
      .where('group_order_articles.quantity > 0 OR group_order_articles.tolerance > 0')
      .distinct.count('group_order_articles.group_order_id')
  rescue StandardError
    nil
  end

  def iso_local(time)
    time ? time.in_time_zone.strftime('%Y-%m-%dT%H:%M') : nil
  end

  def safe_money
    v = yield
    v.nil? || !v.to_f.finite? ? nil : v.to_f.round(2)
  rescue StandardError
    nil
  end
end
