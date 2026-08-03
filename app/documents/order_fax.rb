class OrderFax < OrderPdf
  BATCH_SIZE = 250

  def filename
    I18n.t('documents.order_fax.filename', name: order.name, date: order.ends.to_date) + '.pdf'
  end

  def title
    false
  end

  def body
    contact = FoodsoftConfig[:contact].symbolize_keys

    # From paragraph
    bounding_box [margin_box.right - 200, margin_box.top], width: 200 do
      text FoodsoftConfig[:name], size: fontsize(9), align: :right
      move_down 5
      text contact[:street], size: fontsize(9), align: :right
      move_down 5
      text "#{contact[:zip_code]} #{contact[:city]}", size: fontsize(9), align: :right
      move_down 5
      text "Order Contact: #{order.created_by.name}", size: fontsize(9), align: :right
      move_down 5
      if order.supplier.try(:customer_number).present?
        text "#{Supplier.human_attribute_name :customer_number}: #{order.supplier[:customer_number]}",
             size: fontsize(9), align: :right
        move_down 5
      end
      if contact[:phone].present?
        text "#{Supplier.human_attribute_name :phone}: #{contact[:phone]}", size: fontsize(9), align: :right
        move_down 5
      end
      if contact[:email].present?
        text "#{Supplier.human_attribute_name :email}: #{contact[:email]}", size: fontsize(9),
                                                                            align: :right
      end
    end

    # Recipient
    bounding_box [margin_box.left, margin_box.top - 60], width: 200 do
      text order.name
      move_down 5
      text order.supplier.try(:address).to_s
      if order.supplier.try(:phone).present?
        move_down 5
        text "#{Supplier.human_attribute_name :phone}: #{order.supplier[:phone]}"
      end
      if order.supplier.try(:fax).present?
        move_down 5
        text "#{Supplier.human_attribute_name :fax}: #{order.supplier[:fax]}"
      end
      if order.supplier.try(:contact_person).present?
        move_down 5
        text "#{Supplier.human_attribute_name :contact_person}: #{order.supplier[:contact_person]}"
      end
    end

    move_down 5
    text I18n.t('documents.order_fax.ordered_on', date: order.ends.strftime(I18n.t('date.formats.long'))), align: :right
    unless order.pickup.nil?
      move_down 5
      text I18n.t('documents.order_fax.deliver_on', date: order.pickup.strftime(I18n.t('date.formats.long'))), align: :right
    end
    move_down 10

    if order.supplier_note.present?
      text "NOTE: #{order.supplier_note}", inline_format: true
      move_down 10
    end

    # Articles
    data, total = table_data

    column_widths = [70, 40, 280, 70, 80]
    data << [nil, nil, nil, I18n.t('documents.order_fax.total'), number_to_currency(total)]
    table data, column_widths: column_widths, cell_style: { size: fontsize(8), font: 'Courier', overflow: :shrink_to_fit } do |table|
      table.header = true
      table.cells.border_color = '666666'
      table.cells.borders = [:bottom]

      table.row(0).border_bottom_width = 2
      table.columns(0..3).align = :left
      table.columns(4..5).align = :right
      table.columns(1).align = :right
      table.row(data.length - 1).columns(0..5).borders = %i[top bottom]
      table.row(data.length - 1).columns(0).borders = %i[top bottom]
      table.row(data.length - 1).border_top_width = 2
    end
  end

  # Rows for the supplier order: quantities in (possibly fractional) case units,
  # priced at the supplier's case price.
  def table_data
    total = 0
    data = [I18n.t('documents.order_fax.rows')]
    each_order_article do |oa|
      price = oa.price
      units_to_order = oa.units
      supplier_price = price.supplier_price || oa.article.price

      subtotal = units_to_order * supplier_price
      total += subtotal

      data << [oa.article.order_number,
               units_to_order,
               [oa.article.name.squeeze(' '), "\n", oa.article.manufacturer, ' (', oa.article.origin, ')'].join(''),
               number_to_currency(oa.price.supplier_price),
               number_to_currency(subtotal)]
    end
    [data, total]
  end

  private

  def order_articles
    order.order_articles.ordered
         .joins(:article)
         .order('articles.name')
         .order('articles.order_number')
         .preload(:article, :article_price)
  end

  def each_order_article
    order_articles.find_each_with_order(batch_size: BATCH_SIZE) do |oa|
      yield oa if oa.units > 0
    end
  end
end
