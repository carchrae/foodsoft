class Supplier < ApplicationRecord
  include MarkAsDeletedWithName
  include CustomFields

  has_many :articles, lambda {
                        where(type: nil).includes(:article_category).order('article_categories.name', 'articles.name')
                      }
  has_many :stock_articles, -> { includes(:article_category).order('article_categories.name', 'articles.name') }
  has_many :orders
  has_many :deliveries
  has_many :invoices
  belongs_to :supplier_category
  belongs_to :shared_supplier, optional: true # for the sharedLists-App

  validates :name, presence: true, length: { in: 4..30 }
  validates :phone, presence: true, length: { in: 8..25 }
  validates :address, presence: true, length: { in: 8..50 }
  validates :iban, format: { with: /\A[A-Z]{2}[0-9]{2}[0-9A-Z]{,30}\z/, allow_blank: true }
  validates :iban, uniqueness: { case_sensitive: false, allow_blank: true }
  validates :order_howto, :note, length: { maximum: 250 }
  validate :valid_shared_sync_method
  validate :uniqueness_of_name

  scope :undeleted, -> { where(deleted_at: nil) }
  scope :having_articles, -> { where(id: Article.undeleted.select(:supplier_id).distinct) }

  def self.ransackable_attributes(_auth_object = nil)
    %w[id name]
  end

  def self.ransackable_associations(_auth_object = nil)
    %w[articles stock_articles orders]
  end

  # sync all articles with the external database
  # returns an array with articles(and prices), which should be updated (to use in a form)
  # also returns an array with outlisted_articles, which should be deleted
  # also returns an array with new articles, which should be added (depending on shared_sync_method)
  def sync_all
    updated_article_pairs = []
    outlisted_articles = []
    new_articles = []
    existing_articles = Set.new
    for article in articles.undeleted
      # try to find the associated shared_article
      shared_article = article.shared_article(self)

      if shared_article # article will be updated
        existing_articles.add(shared_article.id)
        unequal_attributes = article.shared_article_changed?(self)
        if unequal_attributes.present? # skip if shared_article has not been changed
          article.attributes = unequal_attributes
          updated_article_pairs << [article, unequal_attributes]
        end
      # Articles with no order number can be used to put non-shared articles
      # in a shared supplier, with sync keeping them.
      elsif article.order_number.present?
        # article isn't in external database anymore
        outlisted_articles << article
      end
    end
    # Find any new articles, unless the import is manual
    if %w[all_available all_unavailable].include?(shared_sync_method)
      # build new articles
      shared_supplier
        .shared_articles
        .where(available: true)
        .where.not(id: existing_articles.to_a)
        .find_each { |new_shared_article| new_articles << new_shared_article.build_new_article(self) }
      # make them unavailable when desired
      new_articles.each { |new_article| new_article.availability = false } if shared_sync_method == 'all_unavailable'
    end
    [updated_article_pairs, outlisted_articles, new_articles]
  end

  # Synchronise articles with spreadsheet.
  #
  # @param file [File] Spreadsheet file to parse
  # @param options [Hash] Options passed to {FoodsoftFile#parse} except when listed here.
  # @option options [Boolean] :outlist_absent Set to +true+ to remove articles not in spreadsheet.
  # @option options [Boolean] :convert_units Omit or set to +true+ to keep current units, recomputing unit quantity and price.
  def sync_from_file(file, options = {})
    return sync_from_horizon_file(file, options) if name == 'Horizon'

    all_order_numbers = []
    updated_article_pairs = []
    outlisted_articles = []
    new_articles = []
    FoodsoftFile.parse file, options do |status, new_attrs, line|
      article = articles.undeleted.where(order_number: new_attrs[:order_number]).first
      new_attrs[:article_category] = ArticleCategory.find_match(new_attrs[:article_category])
      new_attrs[:tax] ||= FoodsoftConfig[:tax_default]
      new_article = articles.build(new_attrs)

      if status.nil?
        if article.nil?
          new_articles << new_article
        else
          unequal_attributes = article.unequal_attributes(new_article, options.slice(:convert_units))
          unless unequal_attributes.empty?
            article.attributes = unequal_attributes
            updated_article_pairs << [article, unequal_attributes]
          end
        end
      elsif status == :outlisted && article.present?
        outlisted_articles << article

      # stop when there is a parsing error
      elsif status.is_a? String
        # @todo move I18n key to model
        raise I18n.t('articles.model.error_parse', msg: status, line: line.to_s)
      end

      all_order_numbers << article.order_number if article
    end
    outlisted_articles += articles.undeleted.where.not(order_number: all_order_numbers + [nil]) if options[:outlist_absent]
    [updated_article_pairs, outlisted_articles, new_articles]
  end

  # Horizon price-list spreadsheets need their own column mapping and contain
  # duplicate order numbers; prefer the copy that is in an open order and
  # outlist the extras.
  def sync_from_horizon_file(file, options = {})
    all_order_numbers = []
    updated_article_pairs = []
    outlisted_articles = []
    new_articles = []
    articles_by_order_number = articles.undeleted.group_by(&:order_number)
    order_numbers_from_file = Set.new
    FoodsoftFile.parse_horizon file, options do |status, new_attrs, line|
      # if there are duplicates in the file, we just take the first one
      if order_numbers_from_file.add?(new_attrs[:order_number]).nil?
        logger.info("skipping duplicate #{new_attrs[:order_number]}")
        next
      end

      begin
        articles_matching = articles_by_order_number[new_attrs[:order_number]] || []
        articles_matching_in_open_orders = articles_matching.select(&:in_open_order)
        in_open_order = articles_matching_in_open_orders.count > 0
        article = in_open_order ? articles_matching_in_open_orders.first : articles_matching.first

        new_attrs[:article_category] = ArticleCategory.find_match(new_attrs[:article_category])
        new_attrs[:tax] ||= FoodsoftConfig[:tax_default]
        new_article = articles.build(new_attrs)

        if status.nil?
          if article.nil?
            new_articles << new_article
          else
            unequal_attributes = article.unequal_attributes(new_article, options.slice(:convert_units))
            unless unequal_attributes.empty?
              article.attributes = unequal_attributes
              updated_article_pairs << [article, unequal_attributes]
            end
          end
        elsif status == :outlisted && article.present?
          outlisted_articles << article
        elsif status.is_a? String
          raise I18n.t('articles.model.error_parse', msg: status, line: line.to_s)
        end

        duplicate_articles = articles_matching.reject { |a| a == article || a.in_open_order }
        if duplicate_articles.count > 0
          logger.info("found #{duplicate_articles.count} extra copies for #{new_attrs[:order_number]} #{new_attrs[:name]}")
          outlisted_articles.concat(duplicate_articles)
        end

        all_order_numbers << article.order_number if article
      rescue RuntimeError => e
        logger.error("horizon sync blew up on line #{line}: #{e.inspect}")
      end
    end
    outlisted_articles += articles.undeleted.where.not(order_number: all_order_numbers + [nil]) if options[:outlist_absent]
    [updated_article_pairs, outlisted_articles, new_articles]
  end

  # total of all orders on a pickup date, memoized for the pickups listing
  def sum_on_pickup_date(date, sum_type)
    @sum_on_pickup_date ||= {}
    @sum_on_pickup_date[[date, sum_type]] ||= orders.where(pickup: date).map { |o| o.sum(sum_type) }.sum
  end

  def notify_open_orders_updated
    orders.where(state: 'open').each(&:notify_modified)
  end

  # default value
  def shared_sync_method
    return unless shared_supplier

    self[:shared_sync_method] || 'import'
  end

  def deleted?
    deleted_at.present?
  end

  def mark_as_deleted
    transaction do
      super
      update_column :iban, nil
      articles.each(&:mark_as_deleted)
    end
  end

  # @return [Boolean] Whether there are articles that would use tolerance (unit_quantity > 1)
  def has_tolerance?
    articles.where('articles.unit_quantity > 1').any?
  end

  protected

  # make sure the shared_sync_method is allowed for the shared supplier
  def valid_shared_sync_method
    return unless shared_supplier && !shared_supplier.shared_sync_methods.include?(shared_sync_method)

    errors.add :shared_sync_method, :included
  end

  # Make sure, the name is uniq, add usefull message if uniq group is already deleted
  def uniqueness_of_name
    supplier = Supplier.where(name: name)
    supplier = supplier.where.not(id: id) unless new_record?
    return unless supplier.exists?

    message = supplier.first.deleted? ? :taken_with_deleted : :taken
    errors.add :name, message
  end
end
