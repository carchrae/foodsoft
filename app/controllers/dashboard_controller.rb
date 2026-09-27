# Modern (Vue) dashboard and its JSON layer.
#
#   GET /dashboard       HTML shell that boots the Vue app (see dashboard_app.js)
#   GET /dashboard/data  JSON with everything the classic home page shows
#   GET /dashboard/search?q=  JSON: matching items in open, then recent orders
#
# The classic home page (HomeController#index) stays untouched; members opt in
# via localStorage (see dashboard/_legacy_switch). Self-contained on purpose so
# it can be carried over to another branch as a drop-in.
class DashboardController < ApplicationController
  def show
  end

  def data
    render json: DashboardSerializer.new(current_user, view_context)
  end

  def search
    render json: DashboardSearchSerializer.new(current_user, params[:q], view_context)
  end
end
