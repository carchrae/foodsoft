module GroupOrdersHelper
  def data_to_js(ordering_data)
    ordering_data[:order_articles].map do |id, data|
      [id, data[:price], data[:unit], data[:total_price], data[:others_quantity], data[:others_tolerance],
       data[:used_quantity], data[:quantity_available]]
    end.map do |row|
      "addData(#{row.join(', ')});"
    end.join("\n")
  end

  # Returns a link to the page where a group_order can be edited.
  # If the option :show is true, the link is for showing the group_order.
  # Pass :user (and :host/:protocol for full URLs) to use from mailer contexts.
  def link_to_ordering(order, options = {}, &block)
    user = options.delete(:user) || (respond_to?(:current_user) ? current_user : nil)
    return order.name unless user && user.ordergroup

    group_order = order.group_order(user.ordergroup)

    use_url = options.has_key?(:host) || options.has_key?(:protocol)

    path = if options[:show] && group_order
             use_url ? group_order_url(group_order, options.slice(:host, :port, :protocol, :subdomain)) : group_order_path(group_order)
           elsif group_order
             url_params = options.slice(:host, :port, :protocol, :subdomain).merge(order_id: order.id)
             use_url ? edit_group_order_url(group_order, url_params) : edit_group_order_path(group_order, order_id: order.id)
           else
             url_params = options.slice(:host, :port, :protocol, :subdomain).merge(order_id: order.id)
             use_url ? new_group_order_url(url_params) : new_group_order_path(order_id: order.id)
           end

    options.except!(:show, :host, :port, :protocol, :subdomain)
    name = block_given? ? capture(&block) : order.name
    path ? link_to(name, path, options) : name
  end

  # Return css class names for order result table

  def order_article_class_name(quantity, tolerance, result)
    if quantity + tolerance > 0 || result != 0
      result > 0 ? 'success' : 'failed'
    else
      'ignored'
    end
  end

  def get_order_results(order_article, group_order_id)
    goa = order_article.group_order_articles.detect { |goa| goa.group_order_id == group_order_id }
    quantity, tolerance, result, sub_total = if goa.present?
                                               [goa.quantity, goa.tolerance, goa.result, goa.total_price(order_article)]
                                             else
                                               [0, 0, 0, 0]
                                             end

    { group_order_article: goa, quantity: quantity, tolerance: tolerance, result: result, sub_total: sub_total }
  end

  def get_missing_units_css_class(quantity_missing)
    if quantity_missing == 1
      'missing-few'
    elsif quantity_missing == 0
      ''
    else
      'missing-many'
    end
  end
end
