# Article category
class ArticleCategory < ApplicationRecord

  # @!attribute name
  #   @return [String] Title of the category.
  # @!attrubute description
  #   @return [String] Description (currently unused)

  # @!attribute articles
  #   @return [Array<Article>] Articles with this category.
  has_many :articles

  normalize_attributes :name, :description

  validates :name, :presence => true, :uniqueness => true, :length => { :minimum => 2 }

  before_destroy :check_for_associated_articles

  # Find a category that matches a category name, creating it when there is
  # none, so that a sync or upload does not need every supplier category to be
  # defined up front. Returns nil only for blank or too short names.
  # TODO more intelligence like remembering earlier associations (global and/or per-supplier)
  @@cache = {}
  def self.find_match(category)
    return if category.blank? || category.length < 3
    c = nil

    if (@@cache[category])
      # puts "found in cache #{category}"
      return @@cache[category];
    end
    ## exact match - not needed, will be returned by next query as well
    #c ||= ArticleCategory.where(name: category).first
    # case-insensitive substring match (take the closest match = shortest)
    c = ArticleCategory.where('name LIKE ?', "%#{category}%") unless c && c.any?
    # case-insensitive phrase present in category description
    c = ArticleCategory.where('description LIKE ?', "%#{category}%").select { |s| s.description.match /(^|,)\s*#{Regexp.escape(category)}\s*(,|$)/i } unless c && c.any?
    # return closest match if there are multiple
    c = c.sort_by { |s| s.name.length }.first if c.respond_to? :sort_by

    # nothing matches: create the category as the supplier names it
    c ||= create_on_demand(category)

    @@cache[category] = c
    c
  end

  # Creates a category named after a supplier's category, e.g. during a sync
  # with the shared database or a spreadsheet upload. Returns nil when the
  # name cannot be saved (another process may have created it meanwhile, in
  # which case it is looked up again).
  def self.create_on_demand(category)
    name = category.to_s.strip.squeeze(' ')[0, 255]
    created = ArticleCategory.create(name: name)
    return created if created.persisted?

    Rails.logger.warn "could not create article category #{name.inspect}: #{created.errors.full_messages.join(', ')}"
    ArticleCategory.where(name: name).first
  end

  protected

  # Deny deleting the category when there are associated articles.
  def check_for_associated_articles
    raise I18n.t('activerecord.errors.has_many_left', collection: Article.model_name.human) if articles.undeleted.exists?
  end

end
