module PriceCalculation
  extend ActiveSupport::Concern

  # Gross price = net price + tax + deposit.
  # Tax applies to the price only: deposits are not taxed here (e.g. BC bottle
  # deposits), so this intentionally differs from upstream's
  # `add_percent(price + deposit, tax)`.
  # @return [Number] Gross price.
  def gross_price
    add_percent(price, tax) + deposit
  end

  # @return [Number] Tax portion of the gross price.
  def tax_cost
    add_percent(price, tax) - price
  end

  # @return [Number] Price for the foodcoop-member.
  def fc_price
    add_percent(gross_price, FoodsoftConfig[:price_markup].to_i)
  end

  # Price per unit derived from the supplier's case price, rounding up so the
  # co-op doesn't lose money on the split.
  def price_rounded_up(options = {})
    options[:price] ||= supplier_price
    options[:quantity] ||= unit_quantity
    return 0 if options[:quantity].nil? || options[:quantity].zero?

    ((options[:price] / options[:quantity].to_f) * 100).ceil / 100.0
  end

  # The supplier's case price. Falls back to unit_quantity * price for records
  # that predate the supplier_price column.
  def supplier_price
    read_attribute(:supplier_price) || (unit_quantity * price unless unit_quantity.nil? || price.nil?)
  end

  private

  def add_percent(value, percent)
    (value * ((percent * 0.01) + 1)).round(2)
  end
end
