class ChangeUnitsReceivedToDecimal < ActiveRecord::Migration
  def change
    change_column :order_articles, :units_received, :decimal, precision: 8, scale: 3
    change_column :order_articles, :units_billed, :decimal, precision: 8, scale: 3
  end
end
