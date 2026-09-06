# Modern (Vue) order management page and its JSON layer.
#
#   GET /manage/:id       HTML shell that boots the Vue app (see order_manage_app.js)
#   GET /manage/:id/data  JSON with everything OrdersController#show renders
#                         (summary, by member, by article, comments)
#
# :id is the Order id. The classic page (OrdersController#show) stays as it
# is; people with the orders or pickups role opt in via localStorage (see
# order_manage/_legacy_switch). Comments and result changes go to the existing
# OrderCommentsController and GroupOrderArticlesController, so this controller
# is read-only. Self-contained on purpose so it can be carried over to another
# branch as a drop-in.
class OrderManageController < ApplicationController
  before_action :authenticate_pickups_or_orders
  before_action :find_order

  def show
  end

  def data
    render json: OrderManageSerializer.new(@order, current_user, view_context)
  end

  private

  def find_order
    @order = Order.find(params[:id])
  end
end
