# encoding: utf-8
class OrderFax < OrderPdf

  BATCH_SIZE = 250

  attr_reader :order

  def filename
    I18n.t('documents.order_fax.filename', :name => order.name, :date => order.ends.to_date) + '.pdf'
  end

  def title
    false
  end

  def body
    contact = FoodsoftConfig[:contact].symbolize_keys

    # From paragraph
    bounding_box [margin_box.right-200,margin_box.top], width: 200 do
      text FoodsoftConfig[:name], size: fontsize(9), align: :right
      move_down 5
      text contact[:street], size: fontsize(9), align: :right
      move_down 5
      text "#{contact[:zip_code]} #{contact[:city]}", size: fontsize(9), align: :right
      move_down 5
      unless order.supplier.try(:customer_number).blank?
        text "#{Supplier.human_attribute_name :customer_number}: #{order.supplier[:customer_number]}", size: fontsize(9), align: :right
        move_down 5
      end
      unless contact[:phone].blank?
        text "#{Supplier.human_attribute_name :phone}: #{contact[:phone]}", size: fontsize(9), align: :right
        move_down 5
      end
      unless contact[:email].blank?
        text "#{Supplier.human_attribute_name :email}: #{contact[:email]}", size: fontsize(9), align: :right
      end
    end

    # Recipient
    bounding_box [margin_box.left,margin_box.top-60], width: 200 do
      text order.name
      move_down 5
      text order.supplier.try(:address).to_s
      unless order.supplier.try(:fax).blank?
        move_down 5
        text "#{Supplier.human_attribute_name :fax}: #{order.supplier[:fax]}"
      end
    end

    move_down 5
    text Date.today.strftime(I18n.t('date.formats.default')), align: :right

    move_down 10
    unless true
      text "#{Delivery.human_attribute_name :delivered_on}:"
      move_down 10
    end
    unless order.supplier.try(:contact_person).blank?
      text "#{Supplier.human_attribute_name :contact_person}: #{order.supplier[:contact_person]}"
      move_down 10
    end

    # Articles
    total = 0
    data = [I18n.t('documents.order_fax.rows')]
    each_order_article do |oa|
      #subtotal = oa.units_to_order * oa.price.unit_quantity * oa.price.price

      price = oa.price
      units_to_order = oa.units_to_order
      supplier_price = price.supplier_price

      begin
        unit = Unit.new(oa.article.unit) rescue Unit.new(oa.article.unit.downcase)
        total_quantity = units_to_order * oa.price.unit_quantity * unit.scalar
        unit = unit.units
      rescue
        unit = oa.article.unit
        total_quantity = units_to_order * oa.price.unit_quantity
      end



      #ugly fix for things like milk where supplier price is per unit, but unit qty is 6.
      if ((supplier_price - (price.unit_quantity*price.price)).abs>price.price)
        units_to_order = units_to_order * price.unit_quantity
      end
      subtotal = units_to_order * supplier_price
      total += subtotal

      data << [((oa.article.order_number.include? 'PRO-') ? oa.article.order_number.sub('PRO-', '') : ''),
               units_to_order,
               oa.article.name,
               total_quantity, #'', #oa.price.unit_quantity,
               unit,
               number_to_currency(oa.price.supplier_price),
               number_to_currency(subtotal)]

      #if there is a deposit, show it as a line item
      if (oa.price.deposit > 0)
        total_deposit = oa.units_to_order * oa.price.unit_quantity * oa.price.deposit
        total += total_deposit
        data << ['',
                 '',
                 'deposit',
                 '', #'', #oa.price.unit_quantity,
                 '',
                 number_to_currency(oa.price.deposit),
                 number_to_currency(total_deposit)]
      end
    end

    column_widths=[40, 60, 220, 40, 40, 70, 70]
    data << [I18n.t('documents.order_fax.total'), nil, nil, nil, nil, nil, number_to_currency(total)]
    table data, column_widths: column_widths, cell_style: {size: fontsize(8), font: 'Courier', overflow: :shrink_to_fit} do |table|
      table.header = true
      # table.cells.border_width = 1
      table.cells.border_color = '666666'
      table.cells.borders = [:bottom]

      table.row(0).border_bottom_width = 2
      table.columns(0..6).align = :right
      table.columns(2).align = :left
      table.columns(3).align = :right
      table.columns(4).align = :left
      table.row(0).columns(2).align = :center
      # table.columns(3..6).align = :right
      table.row(data.length-1).columns(0..6).borders = [:top, :bottom]
      table.row(data.length-1).columns(0).borders = [:top, :bottom]
      table.row(data.length-1).border_top_width = 2
    end
    #font_size: fontsize(8),
    #vertical_padding: 3,
    #border_style: :grid,
    #headers: ["BestellNr.", "Menge","Name", "Gebinde", "Einheit","Preis/Einheit"],
    #align: {0 => :left}
  end

  private

  def order_articles
    order.order_articles.ordered.
        joins(:article).
        order('articles.name').
        order('articles.order_number').
        preload(:article, :article_price)
  end

  def each_order_article
    order_articles.find_each_with_order(batch_size: BATCH_SIZE) {|oa| yield oa}
  end

end
