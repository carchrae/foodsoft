# The old-style split sheets: a portrait delivery-checklist page per order
# followed by landscape grid pages (8 articles wide) with one row per
# ordergroup, used to divide a delivery on the floor.
class OrderMatrix < OrderPdf
  MAX_ARTICLES_PER_PAGE = 8 # How many order_articles on each page

  def initialize(order, options = {})
    super(order, options)
    @order = Order.find(order[0]) if order.is_a? Array
  end

  def filename
    I18n.t('documents.order_matrix.filename', name: @order.name, date: @order.ends.to_date) + '.pdf'
  end

  def title
    @order = Order.find(order[0]) if @order.is_a? Array
    I18n.t('documents.order_matrix.title', name: @order.name,
                                           date: @order.ends.strftime(I18n.t('date.formats.default')),
                                           user_name: @order.created_by.name)
  end

  def body
    @orders = [@order] unless @orders.is_a? Array

    @orders.each do |order|
      @order = order.is_a?(Integer) ? Order.find(order) : order

      text @order.supplier.name + ' ordered by ' + @order.created_by.name
      move_down 10

      unless @order.note.blank?
        text 'note: ' + @order.note, size: fontsize(9)
        move_down 5
      end

      @order.comments.each_with_index do |comment, i|
        if i == 0
          text 'Comments', size: fontsize(9)
          move_down 5
        end
        text comment.user.name + ' wrote: ' + comment.text, size: fontsize(9)
        move_down 5
      end

      move_down 10
    end

    @orders.each do |order|
      @order = order.is_a?(Integer) ? Order.find(order) : order

      order_articles = @order.order_articles.ordered.sort_by { |o| o.article.name }

      total_num_order_articles = order_articles.size
      page_number = 0

      start_new_page(layout: :portrait)

      text I18n.t('documents.order_matrix.heading'), style: :bold
      move_down 5
      text I18n.t('documents.order_matrix.note', user_name: @order.created_by.name,
                                                 user_email: @order.created_by.email), { size: fontsize(8), style: :bold }

      order_articles_data = [I18n.t('documents.order_matrix.rows')]

      order_articles.each do |a|
        order_articles_data << [a.article.name.gsub(/\s+/, ' '),
                                a.article.unit,
                                a.price.unit_quantity * a.units,
                                number_with_precision(article_price(a), precision: 2),
                                number_with_precision(a.price.unit_quantity * article_price(a), precision: 2),
                                a.units,
                                '', '']
      end

      table order_articles_data, cell_style: { size: fontsize(8), overflow: :shrink_to_fit } do |table|
        table.cells.border_width = 1
        table.cells.border_color = '666666'
      end

      while page_number * MAX_ARTICLES_PER_PAGE < total_num_order_articles # Start page generating
        page_number += 1
        start_new_page(layout: :landscape)

        # Collect order_articles for this page
        current_order_articles = order_articles.select do |a|
          order_articles.index(a) >= (page_number - 1) * MAX_ARTICLES_PER_PAGE &&
            order_articles.index(a) < page_number * MAX_ARTICLES_PER_PAGE
        end

        # Make order_articles header
        header = ['']
        for header_article in current_order_articles
          name = header_article.article.name.gsub(%r{[-/]}, ' ').gsub('.', '. ').gsub(/\s+/, ' ')
          name = name.split.collect { |w| w.truncate(5, omission: '.') }.join(' ')
          limit = 25
          trail = 6
          name = name.truncate(limit - trail) + name[-trail..-1] if name.length > limit
          header << name
        end

        # Collect group results
        groups_data = [header]

        @order.group_orders.includes(:ordergroup).sort_by(&:ordergroup_name).each do |group_order|
          group_result = [group_order.ordergroup_name.truncate(20)]

          for order_article in current_order_articles
            # get the Ordergroup result for this order_article
            goa = order_article.group_order_articles.where(group_order_id: group_order.id).first
            result = if goa.nil?
                       ''
                     else
                       was_ordered = goa.quantity != 0 || goa.tolerance != 0 || goa.result != 0
                       was_ordered ? "(#{goa.quantity}..#{goa.quantity + goa.tolerance})   #{goa.result.to_i}" : ''
                     end
            group_result << result
          end
          groups_data << group_result
        end

        group_result = ['Cases = Total Units']
        for order_article in current_order_articles
          group_result << [
            "#{order_article.units} = #{order_article.units * order_article.price.unit_quantity}",
            order_article.article.unit.to_s.first =~ /^[1-9].*/ ? ' X ' : ' ',
            order_article.article.unit.to_s
          ].join('')
        end
        groups_data << group_result

        # Make table
        column_widths = [85]
        (MAX_ARTICLES_PER_PAGE + 1).times { |i| column_widths << (656 / (MAX_ARTICLES_PER_PAGE + 1)).floor unless i == 0 }
        table groups_data, column_widths: column_widths, cell_style: { size: fontsize(8), overflow: :shrink_to_fit } do |table|
          table.cells.border_width = 1
          table.cells.border_color = '666666'
          table.row_colors = %w[ffffff ececec]
          table.row(groups_data.length - 1).style(bold: true)
        end
      end
    end
  end

  private

  # Return price for article.
  #
  # This is a separate method so that plugins can override it.
  #
  # @param article [Article]
  # @return [Number] Price to show
  # @see https://github.com/foodcoops/foodsoft/issues/445
  def article_price(article)
    article.price.fc_price
  end
end
