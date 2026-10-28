# Catalogue search for one open order on the modern ordering page
# (ordering_app.js): the available articles of the order's supplier that are
# not in the order yet, so a member can add one (OrderingController#add_article).
# Used for suppliers whose catalogue is too big to put everything in the order,
# and only on orders that allow it: "user-can-add" in the order's note.
#
# Matching, ranking and the article JSON are DashboardSearchSerializer's, so
# both searches find the same things in the same order.
class OrderCatalogueSerializer < DashboardSearchSerializer
  MAX_HITS = 30
  # the order's note opts it in, so no new setting is needed
  USER_CAN_ADD_NOTE = /user-can-add/i

  # the marker as written in a note, with brackets or a separator around it
  USER_CAN_ADD_MARKER = /[ \t]*[(\[]?user-can-add[)\]]?[ \t]*[,;]?/i

  # Whether members may add catalogue articles to this order.
  def self.user_can_add?(order)
    !order.stockit? && order.open? && !!(order.note.to_s =~ USER_CAN_ADD_NOTE)
  end

  # The note as members see it: without the marker, nil when nothing is left.
  # Admin pages (orders, copy, manage) show the note as written.
  def self.member_note(note)
    note.to_s
      .gsub(/^#{USER_CAN_ADD_MARKER}[ \t]*\r?\n/, '') # a line of its own
      .gsub(USER_CAN_ADD_MARKER, ' ')
      .gsub(/[ \t]+$/, '').gsub(/^[ \t]+/, '').gsub(/[ \t]{2,}/, ' ')
      .strip.presence
  end

  def initialize(user, order, query, view)
    super(user, query, view)
    @order = order
  end

  def as_json(*)
    return {query: @query, articles: []} if @query.length < MIN_QUERY_LENGTH || @words.empty?
    articles = self.class.addable(@order)
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

  # Articles members may add to the order: available articles of the supplier
  # - in none of the supplier's current orders, by id or by name (the catalogue
  #   relists articles under new ids), so an item already in the Bulk order is
  #   never offered for the Produce or the dairy order of the same supplier
  # - in the categories the order already has (any, while it is empty), so a
  #   supplier's orders keep to their kind: no flour in the produce order
  def self.addable(order)
    in_current = OrderArticle.unscoped.joins(:order, :article).merge(current_orders(order.supplier_id))
    scope = Article.available.not_in_stock
      .where(supplier_id: order.supplier_id)
      .where.not(id: in_current.select(:article_id))
      .where.not(name: in_current.where.not(articles: {name: nil}).select('articles.name'))
    own = OrderArticle.unscoped.joins(:article).where(order_id: order.id)
    scope = scope.where(article_category_id: own.select('articles.article_category_id')) if own.exists?
    scope
  end

  # The supplier's orders whose articles are still to come: open ones, and the
  # closed ones until their pickup day has passed. What is in them is already
  # available to members, so it is not offered for adding.
  def self.current_orders(supplier_id)
    Order.where(supplier_id: supplier_id)
      .where("orders.state = 'open' OR orders.pickup >= ?", Date.current)
  end

  # Whether members may add to the order and there is something to add; the
  # page only offers the catalogue search then.
  def self.more_in_catalogue?(order)
    user_can_add?(order) && addable(order).exists?
  end

  # "Discovery Organics (Produce)": the order name with the first line of its
  # note, to tell apart a supplier's orders that are open at the same time.
  def self.order_label(order)
    note = member_note(order.note).to_s.lines.first.to_s.strip
    note = note[0, 39].strip + '…' if note.length > 40
    note.empty? ? order.name : "#{order.name} (#{note})"
  end
end
