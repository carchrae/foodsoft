class ChangeUnitsToOrderToDecimal < ActiveRecord::Migration
  def change
    change_column :order_articles, :units_to_order, :decimal, precision: 8, scale: 3
  end
end
