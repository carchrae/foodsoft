# An OrderArticle represents a single Article that is part of an Order.
class OrderArticle < ApplicationRecord
  include FindEachWithOrder

  attr_reader :update_global_price

  belongs_to :order
  belongs_to :article
  belongs_to :article_price
  has_many :group_order_articles, :dependent => :destroy

  validates_presence_of :order_id, :article_id
  validate :article_and_price_exist
  validates_uniqueness_of :article_id, scope: :order_id

  _ordered_sql = "order_articles.units_to_order > 0 OR order_articles.units_billed > 0 OR order_articles.units_received > 0"
  scope :ordered, -> {where(_ordered_sql)}
  scope :ordered_or_member, -> {includes(:group_order_articles).where("#{_ordered_sql} OR order_articles.quantity > 0 OR group_order_articles.result > 0")}
  default_scope {includes(:article).order('articles.name')}

  before_create :init_from_balancing
  after_destroy :update_ordergroup_prices

  # This method returns either the ArticlePrice or the Article
  # The first will be set, when the the order is finished
  def price
    article_price || article
  end

  # latest information on available units
  def units
    return units_received unless units_received.nil?
    return units_billed unless units_billed.nil?
    units_to_order
  end

  # Count quantities of belonging group_orders.
  # In balancing this can differ from ordered (by supplier) quantity for this article.
  def group_orders_sum
    @group_orders_sum ||= begin
      quantity = group_order_articles.collect(&:result).sum
      @group_orders_sum = {:quantity => quantity, :price => quantity * price.fc_price, :net_price => quantity * price.price}
    end
  end

  # Update quantity/tolerance/units_to_order from group_order_articles
  def update_results!
    if order.open?
      self.quantity = group_order_articles.collect(&:quantity).sum
      self.tolerance = group_order_articles.collect(&:tolerance).sum
      self.units_to_order = calculate_units_to_order(quantity, tolerance)
      enforce_boxfill if order.boxfill?
      save!
    elsif order.finished?
      update_attribute(:units_to_order, group_order_articles.collect(&:result).sum)
    end
  end

  # Returns how many units of the belonging article need to be ordered given the specified order quantity and tolerance.
  # This is determined by calculating how many units can be ordered from the given order quantity, using
  # the tolerance to order an additional unit if the order quantity is not quiet sufficient.
  # There must always be at least one item in a unit that is an ordered quantity (no units are ever entirely
  # filled by tolerance items only).
  #
  # Example:
  #
  # unit_quantity | quantity | tolerance | calculate_units_to_order
  # --------------+----------+-----------+-----------------------
  #      4        |    0     |     2     |           0
  #      4        |    0     |     5     |           0
  #      4        |    2     |     2     |           1
  #      4        |    4     |     2     |           1
  #      4        |    4     |     4     |           1
  #      4        |    5     |     3     |           2
  #      4        |    5     |     4     |           2
  #
  def calculate_units_to_order(quantity, tolerance = 0)
    unit_size = price.unit_quantity
    units = quantity / unit_size
    remainder = quantity % unit_size
    units += ((remainder > 0) && (remainder + tolerance >= unit_size) ? 1 : 0)
  end

  # Calculate amount charged to members for ordered quantity.
  def total_price
    units * price.unit_quantity * price.price
  end

  # Calculate supplier charge for ordered quantity.
  def total_supplier_charge
    units * price.supplier_price
  end

  def total_charges_to_members
    group_orders_sum[:net_price]
  end

  # rounding error, since we round to the nearest cent/penny
  def calculate_rounding_error(supplier_price, unit_quantity)
    if unit_quantity != 0
      cost_per = supplier_price / unit_quantity
      cost_per_in_cent = cost_per * 100
      cost_per_in_cent_rounded = cost_per_in_cent.ceil
      (cost_per_in_cent_rounded - cost_per_in_cent) / 100
    else
      0
    end
  end

  # price rounding error, since we round to the nearest cent/penny
  def price_rounding_error
    cost_per = price.supplier_price / price.unit_quantity
    cost_per_in_cent = cost_per * 100
    cost_per_in_cent_rounded = cost_per_in_cent.ceil
    (cost_per_in_cent_rounded - cost_per_in_cent) / 100
  end

  def total_price_rounding_error
    units * price.unit_quantity * price_rounding_error
  end

  # true if the supplier price is different than the amount charged to members - allowing for rounding errors
  def supplier_price_different_than_charged?
    # (total_supplier_price - total_price) * 100 > (units * price.unit_quantity)
    if units == 0
      false
    else
      !price_balanced
    end
  end

  def price_balanced
    member_total = group_orders_sum
    actual_price_per = price.price_rounded_up(price: total_supplier_charge, quantity: member_total[:quantity])
    actual_price_per.to_f == price.price.to_f
  end

  def ordered_quantities_different_from_group_orders?(ordered_mark = "!", billed_mark = "?", received_mark = "?")
    if not units_received.nil?
      ((units_received * price.unit_quantity) == group_orders_sum[:quantity]) ? false : received_mark
    elsif not units_billed.nil?
      ((units_billed * price.unit_quantity) == group_orders_sum[:quantity]) ? false : billed_mark
    elsif not units_to_order.nil?
      ((units_to_order * price.unit_quantity) == group_orders_sum[:quantity]) ? false : ordered_mark
    else
      nil # can happen in integration tests
    end
  end

  # redistribute articles over ordergroups
  #   quantity       Number of units to distribute
  #   surplus        What to do when there are more articles than ordered quantity
  #                    :tolerance   fill member orders' tolerance
  #                    :stock       move to stock
  #                    nil          nothing; for catching the remaining count
  #   update_totals  Whether to update group_order and ordergroup totals
  # returns array with counts for each surplus method
  def redistribute(quantity, surplus = [:tolerance], update_totals = true)
    qty_left = quantity
    counts = [0] * surplus.length

    if surplus.index(:tolerance).nil?
      qty_for_members = [qty_left, self.quantity].min
    else
      qty_for_members = [qty_left, self.quantity + self.tolerance].min
      counts[surplus.index(:tolerance)] = [0, qty_for_members - self.quantity].max
    end

    # Recompute
    group_order_articles.each {|goa| goa.save_results! qty_for_members}
    qty_left -= qty_for_members

    # if there's anything left, move to stock if wanted
    if qty_left > 0 && surplus.index(:stock)
      counts[surplus.index(:stock)] = qty_left
      # 1) find existing stock article with same name, unit, price
      # 2) if not found, create new stock article
      #      avoiding duplicate stock article names
    end
    if qty_left > 0 && surplus.index(nil)
      counts[surplus.index(nil)] = qty_left
    end

    # Update GroupOrder prices & Ordergroup stats
    # TODO only affected group_orders, and once after redistributing all articles
    if update_totals
      update_ordergroup_prices
      order.ordergroups.each(&:update_stats!)
    end

    # TODO notifications

    counts
  end

  # Updates order_article and belongings during balancing process
  def update_article_and_price!(order_article_attributes, article_attributes, price_attributes = nil)
    OrderArticle.transaction do
      # Updates self
      self.update_attributes!(order_article_attributes)

      # Updates article
      article.update_attributes!(article_attributes)

      # Updates article_price belonging to current order article
      if price_attributes.present?
        article_price.attributes = price_attributes
        if article_price.changed?
          # Updates also price attributes of article if update_global_price is selected
          if update_global_price
            article.update_attributes!(price_attributes)
            self.article_price = article.article_prices.first and save # Assign new created article price to order article
          else
            # Creates a new article_price if neccessary
            # Set created_at timestamp to order ends, to make sure the current article price isn't changed
            create_article_price!(price_attributes.merge(created_at: order.ends)) and save
            # TODO: The price_attributes do not include an article_id so that
            #   the entry in the database will not "know" which article is
            #   referenced. Let us check the effect of that and change it or
            #   comment on the meaning.
            #   Possibly this is the real reason why the global price is not
            #   affected instead of the `created_at: order.ends` injection.
          end

          # Updates ordergroup values
          update_ordergroup_prices
        end
      end
    end
  end

  def update_global_price=(value)
    @update_global_price = (value == true || value == '1') ? true : false
  end

  # @return [Number] Units missing for the last +unit_quantity+ of the article.
  def missing_units
    _missing_units(price.unit_quantity, quantity, tolerance)
  end

  def missing_units_was
    _missing_units(price.unit_quantity, quantity_was, tolerance_was)
  end

  # Check if the result of any associated GroupOrderArticle was overridden manually
  def result_manually_changed?
    group_order_articles.any? {|goa| goa.result_manually_changed?}
  end

  private

  def article_and_price_exist
    errors.add(:article, I18n.t('model.order_article.error_price')) if !(article = Article.find(article_id)) || article.fc_price.nil?
  rescue
    errors.add(:article, I18n.t('model.order_article.error_price'))
  end

  # Associate with current article price if created in a finished order
  def init_from_balancing
    if order.present? && order.finished?
      self.article_price = article.article_prices.first
    end
  end

  def update_ordergroup_prices
    # updates prices of ALL ordergroups - these are actually too many
    # in case of performance issues, update only ordergroups, which ordered this article
    # CAUTION: in after_destroy callback related records (e.g. group_order_articles) are already non-existent
    order.group_orders.each(&:update_price!)
  end

  # Throws an exception when the changed article decreases the amount of filled boxes.
  def enforce_boxfill
    # Either nothing changes, or the tolerance increases,
    # missing_units decreases and the amount doesn't decrease, or
    # tolerance was moved to quantity. Only then are changes allowed in the boxfill phase.
    delta_q = quantity - quantity_was
    delta_t = tolerance - tolerance_was
    delta_mis = missing_units - missing_units_was
    delta_box = units_to_order - units_to_order_was
    unless (delta_q == 0 && delta_t >= 0) ||
        (delta_mis < 0 && delta_box >= 0 && delta_t >= 0) ||
        (delta_q > 0 && delta_q == -delta_t)
      raise ActiveRecord::RecordNotSaved.new("Change not acceptable in boxfill phase for '#{article.name}', sorry.", self)
    end
  end

  def _missing_units(unit_quantity, quantity, tolerance)
    begin
      units = unit_quantity - ((quantity % unit_quantity) + tolerance)
      units = 0 if units < 0
      units = 0 if units == unit_quantity
      units
    rescue => e
      logger.error("order_article=#{id} : failed to compute missing_units for #{article.name} #{article.id} : #{e}")
      0
    end
  end
end
