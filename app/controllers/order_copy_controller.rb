# Modern (Vue) "copy order" page and its JSON layer. Creates a new order from
# an earlier one while showing the demand that earlier order saw, so the
# coordinator can decide what to include. :id is the order being copied.
#
#   GET  /order_copy/:id       HTML shell (see order_copy_app.js)
#   GET  /order_copy/:id/data  JSON: source order + demand, available articles, defaults
#   GET  /order_copy/:id/prices/:article_id  JSON: price history of one article and its namesakes
#   POST /order_copy/:id       create the new order, returns {url} or {errors} (422)
#   PATCH /order_copy/:id      save the order itself (the edit page, data?mode=edit),
#                              returns {url} or {errors, ordered_ids} (422)
#
# The same page edits an order: OrdersController#edit renders order_copy/edit
# (?classic=1 keeps the classic form). There is no "last time" then; the order's
# own articles and demand stand in for the copied ones.
# The classic page (OrdersController#new with order_id) stays as it is. This
# controller is self-contained on purpose so it can be dropped into another
# branch; it needs the same "orders" role.
class OrderCopyController < ApplicationController
  before_action :authenticate_orders
  before_action :find_source

  def show
  end

  def data
    render json: OrderCopySerializer.new(@source, view_context, edit: params[:mode] == 'edit')
  end

  # Price history of one article and its namesakes, for the dialog
  def prices
    article = Article.find(params[:article_id])
    render json: OrderCopySerializer.new(@source, view_context).price_history(article)
  end

  def create
    order = Order.new
    order.supplier_id = @source.supplier_id
    order.created_by = current_user
    assign_order(order, order_params)

    if order.save
      render json: {url: order_path(order), id: order.id, notice: I18n.t('orders.create.notice')}
    else
      render json: {errors: order.errors.full_messages}, status: 422
    end
  end

  # Save the edit page. Removing articles members already ordered needs a second
  # request with ignore_warnings, after the page asked the coordinator.
  def update
    p = order_params
    assign_order(@source, p)
    @source.ignore_warnings = true if p['ignore_warnings'].to_s == 'true'

    if @source.save
      render json: {url: order_path(@source), id: @source.id, notice: I18n.t('orders.update.notice')}
    else
      render json: {errors: @source.errors.full_messages, ordered_ids: @source.erroneous_article_ids}, status: 422
    end
  end

  private

  def order_params
    p = params[:order] || {}
    p.respond_to?(:to_unsafe_h) ? p.to_unsafe_h : p
  end

  def assign_order(order, p)
    order.starts = parse_time(p['starts'])
    order.ends = parse_time(p['ends'])
    order.boxfill = parse_time(p['boxfill']) if @source.is_boxfill_useful?
    order.pickup = (Date.parse(p['pickup'].to_s) rescue nil)
    order.end_action = p['end_action'] if Order.end_actions.key?(p['end_action'].to_s)
    order.note = p['note'].to_s
    order.supplier_note = p['supplier_note'].to_s
    order.article_ids = Array(p['article_ids']).map(&:to_s).reject(&:blank?)
  end

  def find_source
    @source = Order.includes(:supplier).find(params[:id])
  end

  def parse_time(value)
    return nil if value.blank?
    Time.zone.parse(value.to_s)
  rescue ArgumentError
    nil
  end
end
