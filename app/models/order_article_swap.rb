# Replaces the article of an order line after the order was closed (state
# 'finished') and before it is settled: the supplier sent something else, e.g.
# a case of 54CT apples instead of 12x3LB bags. Open orders are handled by
# SwapController itself, there nothing is frozen yet.
#
# A closed order differs from an open one in three ways, all handled here:
# - the line has its own price snapshot (OrderArticle#price), which has to move
#   to the new article together with the article itself;
# - members are charged on GroupOrderArticle#result, which can be hand edited, so
#   it is scaled to whole units and not redistributed from the order queue;
# - units_to_order, units_billed and units_received count supplier cases, so
#   they are converted to the new case size (OrderArticle#update_results! would
#   overwrite units_to_order with the members' total).
#
# Self-contained on purpose so it can be dropped into another branch.
class OrderArticleSwap
  # scale of the decimal result and units columns
  PRECISION = 5

  # Stock orders stay out: their results depend on the stock itself.
  def self.allowed?(order)
    order.finished? && !order.stockit?
  end

  # factor: how many of the new article make one of the old (3LB bag -> LB is 3)
  def initialize(order_article, article, factor = 1, user = nil)
    @oa = order_article
    @article = article
    @factor = BigDecimal(factor.to_s)
    @user = user
  end

  def apply!
    OrderArticle.transaction do
      old_name = @oa.article.name
      old_size = @oa.price.unit_quantity
      group_orders = @oa.group_order_articles.map(&:group_order).uniq

      scale_members! unless @factor == 1
      new_price = @article.article_prices.first
      convert_units(old_size, new_price.unit_quantity)
      @oa.article = @article
      @oa.article_price = new_price
      @oa.save!

      group_orders.each(&:update_price!)
      add_comment(old_name)
    end
  end

  private

  def scale_members!
    goas = @oa.group_order_articles.includes(:group_order_article_quantities).sort_by(&:id)
    results = whole_shares(goas.map { |goa| goa[:result] })
    computed = whole_shares(goas.map { |goa| goa[:result_computed] })
    goas.each_with_index { |goa, i| scale_goa(goa, results[i], computed[i]) }
    @oa.group_order_articles.reset
    @oa.quantity = @oa.group_order_articles.map(&:quantity).sum
    @oa.tolerance = @oa.group_order_articles.map(&:tolerance).sum
  end

  def scale_goa(goa, result, computed)
    quantity, tolerance = scale_wanted(goa)
    if quantity == 0 && tolerance == 0 && result.to_f == 0
      goa.destroy
    else
      goa.result = result
      goa.result_computed = computed
      goa.quantity = quantity
      goa.tolerance = tolerance
      goa.save!
    end
  end

  # Scales the amounts to whole numbers that add up to the scaled total: 12 bags
  # as 56CT is 56, where rounding each member could give 57. The units left after
  # rounding down go to the largest fractions, ties to the earliest entry.
  # Mirrored in roundedShares (swap_app.js) for the preview.
  def whole_shares(amounts)
    scaled = amounts.map { |amount| ((amount || 0).to_d * @factor).round(PRECISION) }
    shares = scaled.map { |amount| amount.floor }
    left = scaled.sum.round - shares.sum
    by_fraction = scaled.each_index.sort_by { |i| [shares[i] - scaled[i], i] }
    by_fraction.first(left).each { |i| shares[i] += 1 }
    shares.each_with_index.map { |share, i| share unless amounts[i].nil? }
  end

  # What members asked for stays whole, like in an open order. Lines added
  # during balancing have no queue records, only the totals.
  def scale_wanted(goa)
    quantities = goa.group_order_article_quantities.to_a
    return [scale_whole(goa.quantity), scale_whole(goa.tolerance)] if quantities.empty?
    quantities.each do |q|
      q.quantity = scale_whole(q.quantity)
      q.tolerance = scale_whole(q.tolerance)
      if q.quantity == 0 && q.tolerance == 0
        q.destroy
      else
        q.save!
      end
    end
    kept = quantities.reject(&:destroyed?)
    [kept.map(&:quantity).sum, kept.map(&:tolerance).sum]
  end

  def scale_whole(amount)
    (amount * @factor).round.to_i
  end

  def convert_units(old_size, new_size)
    convert = ->(units) { (units * old_size * @factor / new_size).round(PRECISION) }
    @oa.units_received = convert.call(@oa.units_received) unless @oa.units_received.nil?
    @oa.units_billed = convert.call(@oa.units_billed) unless @oa.units_billed.nil?
    # a whole number: one case for one slightly bigger or smaller case stays one,
    # and what was ordered stays ordered
    @oa.units_to_order = [convert.call(@oa.units_to_order).round, 1].max if @oa.units_to_order > 0
  end

  # order_article has no history of its own, this is the record of the old article
  def add_comment(old_name)
    return unless @user
    text = I18n.t('orders.swap.comment', from: old_name, to: @article.name, factor: @factor.to_f)
    @oa.order.comments.create!(user: @user, text: text)
  end
end
