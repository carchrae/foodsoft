# encoding: utf-8
class OrderByGroups < OrderPdf

  # optimal value depends on the number of articles ordered on average by each
  #   ordergroup as well as the available memory
  BATCH_SIZE = 50

  attr_reader :order

  def filename
    I18n.t('documents.order_by_groups.filename', :name => order.name, :date => order.ends.to_date) + '.pdf'
  end

  def title
    I18n.t('documents.order_by_groups.title', :name => order.name,
           :date => order.ends.strftime(I18n.t('date.formats.default')),
           :user_name => @order.created_by.name)
  end

  def body
    # Start rendering
    each_group_order do |group_order|
      down_or_page 15

      total = 0
      rows = []
      dimrows = []

      each_group_order_article_for(group_order) do |goa|
        price = order_article_price(goa.order_article)
        sub_total = price * goa.result
        total += sub_total
        rows << [
            goa.tolerance > 0 ? "#{goa.quantity} (+#{goa.tolerance} extra)" : goa.quantity,
            "#{goa.result}    ____ ",
            goa.order_article.article.unit,
            number_to_currency(price),
            goa.order_article.article.name,
            nil, #goa.order_article.price.unit_quantity,
            number_to_currency(sub_total)]
        dimrows << rows.length if goa.result == 0
      end
      next if rows.length == 0
      rows << [nil, nil, nil, nil, I18n.t('documents.order_by_groups.sum'), nil, number_to_currency(total)]
      rows.unshift I18n.t('documents.order_by_groups.rows') # Table Header

      text group_order.ordergroup_name, size: fontsize(24), style: :bold

      # 0 - Ordered
      # 1 - Received
      # 2 - Unit
      # 3- Article
      # 4- Price
      # 5- U.Q.
      # 6 - Sum
      table rows, width: 500, cell_style: {size: fontsize(8), overflow: :shrink_to_fit} do |table|
        # borders
        table.cells.borders = [:bottom]
        table.cells.border_width = 0.02
        table.cells.border_color = 'dddddd'
        table.rows(0).border_width = 1
        table.rows(0).border_color = '666666'
        table.rows(0).column(5).font_style = :bold
        table.row(rows.length-2).border_width = 1
        table.row(rows.length-2).border_color = '666666'
        table.row(rows.length-1).borders = []

        table.column(4).width = 280
        table.column(2).font_style = :bold
        table.columns(1..2).align = :left
        table.column(3).align = :right
        table.column(4).align = :left
        table.column(6).align = :right
        table.column(2).font_style = :bold
        table.column(5).width = 1



        # dim rows which were ordered but not received
        dimrows.each do |ri|
          table.row(ri).text_color = '999999'
          table.row(ri).columns(0..-1).font_style = nil
        end
      end
    end

  end

  private

  # Return price for order_article.
  #
  # This is a separate method so that plugins can override it.
  #
  # @param article [OrderArticle]
  # @return [Number] Price to show
  # @see https://github.com/foodcoops/foodsoft/issues/445
  def order_article_price(order_article)
    order_article.price.fc_price
  end

  def group_orders
    order.group_orders.ordered.
        joins(:ordergroup).order('groups.name').
        preload(:group_order_articles => {:order_article => [:article, :article_price]})
  end

  def each_group_order
    group_orders.find_each_with_order(batch_size: BATCH_SIZE) {|go| yield go}
  end

  def group_order_articles_for(group_order)
    goas = group_order.group_order_articles.to_a
    goas.sort_by! {|goa| goa.order_article.article.name}
    goas
  end

  def each_group_order_article_for(group_order)
    group_order_articles_for(group_order).each {|goa| yield goa}
  end

end
