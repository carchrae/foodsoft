# Builds the JSON consumed by the modern (Vue) order management page
# (app/assets/javascripts/order_manage_app.js).
#
# Like the other serializers this is the boundary between browser and server:
# it gathers what OrdersController#show renders in its three views (order
# summary, by member, by article) plus the comments, into one plain structure.
# No model logic lives here. Money values are plain floats in currency units.
class OrderManageSerializer
  def initialize(order, user, view)
    @order = order
    @user = user
    @view = view
  end

  def as_json(*)
    {
      order: order_json,
      stats: stats_json,
      can: can_json,
      articles: articles_json,
      group_orders: group_orders_json,
      comments: comments_json,
      user: {id: @user.id},
      # households finance can add to an article once the order is finished
      ordergroups: (can_json[:edit_results] ? Ordergroup.undeleted.order(:name).map { |g| {id: g.id, name: g.name} } : []),
      config: {
        currency_unit: FoodsoftConfig[:currency_unit] || '',
        use_nick: !!FoodsoftConfig[:use_nick],
      },
      urls: urls_json,
    }
  end

  private

  # ---- order -----------------------------------------------------------------

  def order_json
    o = @order
    {
      id: o.id,
      name: o.name,
      state: o.state,
      state_human: I18n.t("orders.state.#{o.state}"),
      stockit: o.stockit?,
      open: o.open?,
      finished: o.finished?,
      closed: o.closed?,
      boxfill: o.boxfill?,
      supplier: (o.stockit? ? nil : {name: o.supplier.name, url: @view.supplier_path(o.supplier)}),
      created_by: @view.show_user(o.created_by),
      starts: o.starts.try(:iso8601),
      starts_human: @view.format_time(o.starts),
      ends: o.ends.try(:iso8601),
      ends_human: @view.format_time(o.ends),
      pickup: o.pickup.try(:iso8601),
      pickup_human: @view.format_date(o.pickup),
      note: o.note.to_s,
      last_sent_mail_human: @view.format_time(o.last_sent_mail),
      received: o.order_articles.where('units_received IS NOT NULL').any?,
      invoice: (o.invoice.present? ? {id: o.invoice.id, url: @view.finance_invoice_path(o.invoice)} : nil),
    }
  end

  # The figures of the classic description line.
  def stats_json
    group_orders = @order.group_orders.includes(:ordergroup).to_a
    {
      ordergroups: group_orders.size,
      ordergroup_names: group_orders.map(&:ordergroup_name).sort,
      articles_ordered: @order.order_articles.ordered.count,
      net_sum: money(@order.sum(:net)),
      gross_sum: money(@order.sum(:gross)),
      fc_sum: money(@order.sum(:fc)),
    }
  end

  def can_json
    {
      orders: !!@user.role_orders?,
      finance: !!@user.role_finance?,
      invoices: !!@user.role_invoices?,
      # the classic page lets finance adjust members' results once the order is finished
      edit_results: !!(@order.finished? && @user.role_finance?),
    }
  end

  # ---- articles (summary + by article) -----------------------------------------

  def articles_json
    scope = @order.order_articles.includes(:article_price, :article => :article_category)
    scope.map { |oa| article_json(oa) }
  end

  def article_json(oa)
    price = oa.price
    a = oa.article
    unit_quantity = price.unit_quantity.to_i
    units = oa.units.to_i
    {
      id: oa.id,
      article_id: a.id,
      name: a.name,
      note: a.note.to_s,
      unit: a.unit,
      unit_quantity: unit_quantity,
      category: (a.article_category.try(:name) || ''),
      origin: a.origin.to_s,
      manufacturer: a.manufacturer.to_s,
      price: {
        net: money(price.price),
        gross: money(price.gross_price),
        supplier: money(price.supplier_price),
        fc: money(price.fc_price),
      },
      quantity: oa.quantity.to_i,
      tolerance: oa.tolerance.to_i,
      units: units,
      units_to_order: oa.units_to_order,
      units_billed: oa.units_billed,
      units_received: oa.units_received,
      missing_units: oa.missing_units.to_i,
      # the classic "ordered" scope: something is actually being bought
      ordered: (oa.units_to_order.to_i > 0 || oa.units_billed.to_i > 0 || oa.units_received.to_i != 0),
      total_net: money(units * unit_quantity * price.price),
      total_gross: money(units * unit_quantity * price.gross_price),
      lines: oa.group_order_articles.ordered.map { |goa| goa_json(goa, oa) },
    }
  end

  def goa_json(goa, oa)
    {
      id: goa.id,
      group_order_id: goa.group_order_id,
      order_article_id: oa.id,
      ordergroup: goa.group_order.ordergroup_name,
      quantity: goa.quantity.to_i,
      tolerance: goa.tolerance.to_i,
      result: goa.result.to_f,
      total_price: money(goa.total_price(oa)),
    }
  end

  # ---- group orders (by member) -------------------------------------------------

  def group_orders_json
    @order.group_orders.ordered.includes(:ordergroup, :updated_by).map do |go|
      lines = go.group_order_articles.ordered.includes(:order_article => [:article, :article_price]).map do |goa|
        goa_json(goa, goa.order_article).merge(
          name: goa.order_article.article.name,
          unit: goa.order_article.article.unit,
          unit_quantity: goa.order_article.price.unit_quantity.to_i,
          fc_price: money(goa.order_article.price.fc_price)
        )
      end
      {
        id: go.id,
        ordergroup_id: go.ordergroup_id,
        name: go.ordergroup_name,
        price: money(go.price),
        updated_by: @view.show_user(go.updated_by),
        updated_on_human: @view.format_time(go.updated_on),
        lines: lines,
      }
    end
  end

  # ---- comments -------------------------------------------------------------------

  def comments_json
    @order.comments.includes(:user).map do |c|
      {
        id: c.id,
        user: @view.show_user(c.user),
        ordergroup: c.user.try(:ordergroup_name),
        created_at: c.created_at.try(:iso8601),
        created_human: @view.format_time(c.created_at),
        text: c.text.to_s,
      }
    end
  end

  # ---- urls -------------------------------------------------------------------------

  def urls_json
    o = @order
    urls = {
      data: @view.data_manage_path(o),
      legacy: @view.order_path(o, classic: 1),
      orders: @view.orders_path,
      edit: @view.edit_order_path(o),
      finish: @view.finish_order_path(o),
      swap: @view.swap_order_path(o),
      send_to_supplier: @view.send_result_to_supplier_order_path(o),
      receive: @view.receive_order_path(o),
      delete: @view.order_path(o),
      nearly_full: @view.nearly_full_path(o),
      comment: @view.order_comments_path,
      group_order_articles: @view.group_order_articles_path,
      ordering: @view.ordering_path(o),
      downloads: downloads_json,
    }
    urls[:stock_order] = if o.stock_group_order
                           @view.edit_group_order_path(o.stock_group_order, order_id: o.id)
                         else
                           @view.new_group_order_path(order_id: o.id, stock_order: true)
                         end
    urls[:invoice] = o.invoice.present? ? @view.finance_invoice_path(o.invoice) : nil
    urls[:new_invoice] = o.stockit? ? nil : @view.new_finance_invoice_path(order_id: o.id, supplier_id: o.supplier_id)
    urls
  end

  def downloads_json
    o = @order
    list = [
      {label: I18n.t('shared.order_download_button.group_pdf'), url: @view.order_path(o, document: :groups, format: :pdf)},
      {label: I18n.t('shared.order_download_button.article_pdf'), url: @view.order_path(o, document: :articles, format: :pdf)},
      {label: I18n.t('shared.order_download_button.matrix_pdf'), url: @view.order_path(o, document: :matrix, format: :pdf)},
      {label: I18n.t('shared.order_download_button.fax_pdf'), url: @view.order_path(o, document: :fax, format: :pdf)},
    ]
    list << {label: I18n.t('shared.order_download_button.fax_txt'), url: @view.order_path(o, format: :txt)} unless o.stockit?
    list << {label: I18n.t('shared.order_download_button.fax_csv'), url: @view.order_path(o, format: :csv)}
    list
  end

  def money(value)
    return nil if value.nil?
    value.to_f.round(2)
  end
end
