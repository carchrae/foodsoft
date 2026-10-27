# Catalogue search for one open order on the modern ordering page
# (ordering_app.js): the available articles of the order's supplier that are
# not in the order yet, so a member can add one (OrderingController#add_article).
# Used for suppliers whose catalogue is too big to put everything in the order.
#
# Matching, ranking and the article JSON are DashboardSearchSerializer's, so
# both searches find the same things in the same order.
class OrderCatalogueSerializer < DashboardSearchSerializer
  MAX_HITS = 30

  def initialize(user, order, query, view)
    super(user, query, view)
    @order = order
  end

  def as_json(*)
    return {query: @query, articles: []} if @query.length < MIN_QUERY_LENGTH || @words.empty?
    articles = Article.available.not_in_stock
      .where(supplier_id: @order.supplier_id)
      .where.not(id: OrderArticle.unscoped.where(order_id: @order.id).select(:article_id))
      .where(*word_conditions)
      .includes(:supplier)
      .limit(MAX_ARTICLE_ROWS).to_a
      .sort_by do |a|
        name = a.name.to_s.downcase
        [[relevance(name), relevance(a.note.to_s.downcase)].min, name.length, name]
      end.first(MAX_HITS)
    last = last_ordered(articles)
    # produce orders: reasons to think twice, the page asks before adding
    warnings = ProduceAddWarnings.produce?(@order) ? ProduceAddWarnings.new(@order, articles).to_h : {}
    {
      query: @query,
      articles: articles.map do |a|
        json = article_json(a, last[[a.supplier_id, a.name]])
        warnings[a.id] ? json.merge(warnings: warnings[a.id]) : json
      end,
    }
  end

  private

  # Like the dashboard, plus the note: some catalogues (Purity) abbreviate the
  # name ("NWRLD SESA TAHINI RAW") and spell it out in the note.
  def word_conditions
    conditions = @words.each_index.map do |i|
      "(LOWER(articles.name) LIKE :w#{i} ESCAPE '!' OR LOWER(articles.manufacturer) LIKE :w#{i} ESCAPE '!'" \
        " OR LOWER(articles.note) LIKE :w#{i} ESCAPE '!')"
    end
    [conditions.join(' AND '), super.last]
  end

  public

  # Whether the supplier has available articles that are not in the order; the
  # page only offers the catalogue search when there are some.
  def self.more_in_catalogue?(order)
    return false if order.stockit?
    Article.available.not_in_stock
      .where(supplier_id: order.supplier_id)
      .where.not(id: OrderArticle.unscoped.where(order_id: order.id).select(:article_id))
      .exists?
  end
end
