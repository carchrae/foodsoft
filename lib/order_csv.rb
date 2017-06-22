require 'csv'

class OrderCsv < RenderCSV

  def header
    table_data.first
    # [
    #   OrderArticle.human_attribute_name(:units_to_order),
    #   #Article.human_attribute_name(:order_number),
    #   Article.human_attribute_name(:name),
    #   Article.human_attribute_name(:unit),
    #   Article.human_attribute_name(:unit_quantity_short),
    #   ArticlePrice.human_attribute_name(:price),
    #   OrderArticle.human_attribute_name(:total_price)
    # ]
  end

  def order_fax
    @order_fax ||= OrderFax.new(@object)
  end

  def table_data
    @table_data,@total_cost = order_fax.table_data unless @table_data
    @table_data
  end

  def data
    table_data.drop(1).each do |row|
      yield row
    end
    # @object.order_articles.ordered.includes([:article, :article_price]).all.map do |oa|
    #   yield [
    #           oa.units_to_order,
    #           #oa.article.order_number,
    #           oa.article.name,
    #           oa.article.unit,
    #           oa.price.unit_quantity > 1 ? oa.price.unit_quantity : nil,
    #           number_to_currency(oa.price.price * oa.price.unit_quantity),
    #           number_to_currency(oa.total_price)
    #         ]
    # end
  end

end
