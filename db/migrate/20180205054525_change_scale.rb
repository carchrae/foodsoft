class ChangeScale < ActiveRecord::Migration
  def change
    change_column :order_articles, :units_to_order, :decimal, precision: 12, scale: 5
    change_column :order_articles, :units_billed, :decimal, precision: 12, scale: 5
    change_column :order_articles, :units_received, :decimal, precision: 12, scale: 5

    change_column :group_order_articles, :result, :decimal, precision: 12, scale: 5
    change_column :group_order_articles, :result_computed, :decimal, precision: 12, scale: 5
  end
end
