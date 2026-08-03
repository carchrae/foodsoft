module ArticlesHelper
  # ids of this supplier's articles that are in an open order (used to warn
  # during sync that changes affect a running order)
  def article_in_open_order
    @article_in_open_order ||= begin
      order_articles = OrderArticle.where(order_id: Order.open.where(supplier_id: @supplier.id).collect(&:id))
      order_articles.map { |oa| oa.article_id }.to_set
    end
  end

  # useful for highlighting attributes, when synchronizing articles
  def highlight_new(unequal_attributes, attribute)
    return unless unequal_attributes

    unequal_attributes.has_key?(attribute) ? 'background-color: yellow' : ''
  end

  def row_classes(article)
    classes = []
    classes << 'unavailable' unless article.availability
    classes << 'just-updated' if article.recently_updated && article.availability
    classes.join(' ')
  end
end
