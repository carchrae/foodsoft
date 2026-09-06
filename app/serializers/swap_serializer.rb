# Builds the JSON snapshot consumed by the modern (Vue) swap page
# (app/assets/javascripts/swap_app.js). Plain Ruby, no view logic: the page
# does the matching and scoring itself from the full list of available
# articles, so this only has to describe the order and the supplier's catalogue.
#
# Money values are plain floats in currency units.
class SwapSerializer
  def initialize(order, view)
    @order = order
    @view = view
  end

  def as_json(*)
    {
      order: order_json,
      order_articles: @order.order_articles.includes(:article => :article_category, :group_order_articles => []).map { |oa| order_article_json(oa) },
      articles: available_articles.map { |a| article_json(a) },
      config: {currency_unit: FoodsoftConfig[:currency_unit] || ''},
      urls: {
        data: @view.data_swap_path(@order),
        save: @view.swap_path(@order),
        legacy: @view.swap_order_path(@order, classic: 1),
        back: @view.order_path(@order),
      },
    }
  end

  private

  def order_json
    {
      id: @order.id,
      name: @order.name,
      supplier: (@order.supplier.try(:name) || @order.name),
      stockit: @order.stockit?,
      open: @order.open?,
      ends: @order.ends.try(:iso8601),
      ends_human: (@order.ends ? @view.format_time(@order.ends) : nil),
    }
  end

  # Articles the order could swap to: the same list the classic page offers.
  def available_articles
    @order.articles_for_ordering_ungrouped.includes(:article_category).to_a
  end

  def order_article_json(oa)
    households = oa.group_order_articles.count { |goa| goa.quantity.to_i > 0 || goa.tolerance.to_i > 0 }
    article_json(oa.article).merge(
      id: oa.id,
      article_id: oa.article_id,
      quantity: oa.quantity.to_i,
      tolerance: oa.tolerance.to_i,
      units: oa.units.to_i,
      missing_units: oa.missing_units.to_i,
      households: households,
      # each member's wanted / extra, no names: lets the page preview a unit conversion
      amounts: oa.group_order_articles.map { |goa| [goa.quantity.to_i, goa.tolerance.to_i] }.reject { |q| q == [0, 0] },
      available: oa.article.availability && !oa.article.deleted?,
    )
  end

  def article_json(a)
    {
      article_id: a.id,
      name: a.name.to_s,
      origin: a.origin.to_s,
      manufacturer: a.manufacturer.to_s,
      note: a.note.to_s,
      unit: a.unit.to_s,
      unit_quantity: a.unit_quantity.to_i,
      price: a.price.to_f.round(2),
      category: (a.article_category.try(:name) || ''),
    }
  end
end
