class SharedSupplier < ApplicationRecord
  # connect to database from sharedLists-Application
  SharedSupplier.establish_connection(FoodsoftConfig[:shared_lists])
  # set correct table_name in external DB
  self.table_name = 'suppliers'

  has_many :suppliers, -> { undeleted }
  has_many :shared_articles, foreign_key: :supplier_id

  def find_article_by_number(order_number)
    # NOTE: that `shared_articles` uses number instead order_number
    cached_articles.detect { |a| a.number == order_number }
  end

  def find_article_by_name_origin_manufacture(name, origin, manufacturer)
    cached_articles.detect { |a| a.name == name && a.origin == origin && a.manufacturer == manufacturer }
  end

  def find_article_by_name_manufacture(name, manufacturer)
    cached_articles.detect { |a| a.name == name && a.manufacturer == manufacturer }
  end

  def cached_articles
    # without a configured shared DB, ActiveRecord silently falls back to the
    # MAIN database's articles table — syncing against that would outlist
    # everything, so fail loudly instead
    unless FoodsoftConfig[:shared_lists].present?
      raise 'shared_lists database is not configured (set SHARED_DATABASE_URL)'
    end

    @cached_articles ||= shared_articles.where(available: true)
  end

  # These set of attributes are used to autofill attributes of new supplier,
  # when created by import from shared supplier feature.
  def autofill_attributes
    whitelist = %w[name address phone fax email url delivery_days note]
    attributes.select { |k, _v| whitelist.include?(k) }
  end

  # return list of synchronisation methods available for this supplier
  def shared_sync_methods
    methods = []
    if shared_articles.count < FoodsoftConfig[:shared_supplier_article_sync_limit]
      methods += %w[all_available
                    all_unavailable]
    end
    methods += %w[import]
    methods
  end
end
