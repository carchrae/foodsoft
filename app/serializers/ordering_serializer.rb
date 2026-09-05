# Builds the JSON snapshot consumed by the modern (Vue) ordering page.
#
# This class is the boundary between the browser and the server: the page only
# ever sees this structure, so when the server side changes (e.g. after the
# rebuild) only this file and OrderingController need to be adjusted. Business
# logic stays in the models (GroupOrder#load_data, GroupOrder#save_ordering!).
#
# Money values are plain floats in currency units, never BigDecimal/Infinity.
class OrderingSerializer
  # Tolerance (in currency units) auto-added when an amount is first entered.
  # Mirrors the hard-coded `6 / price` in app/assets/javascripts/ordering.js.
  AUTO_TOLERANCE_VALUE = 6

  # Articles whose note matches this can be shipped as a fraction of a case.
  SPLITTABLE_NOTE = /splittable/i
  # Units the supplier ships for a partial case, by case size. Anything else splits in half.
  SPLIT_SIZES = {24 => 12, 20 => 10, 25 => 10, 30 => 10}.freeze
  DEFAULT_SPLIT_FRACTION = 0.5

  # Feature flag: honour "case splittable" notes. On unless app_config says otherwise.
  def self.splittable_cases?
    value = FoodsoftConfig[:splittable_cases]
    value.nil? ? true : !!value
  end

  def initialize(order, group_order, view, stock_order: false)
    @order = order
    @group_order = group_order
    @view = view
    @stock_order = stock_order
  end

  def as_json(*)
    data = @group_order.load_data
    {
      order: order_json,
      group_order: group_order_json,
      funds: {
        account_balance: money(data[:account_balance]),
        available_funds: money(data[:available_funds]),
      },
      config: config_json,
      urls: urls_json,
      categories: categories_json(data[:order_articles]),
    }
  end

  private

  def order_json
    {
      id: @order.id,
      name: @order.name,
      note: @order.note.presence,
      supplier: (@order.stockit? ? nil : @order.supplier.try(:name)),
      created_by: @view.show_user(@order.created_by),
      ends: @order.ends.try(:iso8601),
      ends_human: @view.format_datetime_timespec(@order.ends, '%k:%M %P on %A, %d %B').to_s.strip.presence,
      pickup: @order.pickup.try(:iso8601),
      pickup_human: @view.format_date(@order.pickup),
      stockit: @order.stockit?,
      boxfill: !!@order.boxfill?,
      ordergroups_ordered: ordergroups_ordered,
    }
  end

  # How many ordergroups have at least one article in this order.
  def ordergroups_ordered
    GroupOrderArticle.unscoped
      .joins(:group_order)
      .where(group_orders: {order_id: @order.id})
      .where('group_order_articles.quantity > 0 OR group_order_articles.tolerance > 0')
      .distinct.count('group_order_articles.group_order_id')
  rescue StandardError
    nil
  end

  def group_order_json
    {
      id: @group_order.id,
      persisted: @group_order.persisted?,
      lock_version: @group_order.lock_version,
      price: money(@group_order.price),
      updated_by: (@group_order.updated_by && @view.show_user(@group_order.updated_by)),
      updated_on: @group_order.updated_on.try(:iso8601),
    }
  end

  # Also used on its own by the combined page when there are no open orders.
  def self.config_json
    new(nil, nil, nil).send(:config_json)
  end

  def config_json
    {
      tolerance_is_costly: !!FoodsoftConfig[:tolerance_is_costly],
      minimum_balance: (FoodsoftConfig[:minimum_balance] || 0).to_f,
      charge_members_manually: !!FoodsoftConfig[:charge_members_manually],
      currency_unit: FoodsoftConfig[:currency_unit] || '',
      auto_tolerance_value: AUTO_TOLERANCE_VALUE,
      splittable_cases: self.class.splittable_cases?,
      payments_url: (@view ? payments_url : nil),
    }
  end

  def urls_json
    stock = @stock_order ? {stock_order: 1} : {}
    legacy = if @group_order.persisted?
               @view.edit_group_order_path(@group_order, stock.merge(order_id: @order.id))
             else
               @view.new_group_order_path(stock.merge(order_id: @order.id))
             end
    {
      data: @view.data_ordering_path(@order, stock),
      save: @view.ordering_path(@order, stock),
      legacy: legacy,
      back: @view.group_orders_path,
      show: (@group_order.persisted? ? @view.group_order_path(@group_order) : nil),
    }
  end

  def categories_json(articles_data)
    @order.articles_grouped_by_category.map do |category, order_articles|
      {
        name: category,
        articles: order_articles.map { |oa| article_json(oa, articles_data[oa.id]) },
      }
    end
  end

  def article_json(order_article, d)
    article = order_article.article
    boxfill = @order.boxfill?
    {
      id: order_article.id,
      name: article.name,
      manufacturer: article.manufacturer.presence,
      origin: article.origin.presence,
      order_number: article.order_number.presence,
      note: article.note.presence,
      supplier: (@order.stockit? ? article.supplier.try(:name) : nil),
      unit: article.unit,
      unit_quantity: d[:unit],
      price: money(d[:price]),
      deposit: money(d[:deposit]),
      quantity: d[:quantity],
      tolerance: d[:tolerance],
      others_quantity: d[:others_quantity],
      others_tolerance: d[:others_tolerance],
      used_quantity: d[:used_quantity],
      used_tolerance: d[:used_tolerance],
      quantity_available: d[:quantity_available],
      # boxfill phase: members may only add, not reduce, and only up to a full case
      min_quantity: (boxfill ? d[:quantity] : 0),
      max_quantity: (boxfill ? d[:quantity] + d[:missing_units] : nil),
      min_tolerance: (boxfill ? d[:tolerance] : 0),
      # fraction of a case the supplier will ship for this article, nil if only whole cases
      split_fraction: split_fraction_for(article),
    }
  end

  def split_fraction_for(article)
    return nil unless self.class.splittable_cases?
    unit_quantity = article.unit_quantity.to_i
    return nil unless unit_quantity > 1 && article.note.to_s =~ SPLITTABLE_NOTE
    size = SPLIT_SIZES[unit_quantity]
    size ? (size.to_f / unit_quantity).round(4) : DEFAULT_SPLIT_FRACTION
  end

  def payments_url
    return nil unless defined?(FoodsoftWiki) && @view.respond_to?(:link_to_wikipage_by_permalink)
    @view.wiki_page_path('Payments') if @view.respond_to?(:wiki_page_path)
  rescue StandardError
    nil
  end

  def money(value)
    return nil if value.nil?
    return nil if value.respond_to?(:infinite?) && value.infinite?
    value.to_f.round(2)
  end
end
