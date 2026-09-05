# Modern (Vue) dashboard and its JSON layer.
#
#   GET /dashboard       HTML shell that boots the Vue app (see dashboard_app.js)
#   GET /dashboard/data  JSON with everything the classic home page shows
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
end
