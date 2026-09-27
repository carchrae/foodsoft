# Item search for the modern dashboard (dashboard_app.js).
#
# Looks for articles whose name or manufacturer contains the query, first in
# the open orders (where the member can still order them), then in the most
# recent finished/settled orders (so "when did we last get X?" has an answer).
# Each hit carries the member's own amounts so the dashboard can show them and,
# for open orders, change the amount through OrderingController#update.
class DashboardSearchSerializer
  MIN_QUERY_LENGTH = 2
  RECENT_ORDERS = 20
  MAX_OPEN_HITS = 40
  MAX_RECENT_HITS = 30

  def initialize(user, query, view)
    @ordergroup = user.ordergroup
    @query = query.to_s.strip
    @view = view
  end

  def as_json(*)
    return {query: @query, open: [], recent: []} if @query.length < MIN_QUERY_LENGTH
    open_orders = Order.open_reverse.to_a
    recent_orders = Order.finished.limit(RECENT_ORDERS).to_a
    {
      query: @query,
      open: hits(open_orders, MAX_OPEN_HITS, open: true),
      recent: hits(recent_orders, MAX_RECENT_HITS, open: false),
    }
  end

  private

  def hits(orders, limit, open:)
    return [] if orders.empty?
    by_id = orders.index_by(&:id)
    # escape LIKE wildcards with "!" (sanitize_sql_like is protected on Rails 4.2)
    pattern = "%#{@query.downcase.gsub(/[!%_]/) { |c| "!#{c}" }}%"
    order_articles = OrderArticle.joins(:article).includes(:article_price)
      .where(order_id: by_id.keys)
      .where("LOWER(articles.name) LIKE :q ESCAPE '!' OR LOWER(articles.manufacturer) LIKE :q ESCAPE '!'", q: pattern)
      .to_a
    # orders in the given sequence (soonest closing / most recent first), then by name
    rank = by_id.keys.each_with_index.to_h
    order_articles = order_articles.sort_by { |oa| [rank[oa.order_id], oa.article.name.to_s.downcase] }.first(limit)
    mine = my_articles(order_articles.map(&:id))
    group_orders = my_group_orders(by_id.keys)
    order_articles.map { |oa| hit_json(oa, by_id[oa.order_id], mine[oa.id], group_orders[oa.order_id], open) }
  end

  def hit_json(order_article, order, goa, group_order, open)
    article = order_article.article
    # open orders are priced like the ordering page; finished ones by the price they closed at
    price = open ? article.fc_price : safely(nil) { order_article.price.fc_price }
    {
      id: order_article.id,
      name: article.name,
      manufacturer: article.manufacturer.presence,
      origin: article.origin.presence,
      note: article.note.presence,
      unit: article.unit,
      unit_quantity: article.unit_quantity,
      price: money(price),
      quantity: (goa ? goa.quantity : 0),
      tolerance: (goa ? goa.tolerance : 0),
      # what the member actually received, once the order is finished
      result: (open || goa.nil? ? nil : safely(nil) { goa.result.to_f }),
      order: {
        id: order.id,
        name: order.name,
        open: open,
        stockit: order.stockit?,
        ends_human: @view.format_date(order.ends),
        pickup_human: @view.format_date(order.pickup),
      },
      urls: hit_urls(order, group_order, order_article, open),
    }
  end

  def hit_urls(order, group_order, order_article, open)
    anchor = "article-#{order_article.id}"
    urls = {show: (group_order && @view.group_order_path(group_order))}
    if open && @ordergroup
      urls[:order_modern] = @view.ordering_path(order, anchor: anchor)
      urls[:order] = if group_order
                       @view.edit_group_order_path(group_order, order_id: order.id)
                     else
                       @view.new_group_order_path(order_id: order.id)
                     end
      urls[:data] = @view.data_ordering_path(order)
      urls[:save] = @view.ordering_path(order)
    end
    urls
  end

  def my_articles(order_article_ids)
    return {} if @ordergroup.nil? || order_article_ids.empty?
    GroupOrderArticle.joins(:group_order)
      .where(group_orders: {ordergroup_id: @ordergroup.id}, order_article_id: order_article_ids)
      .index_by(&:order_article_id)
  end

  def my_group_orders(order_ids)
    return {} if @ordergroup.nil?
    GroupOrder.where(ordergroup_id: @ordergroup.id, order_id: order_ids).index_by(&:order_id)
  end

  def safely(fallback)
    yield
  rescue StandardError => e
    Rails.logger.warn("DashboardSearchSerializer: #{e.class}: #{e.message}")
    fallback
  end

  def money(value)
    return nil if value.nil?
    return nil if value.respond_to?(:infinite?) && value.infinite?
    value.to_f.round(2)
  end
end
