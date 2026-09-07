# Modern (Vue) "copy order" page and its JSON layer. Creates a new order from
# an earlier one while showing the demand that earlier order saw, so the
# coordinator can decide what to include. :id is the order being copied.
#
#   GET  /order_copy/:id       HTML shell (see order_copy_app.js)
#   GET  /order_copy/:id/data  JSON: source order + demand, available articles, defaults
#   GET  /order_copy/:id/prices/:article_id  JSON: price history of one article and its namesakes
#   POST /order_copy/:id       create the new order, returns {url} or {errors} (422)
#
# The classic page (OrdersController#new with order_id) stays as it is. This
# controller is self-contained on purpose so it can be dropped into another
# branch; it needs the same "orders" role.
class OrderCopyController < ApplicationController
  before_action :authenticate_orders
  before_action :find_source

  def show
  end

  def data
    render json: OrderCopySerializer.new(@source, view_context)
  end

  # Price history of one article and its namesakes, for the dialog
  def prices
    article = Article.find(params[:article_id])
    render json: OrderCopySerializer.new(@source, view_context).price_history(article)
  end

  def create
    p = params[:order] || {}
    p = p.to_unsafe_h if p.respond_to?(:to_unsafe_h)
    order = Order.new
    order.supplier_id = @source.supplier_id
    order.created_by = current_user
    order.starts = parse_time(p['starts'])
    order.ends = parse_time(p['ends'])
    order.boxfill = parse_time(p['boxfill']) if @source.is_boxfill_useful?
    order.pickup = (Date.parse(p['pickup'].to_s) rescue nil)
    order.end_action = p['end_action'] if Order.end_actions.key?(p['end_action'].to_s)
    order.note = p['note'].to_s
    order.supplier_note = p['supplier_note'].to_s
    order.article_ids = Array(p['article_ids']).map(&:to_s).reject(&:blank?)

    if order.save
      render json: {url: order_path(order), id: order.id, notice: I18n.t('orders.create.notice')}
    else
      render json: {errors: order.errors.full_messages}, status: 422
    end
  end

  private

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
