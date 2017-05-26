# encoding: utf-8
class OrderMatrix < OrderPdf

  MAX_ARTICLES_PER_PAGE = 8 # How many order_articles on each page

  def filename
    I18n.t('documents.order_matrix.filename', :name => @order.name, :date => @order.ends.to_date) + '.pdf'
  end

  def title
    I18n.t('documents.order_matrix.title', :name => @order.name,
      :date => @order.ends.strftime(I18n.t('date.formats.default')),
      :user_name => @order.created_by.name
    )
  end

  def body
    order_articles = @order.order_articles.ordered.sort_by {|o| o.article.name }

    text I18n.t('documents.order_matrix.heading'), style: :bold
    move_down 5
    text I18n.t('documents.order_matrix.note', :user_name => @order.created_by.name,
                :user_email => @order.created_by.email), {size: fontsize(8), style: :bold}

    # text I18n.t('documents.order_matrix.total', :count => order_articles.size), size: fontsize(8)
    # move_down 10

    order_articles_data = [I18n.t('documents.order_matrix.rows')]

    order_articles.each do |a|
      order_articles_data << [a.article.name.gsub(/\s+/,' '),
                              a.article.unit,
                              a.price.unit_quantity,
                              number_with_precision(article_price(a), precision: 2),
                              number_with_precision((a.price.unit_quantity * article_price(a)), precision: 2),
                              a.units,
                              '','']
    end

    table order_articles_data, cell_style: {size: fontsize(8), overflow: :shrink_to_fit} do |table|
      table.cells.border_width = 1
      table.cells.border_color = '666666'
    end

    page_number = 0
    total_num_order_articles = order_articles.size

    while page_number * MAX_ARTICLES_PER_PAGE < total_num_order_articles do  # Start page generating

      page_number += 1
      start_new_page(layout: :landscape)

      # Collect order_articles for this page
      current_order_articles = order_articles.select do |a|
        order_articles.index(a) >= (page_number-1) * MAX_ARTICLES_PER_PAGE and
            order_articles.index(a) < page_number * MAX_ARTICLES_PER_PAGE
      end

      # Make order_articles header
      header = [""]
      for header_article in current_order_articles
        name = header_article.article.name.gsub(/[-\/]/, " ").gsub(".", ". ").gsub(/\s+/,' ')
        name = name.split.collect { |w| w.truncate(8) }.join(" ")
        header << name
      end

      # Collect group results
      groups_data = [header]

      @order.group_orders.includes(:ordergroup).sort_by(&:ordergroup_name).each do |group_order|

        group_result = [group_order.ordergroup_name.truncate(20)]

        for order_article in current_order_articles
          # get the Ordergroup result for this order_article
          goa = order_article.group_order_articles.where(group_order_id: group_order.id).first
          result = ((goa.nil? || goa.result == 0) ? ''  : goa.result.to_i)
          group_result <<  result
        end
        groups_data << group_result
      end

      group_result = ['Total Units']
      for order_article in current_order_articles
        # get the Ordergroup result for this order_article
        group_result << " #{order_article.units * order_article.price.unit_quantity} X #{order_article.article.unit}"
      end
      groups_data << group_result

      group_result = ['Cases']
      for order_article in current_order_articles
        # get the Ordergroup result for this order_article
        group_result << "#{order_article.units}"
      end
      groups_data << group_result

      # Make table
      column_widths = [85]
      (MAX_ARTICLES_PER_PAGE + 1).times { |i| column_widths << (656/(MAX_ARTICLES_PER_PAGE+1)).floor unless i == 0 }
      table groups_data, column_widths: column_widths, cell_style: {size: fontsize(8), overflow: :shrink_to_fit} do |table|
        table.row(0).style(:size => 6)
        table.cells.border_width = 1
        table.cells.border_color = '666666'
        table.row_colors = ['ffffff','ececec']
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
