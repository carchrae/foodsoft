# Modern (Vue) ordering pages and their JSON layer.
#
#   GET  /ordering           HTML shell showing every open order on one page
#   GET  /ordering/all       JSON: one snapshot per open order plus combined funds
#   GET  /ordering/:id       HTML shell for a single order (see ordering_app.js)
#   GET  /ordering/:id/data  JSON snapshot of the order for the member's ordergroup
#   PUT  /ordering/:id       save quantities, returns a fresh snapshot
#   GET  /ordering/:id/prices  JSON: {order_article_id: price summary}, fetched once
#                              after the snapshot so saving stays fast; with
#                              ?order_article_id= one article's price history
#   GET  /ordering/:id/catalogue?q=  JSON: the supplier's articles not in the order
#                                    (OrderCatalogueSerializer)
#   POST /ordering/:id/add_article   puts one of those in the order (article_id=),
#                                    returns a fresh snapshot plus its order article id
#
# :id is the Order id. The legacy pages (GroupOrdersController#new/#edit) stay
# untouched; members opt in via localStorage (see ordering/_legacy_switch).
#
# Deliberately self-contained: it duplicates the small access filters from
# GroupOrdersController instead of refactoring them, so it can be dropped into
# another branch without touching existing code. Business logic stays in the
# models (GroupOrder#load_data, GroupOrder#save_ordering!).
class OrderingController < ApplicationController
  SINGLE_ORDER_ACTIONS = %i[show data update].freeze

  before_action :ensure_ordergroup_member
  before_action :ensure_open_order, only: SINGLE_ORDER_ACTIONS + %i[prices catalogue add_article]
  before_action :find_group_order, only: SINGLE_ORDER_ACTIONS + [:add_article]
  before_action :enough_apples?, only: SINGLE_ORDER_ACTIONS

  # Every open order on one page.
  def index
  end

  # Snapshots for all open orders (soonest closing first) plus funds that
  # exclude every open order, so the page can compute credit from its own totals.
  def all
    orders = Order.open_reverse.includes(:supplier).to_a
    snapshots = orders.map do |order|
      group_order = order.group_orders.where(ordergroup_id: @ordergroup.id).first ||
                    order.group_orders.build(ordergroup: @ordergroup, updated_by: current_user)
      group_order.order = order # share the loaded order, see #serializer
      OrderingSerializer.new(order, group_order, view_context).as_json
    end
    render json: {
      orders: snapshots,
      funds: {
        account_balance: @ordergroup.account_balance.to_f.round(2),
        available_funds_without_open_orders: (@ordergroup.get_available_funds + @ordergroup.value_of_open_orders).to_f.round(2),
      },
      config: snapshots.first.try(:[], :config) || OrderingSerializer.config_json,
      urls: {legacy: group_orders_path, back: group_orders_path},
    }
  end

  def show
  end

  def data
    render json: serializer
  end

  def update
    @group_order.updated_by = current_user
    if @group_order.persisted? && params.key?(:lock_version)
      @group_order.lock_version = params[:lock_version].to_i
    end
    @group_order.group_order_articles_attributes = articles_attributes
    # only writes the articles that changed; see GroupOrder#save_ordering_changes!
    @group_order.save_ordering_changes!

    # re-read everything so the snapshot reflects the saved state
    @order = Order.includes(:supplier).find(@order.id)
    @group_order = GroupOrder.find(@group_order.id)
    render json: serializer.as_json.merge(saved: true, notice: I18n.t('group_orders.update.notice'))
  rescue ActiveRecord::StaleObjectError
    render status: :conflict, json: {error: 'stale', message: I18n.t('group_orders.update.error_stale')}
  rescue StandardError => e
    logger.error("Failed to update order via OrderingController: #{e.class}: #{e.message}")
    render status: :unprocessable_entity, json: {error: 'general', message: I18n.t('group_orders.update.error_general')}
  end

  # Price changes since last time, and the history dialog (OrderCopySerializer
  # does both for the copy page; namesakes count, as the catalogue relists articles)
  def prices
    prices = OrderCopySerializer.new(@order, view_context)
    if params[:order_article_id].present?
      render json: prices.price_history(@order.order_articles.find(params[:order_article_id]).article)
    else
      oas = @order.order_articles.includes(:article).to_a
      summaries = prices.price_summaries_for(oas.map(&:article))
      render json: oas.each_with_object({}) { |oa, out| out[oa.id] = summaries[oa.article_id] if summaries[oa.article_id] }
    end
  end

  def catalogue
    return render(status: :forbidden, json: {error: 'not_allowed'}) unless OrderCatalogueSerializer.user_can_add?(@order)
    render json: OrderCatalogueSerializer.new(current_user, @order, params[:q], view_context)
  end

  # Any member may add an article of the order's supplier to an open order, for
  # suppliers whose catalogue is too big to put everything in the order up front.
  # Only on orders with "user-can-add" in their note.
  def add_article
    return render(status: :forbidden, json: {error: 'not_allowed'}) unless OrderCatalogueSerializer.user_can_add?(@order)
    # a second click finds the one added by the first
    if (order_article = @order.order_articles.find_by(article_id: params[:article_id]))
      return render json: serializer.as_json.merge(added_id: order_article.id)
    end
    # only what the catalogue search offers: not in another current order of the
    # supplier, in the order's categories (OrderCatalogueSerializer.addable)
    article = OrderCatalogueSerializer.addable(@order).find_by(id: params[:article_id])
    return render(status: :not_found, json: {error: 'article'}) unless article
    order_article = @order.order_articles.find_or_create_by!(article_id: article.id)
    render json: serializer.as_json.merge(added_id: order_article.id)
  rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
    # someone else added it at the same moment, or the article has no price
    order_article = @order.order_articles.find_by(article_id: article.id)
    if order_article
      render json: serializer.as_json.merge(added_id: order_article.id)
    else
      render status: :unprocessable_entity, json: {error: 'general', message: I18n.t('model.order_article.error_price')}
    end
  end

  private

  def serializer
    # Share the one loaded Order between the group order and the serializer, so
    # Order#articles_grouped_by_category (1000+ rows on big orders) is memoized
    # across GroupOrder#load_data and the category listing instead of loaded twice.
    @group_order.order = @order
    OrderingSerializer.new(@order, @group_order, view_context, stock_order: stock_order?)
  end

  # Body: { articles: [{id: order_article_id, quantity: 1, tolerance: 2}, ...] }
  # Converted to the shape GroupOrder#save_group_order_articles expects.
  def articles_attributes
    attrs = {}
    Array(params[:articles]).each do |row|
      row = row.to_unsafe_h if row.respond_to?(:to_unsafe_h)
      next if row['id'].blank?
      attrs[row['id'].to_s] = {quantity: row['quantity'].to_i, tolerance: row['tolerance'].to_i}
    end
    attrs
  end

  def stock_order?
    params[:stock_order].present?
  end

  # --- access filters (mirroring GroupOrdersController) ---

  def ensure_ordergroup_member
    @ordergroup = current_user.ordergroup
    if @ordergroup.nil?
      redirect_to root_url, alert: I18n.t('group_orders.errors.no_member')
    end
  end

  def ensure_open_order
    # no order_articles include: the serializer loads them with the article data it needs
    @order = Order.includes(:supplier).find(params[:id])
    unless @order.open?
      respond_closed(I18n.t('group_orders.errors.closed'))
    end
  rescue ActiveRecord::RecordNotFound
    respond_closed(I18n.t('group_orders.errors.notfound'))
  end

  def respond_closed(message)
    if request.format.json? || %w[update data catalogue add_article].include?(action_name)
      render status: :gone, json: {error: 'closed', message: message}
    else
      redirect_to group_orders_url, alert: message
    end
  end

  # Stock orders (ordergroup nil) may only be placed by members with the orders role.
  def find_group_order
    ordergroup = stock_order? ? nil : @ordergroup
    if ordergroup.nil? && !current_user.role_orders?
      return redirect_to group_orders_url, alert: I18n.t('group_orders.errors.notfound')
    end
    scope = @order.group_orders
    @group_order = if ordergroup
                     scope.where(ordergroup_id: ordergroup.id).first
                   else
                     scope.where(ordergroup_id: [0, nil]).first
                   end
    @group_order ||= scope.build(ordergroup: ordergroup, updated_by: current_user)
  end

  # Like GroupOrdersController, only enforced when placing a *new* group order.
  def enough_apples?
    return unless @group_order.new_record? && @group_order.ordergroup
    if @ordergroup.not_enough_apples?
      redirect_to group_orders_url,
                  alert: t('not_enough_apples', scope: 'group_orders.messages', apples: @ordergroup.apples,
                           stop_ordering_under: FoodsoftConfig[:stop_ordering_under])
    end
  end
end
