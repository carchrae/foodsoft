# How full an order article's current case is, honouring split cases.
#
# Same rules as the ordering page (ordering_app.js, derive()): below the split
# amount we work towards the split (e.g. a half case); over it the split ships
# and the rest counts towards the whole case. Used by the nearly-full case
# report (page and email) for the cards and for ranking. Plain Ruby, no model
# changes.
class CaseFill
  GLYPHS = {2 => '½', 3 => '⅓', 4 => '¼'}.freeze

  attr_reader :order_article, :unit_size, :split, :have, :target, :served, :need, :percent

  def initialize(order_article)
    @order_article = order_article
    article = order_article.article
    # the case size the order was placed with (the article may have changed since)
    @unit_size = order_article.price.unit_quantity.to_i
    @split = split_size_for(article)
    remainder = @unit_size > 0 ? order_article.quantity % @unit_size : 0
    @have = remainder + order_article.tolerance
    @served = 0
    @target = @unit_size
    if @split && @have < @split
      @target = @split
    elsif @split
      @served = (@have / @split) * @split
    end
    @need = [@target - @have, 0].max
    @percent = @target > 0 ? [[((@have.to_f / @target) * 100).round, 0].max, 100].min : 0
  end

  # Cases the supplier ships for the demand, counting a full split: 12 of a
  # splittable 24CT is 0.5, 10 of a 30CT is 0.33333, 15 + 7 of a 12CT is 1.5.
  # The same rules and order of checks as the ordering page (ordering_app.js,
  # derive()); without a split this is OrderArticle#calculate_units_to_order.
  # Rounded to the 5 decimals of order_articles.units_received.
  def units
    quantity = order_article.quantity.to_i
    tolerance = order_article.tolerance.to_i
    return quantity if @unit_size <= 1
    full = quantity / @unit_size
    remainder = quantity % @unit_size
    return full if remainder == 0
    return full + 1 if remainder + tolerance >= @unit_size
    return full unless @split && remainder + tolerance >= @split
    served = ((remainder + tolerance) / @split) * @split
    (full + served.to_f / @unit_size).round(5)
  end

  # 0..100 share of the whole case that already ships as a split
  def served_percent
    @unit_size > 0 ? ((@served.to_f / @unit_size) * 100).round : 0
  end

  # "½" when working towards half a case, nil when towards the whole case
  def target_fraction
    fraction_of(@target) if @target < @unit_size
  end

  def served_fraction
    fraction_of(@served) if @served > 0
  end

  # "a ½ case" / "the case"
  def case_word
    target_fraction ? "a #{target_fraction} case" : 'the case'
  end

  private

  def fraction_of(amount)
    return nil unless amount > 0 && amount < @unit_size
    GLYPHS[(@unit_size.to_f / amount).round] || "#{amount}-of-#{@unit_size}"
  end

  # Uses the ordering page's rules (OrderingSerializer). Referenced directly so
  # Rails autoloads it; `defined?` would not.
  def split_size_for(article)
    return nil unless OrderingSerializer.splittable_cases?
    return nil unless @unit_size > 1 && article.note.to_s =~ OrderingSerializer::SPLITTABLE_NOTE
    size = OrderingSerializer::SPLIT_SIZES[@unit_size] || (@unit_size * OrderingSerializer::DEFAULT_SPLIT_FRACTION).round
    size < @unit_size ? size : nil
  rescue NameError
    nil
  end
end
