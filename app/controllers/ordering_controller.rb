# Modern (Vue) ordering pages and their JSON layer.
#
#   GET  /ordering           HTML shell showing every open order on one page
#   GET  /ordering/all       JSON: one snapshot per open order plus combined funds
#   GET  /ordering/:id       HTML shell for a single order (see ordering_app.js)
#   GET  /ordering/:id/data  JSON snapshot of the order for the member's ordergroup
#   PUT  /ordering/:id       save quantities, returns a fresh snapshot
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
  before_action :ensure_open_order, only: SINGLE_ORDER_ACTIONS
  before_action :find_group_order, only: SINGLE_ORDER_ACTIONS
  before_action :enough_apples?, only: SINGLE_ORDER_ACTIONS

  # Every open order on one page.
  def index
  end

  # Snapshots for all open orders (soonest closing first) plus funds that
  # exclude every open order, so the page can compute credit from its own totals.
  def all
    orders = Order.open_reverse.includes([:supplier, :order_articles]).to_a
    snapshots = orders.map do |order|
      group_order = order.group_orders.where(ordergroup_id: @ordergroup.id).first ||
                    order.group_orders.build(ordergroup: @ordergroup, updated_by: current_user)
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
    @group_order.save_ordering!

    # re-read everything so the snapshot reflects the saved state
    @order = Order.includes([:supplier, :order_articles]).find(@order.id)
    @group_order = GroupOrder.find(@group_order.id)
    render json: serializer.as_json.merge(saved: true, notice: I18n.t('group_orders.update.notice'))
  rescue ActiveRecord::StaleObjectError
    render status: :conflict, json: {error: 'stale', message: I18n.t('group_orders.update.error_stale')}
  rescue StandardError => e
    logger.error("Failed to update order via OrderingController: #{e.class}: #{e.message}")
    render status: :unprocessable_entity, json: {error: 'general', message: I18n.t('group_orders.update.error_general')}
  end

  private

  def serializer
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
    @order = Order.includes([:supplier, :order_articles]).find(params[:id])
    unless @order.open?
      respond_closed(I18n.t('group_orders.errors.closed'))
    end
  rescue ActiveRecord::RecordNotFound
    respond_closed(I18n.t('group_orders.errors.notfound'))
  end

  def respond_closed(message)
    if request.format.json? || action_name == 'update' || action_name == 'data'
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
