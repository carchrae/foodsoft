
class OrderTxt
  def initialize(order, options={})
    @order = order
  end

  # Renders the fax-text-file
  # e.g. for easier use with online-fax-software, which don't accept pdf-files
  def to_txt
    supplier = @order.supplier
    contact = FoodsoftConfig[:contact].symbolize_keys
    text = I18n.t('orders.fax.heading', :name => FoodsoftConfig[:name])
    text += "\n#{Supplier.human_attribute_name(:customer_number)}: #{supplier.customer_number}" unless supplier.customer_number.blank?
    text += "\n" + I18n.t('orders.fax.delivery_day')
    text += "\n\n#{supplier.name}\n#{supplier.address}\n#{Supplier.human_attribute_name(:fax)}: #{supplier.fax}\n\n"
    text += "****** " + I18n.t('orders.fax.to_address') + "\n\n"
    text += "#{FoodsoftConfig[:name]}\n#{contact[:street]}\n#{contact[:zip_code]} #{contact[:city]}\n\n"
    text += "****** " + I18n.t('orders.fax.articles') + "\n\n"
    # text += "%8s %8s   %s\n"%[I18n.t('orders.fax.number'), I18n.t('orders.fax.amount'), I18n.t('orders.fax.name')]
    # # now display all ordered articles
    # @order.order_articles.ordered.includes([:article, :article_price]).each do |oa|
    #   text += "%8s %8d   %s\n"%[oa.units_to_order.to_i, oa.article.name]
    # end

    col_width=[]
    table_data.each do |row|
      row.each.with_index{|cell,i| col_width[i] = cell.to_s.length if (col_width[i].nil? || cell.to_s.length>col_width[i]) }
    end
    table_data.each do |row|
      text += row.map.with_index{|cell,i| cell.to_s.ljust(col_width[i]+1)}.join().gsub("\n",'') + "\n"
    end
    text
  end

  def order_fax
    @order_fax ||= OrderFax.new(@order)
  end

  def table_data
    @table_data,@total_cost = order_fax.table_data unless @table_data
    @table_data
  end

  # Helper method to test pdf via rails console: OrderTxt.new(order).save_tmp
  def save_tmp
    File.open("#{Rails.root}/tmp/#{self.class.to_s.underscore}.txt", 'w') {|f| f.write(to_csv.force_encoding("UTF-8")) }
  end
end
