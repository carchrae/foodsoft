# JSON layer for the modern (Vue) swap page. The page itself is still served
# by OrdersController#swap (app/views/orders/swap.html.haml), which also keeps
# the closed-order check; ?classic=1 there shows the old table.
#
#   GET /swap/:id/data  JSON: the order's articles and the supplier's available articles
#   PUT /swap/:id       apply {changes: {order_article_id: article_id | {article_id, factor}, ...}},
#                       returns a fresh snapshot; a factor other than 1 scales members' amounts (3LB bag -> LB is 3)
#
# :id is the Order id. Self-contained on purpose so it can be dropped into
# another branch; the swap logic mirrors OrdersController#swap_update.
class SwapController < ApplicationController
  before_action :authenticate_orders
  before_action :find_order

  def data
    render json: SwapSerializer.new(@order, view_context)
  end

  def update
    unless @order.open?
      render json: {error: I18n.t('orders.swap.order_closed', url: view_context.new_finance_order_path(order_id: @order.id))}, status: 410
      return
    end

    changes = params[:changes] || {}
    changes = changes.to_unsafe_h if changes.respond_to?(:to_unsafe_h)
    available = @order.articles_for_ordering_ungrouped.index_by(&:id)
    errors = {}
    changed = 0

    changes.each do |oa_id, change|
      oa = @order.order_articles.where(id: oa_id).first
      next unless oa
      article_id, factor = change.is_a?(Hash) ? [change['article_id'], change['factor']] : [change, 1]
      factor = factor.to_f
      factor = 1 if factor <= 0
      article = available[article_id.to_i]
      if article.nil?
        errors[oa.id] = 'That article is no longer available.'
        next
      end
      next if oa.article_id == article.id && factor == 1.0
      begin
        OrderArticle.transaction do
          oa.article_id = article.id
          oa.save!
          multiply_amounts!(oa, factor) if factor != 1.0
          oa.update_results!
          # keep the ordergroups' totals in step with the new price
          oa.group_order_articles.map(&:group_order).uniq.each(&:update_price!)
        end
        changed += 1
      rescue => e
        errors[oa.id] = e.message
      end
    end

    @order.notify_modified if changed > 0
    render json: {
      changed: changed,
      errors: errors,
      notice: (changed > 0 ? I18n.t('orders.swap.updated_order') : nil),
      data: SwapSerializer.new(@order.reload, view_context).as_json,
    }
  end

  private

  # Swapping e.g. a 3LB bag for a per-LB article: every member's amount and
  # tolerance is multiplied so they still receive the same weight. The queue
  # records (who ordered first) are scaled in place, so fairness is kept.
  # Fractional factors (an eighth-pound pack to a per-pound article, or a bag to
  # a count the coordinator typed in) round to the nearest whole unit; members
  # whose amounts round to nothing are dropped from the article.
  def multiply_amounts!(oa, factor)
    oa.group_order_articles.includes(:group_order_article_quantities).each do |goa|
      quantity = tolerance = 0
      goa.group_order_article_quantities.each do |q|
        q.quantity = scale_amount(q.quantity, factor)
        q.tolerance = scale_amount(q.tolerance, factor)
        if q.quantity == 0 && q.tolerance == 0
          q.destroy
        else
          q.save!
          quantity += q.quantity
          tolerance += q.tolerance
        end
      end
      if quantity == 0 && tolerance == 0
        goa.destroy
      else
        goa.quantity = quantity
        goa.tolerance = tolerance
        goa.save!
      end
    end
  end

  def scale_amount(amount, factor)
    (amount.to_i * factor).round
  end

  def find_order
    @order = Order.includes(:supplier).find(params[:id])
  end
end
