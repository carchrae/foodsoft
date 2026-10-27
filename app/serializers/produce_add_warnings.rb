# Reasons to think twice before adding a catalogue article to a produce order
# (OrderCatalogueSerializer, shown as a confirm dialog by ordering_app.js).
# Produce cases only ship when members fill them, so the order works best with
# few, popular items:
#
#   same:    the order already has an article of that name (the catalogue lists
#            some produce twice, at different prices)
#   similar: the order already has the same kind of produce ("POTATO RED BULK"
#            while "POTATO YELLOW BAGGED" is on it); a second kind splits the
#            demand and neither case fills
#   past:    on earlier produce orders of the supplier it rarely got near a case
#   large:   the case is much dearer than a typical case on this order, or
#            heavier than any case on it
#
# The data only, the page words it.
class ProduceAddWarnings
  # an order is a produce order when its note says so ("Produce")
  PRODUCE_NOTE = /produce/i
  PAST_PERIOD = 1.year
  # past demand counts as low from this many earlier orders on...
  LOW_DEMAND_MIN_ORDERS = 3
  # ...when members wanted less than this share of a case on average and it filled less than half the time
  LOW_DEMAND_CASES = 0.5
  # a case is large at this many times the order's median case price, or when
  # it is heavier than every case on the order and at least this heavy
  LARGE_CASE_PRICE_FACTOR = 2
  LARGE_CASE_WEIGHT_LB = 50
  KG_IN_LB = 2.20462

  def self.produce?(order)
    !order.stockit? && !!(order.note.to_s =~ PRODUCE_NOTE)
  end

  def initialize(order, articles)
    @order = order
    @articles = articles
  end

  # {article_id => {similar: [names], past: {...}, large: {...}}}, only articles with a warning
  def to_h
    return {} if @articles.empty?
    @articles.each_with_object({}) do |article, out|
      warnings = {
        same: order_articles.any? { |a| same_name?(a, article) } || nil,
        similar: similar_to(article).presence,
        past: low_demand(article),
        large: large(article),
      }.compact
      out[article.id] = warnings if warnings.any?
    end
  end

  private

  def order_articles
    @order_articles ||= @order.order_articles.includes(:article).map(&:article)
  end

  # names on the order of the same kind of produce, by the first word of the name
  def similar_to(article)
    kind = kind_of(article.name)
    return [] unless kind
    order_articles.select { |a| kind_of(a.name) == kind && !same_name?(a, article) }.map(&:name)
  end

  def same_name?(a, b)
    a.name.to_s.squish.casecmp(b.name.to_s.squish).zero?
  end

  # "POTATOES" -> "POTATO", "BERRIES" -> "BERRY", "GRAPES"/"GRAPE" -> "GRAP"
  def kind_of(name)
    word = name.to_s.upcase.split(/\s+/).first.to_s.gsub(/[^A-Z]/, '')
    return nil if word.length < 3
    word.sub(/IES\z/, 'Y').sub(/S\z/, '').sub(/E\z/, '')
  end

  def low_demand(article)
    stats = past_stats[article.name]
    return nil unless stats && stats[:orders] >= LOW_DEMAND_MIN_ORDERS
    return nil unless stats[:avg_cases] < LOW_DEMAND_CASES && stats[:filled] * 2 < stats[:orders]
    stats
  end

  # Earlier produce orders of the supplier that had these articles (by name, as
  # the catalogue relists articles): how often, how often a case was ordered,
  # and how much of a case members wanted on average.
  def past_stats
    @past_stats ||= begin
      orders = Order.where(supplier_id: @order.supplier_id, state: %w[finished closed])
        .where('orders.ends > ?', PAST_PERIOD.ago).where('orders.note ILIKE ?', '%produce%')
      OrderArticle.unscoped.joins(:article)
        .where(order_id: orders.select(:id), articles: {name: @articles.map(&:name).uniq})
        .group('articles.name')
        .pluck('articles.name', 'COUNT(*)',
               'SUM(CASE WHEN order_articles.units_to_order > 0 THEN 1 ELSE 0 END)',
               'AVG(order_articles.quantity::numeric / GREATEST(articles.unit_quantity, 1))')
        .each_with_object({}) do |(name, count, filled, avg), out|
          out[name] = {orders: count.to_i, filled: filled.to_i, avg_cases: avg.to_f.round(2)}
        end
    end
  end

  def large(article)
    price = case_price(article)
    weight = case_weight_lb(article)
    typical = typical_case_price
    dear = price && typical && price >= LARGE_CASE_PRICE_FACTOR * typical
    heavy = weight && weight >= LARGE_CASE_WEIGHT_LB && weight > heaviest_case_lb
    return nil unless dear || heavy
    {case_price: price && price.round(2), typical_case_price: typical && typical.round(2), weight_lb: weight && weight.round}
  end

  def heaviest_case_lb
    @heaviest ||= order_articles.map { |a| case_weight_lb(a) }.compact.max || 0
  end

  def typical_case_price
    return @typical if defined?(@typical)
    prices = order_articles.map { |a| case_price(a) }.compact.sort
    @typical = prices.empty? ? nil : prices[prices.length / 2]
  end

  def case_price(article)
    price = article.fc_price
    price && price.to_f * [article.unit_quantity.to_i, 1].max
  rescue StandardError
    nil
  end

  # "LB" x 50, "5LB" x 10, "2kg" x 1; nil when the unit is not a weight
  def case_weight_lb(article)
    m = /\A(\d*\.?\d+)?\s*(LBS?|#|KG)\z/i.match(article.unit.to_s.strip)
    return nil unless m
    per_unit = (m[1] ? m[1].to_f : 1) * (m[2].casecmp('kg').zero? ? KG_IN_LB : 1)
    per_unit * [article.unit_quantity.to_i, 1].max
  end
end
