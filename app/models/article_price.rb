class ArticlePrice < ActiveRecord::Base

  # @!attribute price
  #   @return [Number] Net price
  #   @see Article#price
  # @!attribute tax
  #   @return [Number] VAT percentage
  #   @see Article#tax
  # @!attribute deposit
  #   @return [Number] Deposit
  #   @see Article#deposit
  # @!attribute unit_quantity
  #   @return [Number] Number of units in wholesale package (box).
  #   @see Article#unit
  #   @see Article#unit_quantity
  # @!attribute article
  #   @return [Article] Article this price is about.
  belongs_to :article
  # @!attribute order_articles
  #   @return [Array<OrderArticle>] Order articles this price is associated with.
  has_many :order_articles

  localize_input_of :price, :tax, :deposit, :supplier_price

  validates_presence_of :price, :tax, :deposit, :unit_quantity
  validates_numericality_of :price, :greater_than_or_equal_to => 0
  validates_numericality_of :unit_quantity, :greater_than => 0
  validates_numericality_of :deposit, :tax, :supplier_price

  # Gross price = net price + deposit + tax.
  # @return [Number] Gross price.
  # @todo remove code-duplication with Article
  def gross_price
    ((price + deposit) * (tax / 100 + 1)).round(2)
  end

  # not ready yet, more testing
  def gross_price_supplier
    if (supplier_price)
      unit_price = supplier_price / unit_quantity
    else
      unit_price = price
    end
    ((unit_price + deposit) * (tax / 100 + 1)).round(2)
  end


  # @return [Number] Price for the foodcoop-member.
  # @todo remove code-duplication with Article
  def fc_price
    (gross_price * (FoodsoftConfig[:price_markup] / 100 + 1)).round(2)
  end

  # def supplier_price=(new_price)
  #   new_price = new_price.to_f
  #   write_attribute(:supplier_price, new_price)
  #   write_attribute(price, (new_price/unit_quantity).round(2))
  # end
end

