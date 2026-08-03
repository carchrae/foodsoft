class OrderByGroups < OrderPdf
  def filename
    I18n.t('documents.order_by_groups.filename', name: order.name, date: order.ends.to_date) + '.pdf'
  end

  def title
    I18n.t('documents.order_by_groups.title', name: order.name,
                                              date: order.ends.strftime(I18n.t('date.formats.default')),
                                              user_name: order.created_by.name)
  end

  def body
    each_ordergroup do |oa_name, oa_total, oa_id, oa_transport|
      has_transport = !oa_transport.nil? && oa_transport > 0
      dimrows = []
      rows = [[
        'Ordered',
        'Received',
        OrderArticle.human_attribute_name(:article),
        Article.human_attribute_name(:supplier),
        'Units @ Price',
        GroupOrderArticle.human_attribute_name(:total_price)
      ]]

      each_group_order_article_for_ordergroup(oa_id) do |goa|
        next if goa.result == 0

        name = goa.order_article.article.name.gsub(/^\d\d\d\d:\s*/, '')
        quantity = goa.tolerance > 0 ? "#{goa.quantity}..#{goa.quantity + goa.tolerance}" : goa.quantity
        rows << [
          quantity.to_s,
          "#{group_order_article_result(goa)} __ #{goa.order_article.article.unit}",
          name.truncate(28, omission: ''),
          goa.order_article.article.supplier.name.truncate(9, omission: ''),
          order_article_unit_per_price(goa.order_article),
          number_to_currency(goa.total_price)
        ]
      end
      next unless rows.length > 1

      rows << [nil, nil, I18n.t('documents.order_by_groups.sum'), nil, nil, number_to_currency(oa_total)]
      if has_transport
        rows << [GroupOrder.human_attribute_name(:transport), nil, nil, nil, nil, number_to_currency(oa_transport)]
        rows << [nil, nil, nil, nil, nil, number_to_currency(oa_total + oa_transport)]
      end

      rows.each { |row| row.delete_at 3 } unless @options[:show_supplier]

      # a phone number on the bin sheet so people can be called on pickup day
      oa = Ordergroup.find(oa_id)
      oa_phone = oa.contact_phone
      if oa_phone.blank?
        user_with_phone = oa.users.find { |user| !user.phone.blank? }
        oa_phone = user_with_phone.phone if user_with_phone
      end
      oa_phone = if oa_phone.blank?
                   'UPDATE PROFILE, PHONE IS REQUIRED'
                 else
                   number_to_phone(oa_phone.sub(/^1/, ''))
                 end

      nice_table oa_name || stock_ordergroup_name, rows, dimrows, oa_phone do |table|
        if has_transport
          table.row(-4).border_width = 1
          table.row(-4).border_color = '666666'
        end

        table.row(-2).border_width = 1
        table.row(-2).border_color = '666666'
        table.row(-1).borders = []

        if @options[:show_supplier]
          supplier_width = 60
          table.column(3).width = supplier_width
          table.column(2).width = (bounds.width / 2) - supplier_width
          table.cells.size = 10
        else
          table.cells.size = 10
          table.column(2).width = bounds.width / 2
        end
      end
    end
  end
end
