# Item search for the modern dashboard (dashboard_app.js).
#
# Looks for articles whose name or manufacturer contains every word of the
# query (in any order, so "red apple" also finds "Apple, red"), first in
# the open orders (where the member can still order them), then in the
# suppliers' catalogues (what could be ordered next time, with when it was
# last ordered; suppliers without an order in the last 6 months come in a
# separate, older list). Open-order hits carry the member's own amounts so the
# dashboard can show and change them through OrderingController#update.
# Both lists come closest match first.
class DashboardSearchSerializer
  MIN_QUERY_LENGTH = 2
  MAX_OPEN_HITS = 40
  MAX_ARTICLE_HITS = 30
  # catalogue rows fetched before ranking; enough for any sensible query
  MAX_ARTICLE_ROWS = 500
  MAX_WORDS = 6
  # suppliers with no order for this long go to the older list
  RECENT_SUPPLIER_PERIOD = 6.months

  def initialize(user, query, view)
    @ordergroup = user.ordergroup
    @query = query.to_s.strip
    @words = @query.downcase.split(/\s+/).reject(&:empty?).uniq.first(MAX_WORDS)
    @view = view
  end

  def as_json(*)
    return {query: @query, open: [], articles: [], older_articles: []} if @query.length < MIN_QUERY_LENGTH || @words.empty?
    open_orders = Order.open_reverse.to_a
    open = open_hits(open_orders)
    articles, older = article_hits(open.map { |h| h[:article_id] }, open_orders)
    {
      query: @query,
      open: open.map { |h| h[:json] },
      articles: articles,
      older_articles: older,
    }
  end

  private

  def open_hits(orders)
    return [] if orders.empty?
    by_id = orders.index_by(&:id)
    order_articles = OrderArticle.joins(:article).includes(:article_price)
      .where(order_id: by_id.keys)
      .where(*word_conditions)
      .to_a
    # closest match first, then the order closing soonest
    rank = by_id.keys.each_with_index.to_h
    order_articles = order_articles.sort_by do |oa|
      name = oa.article.name.to_s.downcase
      [relevance(name), name.length, rank[oa.order_id], name]
    end.first(MAX_OPEN_HITS)
    mine = my_articles(order_articles.map(&:id))
    group_orders = my_group_orders(by_id.keys)
    order_articles.map do |oa|
      {article_id: oa.article_id, json: hit_json(oa, by_id[oa.order_id], mine[oa.id], group_orders[oa.order_id])}
    end
  end

  # Available articles of the suppliers (not the stock), leaving out the ones
  # already shown in an open order. Returns two lists: articles of suppliers
  # ordered from in the last 6 months, and those of the other suppliers.
  # Articles of a supplier with exactly one open order can be added to it (add_to).
  def article_hits(skip_ids, open_orders = [])
    articles = Article.available.not_in_stock.joins(:supplier).merge(Supplier.undeleted)
      .includes(:supplier)
      .where(*word_conditions)
    articles = articles.where.not(id: skip_ids) if skip_ids.any?
    articles = articles.limit(MAX_ARTICLE_ROWS).to_a.sort_by do |a|
      name = a.name.to_s.downcase
      [relevance(name), name.length, name, a.supplier.name.to_s.downcase]
    end
    supplier_last = Order.where(supplier_id: articles.map(&:supplier_id).uniq).group(:supplier_id).maximum(:ends)
    since = RECENT_SUPPLIER_PERIOD.ago
    recent, older = articles.partition { |a| supplier_last[a.supplier_id] && supplier_last[a.supplier_id] >= since }
    recent = recent.first(MAX_ARTICLE_HITS)
    older = older.first(MAX_ARTICLE_HITS)
    last = last_ordered(recent + older)
    add_to = add_targets(recent + older, open_orders)
    [recent, older].map do |list|
      list.map do |a|
        json = article_json(a, last[[a.supplier_id, a.name]])
        add_to[a.id] ? json.merge(add_to: add_to[a.id]) : json
      end
    end
  end

  # {article_id => {order: {...}, urls: {...}, warnings: {...}}} for the articles
  # whose supplier has exactly one open order (OrderingController#add_article);
  # with several the member would have to pick, which the ordering page does.
  def add_targets(articles, open_orders)
    return {} if @ordergroup.nil? || articles.empty?
    by_supplier = open_orders.reject(&:stockit?).group_by(&:supplier_id).select { |_, orders| orders.size == 1 }
    group_orders = my_group_orders(by_supplier.values.flatten.map(&:id))
    articles.group_by(&:supplier_id).each_with_object({}) do |(supplier_id, list), out|
      order = by_supplier[supplier_id].try(:first)
      next unless order
      warnings = ProduceAddWarnings.produce?(order) ? ProduceAddWarnings.new(order, list).to_h : {}
      group_order = group_orders[order.id]
      list.each do |a|
        out[a.id] = {
          order: {id: order.id, name: order.name, open: true, stockit: false,
                  ends_human: @view.format_date(order.ends), pickup_human: @view.format_date(order.pickup)},
          urls: {
            add: @view.add_article_ordering_path(order),
            data: @view.data_ordering_path(order),
            save: @view.ordering_path(order),
            order_modern: @view.ordering_path(order),
            order: (group_order ? @view.edit_group_order_path(group_order, order_id: order.id) : @view.new_group_order_path(order_id: order.id)),
            show: (group_order && @view.group_order_path(group_order)),
          },
          warnings: warnings[a.id],
        }.compact
      end
    end
  end

  # When each article was last in a finished order. Synced catalogues get a new
  # article row per listing, so this goes by supplier and name.
  def last_ordered(articles)
    return {} if articles.empty?
    OrderArticle.joins(:article, :order)
      .merge(Order.finished.except(:order))
      .where(articles: {supplier_id: articles.map(&:supplier_id).uniq, name: articles.map(&:name).uniq})
      .group('articles.supplier_id', 'articles.name')
      .maximum('orders.ends')
  end

  def article_json(article, last_ends)
    {
      id: article.id,
      name: article.name,
      manufacturer: article.manufacturer.presence,
      origin: article.origin.presence,
      note: article.note.presence,
      unit: article.unit,
      unit_quantity: article.unit_quantity,
      price: money(safely(nil) { article.fc_price }),
      supplier: article.supplier.name,
      last_ordered_human: (last_ends && @view.format_date(last_ends)),
    }
  end

  # SQL and binds for: every word is in the name or the manufacturer
  def word_conditions
    conditions = @words.each_index.map do |i|
      "(LOWER(articles.name) LIKE :w#{i} ESCAPE '!' OR LOWER(articles.manufacturer) LIKE :w#{i} ESCAPE '!')"
    end
    # escape LIKE wildcards with "!" (sanitize_sql_like is protected on Rails 4.2)
    patterns = @words.each_with_index.map { |w, i| [:"w#{i}", "%#{w.gsub(/[!%_]/) { |c| "!#{c}" }}%"] }.to_h
    [conditions.join(' AND '), patterns]
  end

  # How closely an article name matches the query, lower is closer: the exact
  # name, then names starting with the query, the query as a phrase, every word
  # at the start of a word in the name, every word anywhere in the name, and
  # last the hits that only match through the manufacturer.
  def relevance(name)
    name = name.squish
    phrase = @words.join(' ')
    if name == phrase then 0
    elsif name.start_with?(phrase) then 1
    elsif name =~ word_start(phrase) then 2
    elsif name.include?(phrase) then 3
    elsif @words.all? { |w| name =~ word_start(w) } then 4
    elsif @words.all? { |w| name.include?(w) } then 5
    else 6
    end
  end

  def word_start(text)
    /(?<![[:alnum:]])#{Regexp.escape(text)}/
  end

  def hit_json(order_article, order, goa, group_order)
    article = order_article.article
    # priced like the ordering page
    price = article.fc_price
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
      order: {
        id: order.id,
        name: order.name,
        open: true,
        stockit: order.stockit?,
        ends_human: @view.format_date(order.ends),
        pickup_human: @view.format_date(order.pickup),
      },
      urls: hit_urls(order, group_order, order_article),
    }
  end

  def hit_urls(order, group_order, order_article)
    anchor = "article-#{order_article.id}"
    urls = {show: (group_order && @view.group_order_path(group_order))}
    if @ordergroup
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
