class AddSupplierPriceToArticles < ActiveRecord::Migration[4.2]
  def change
    add_column :articles, :supplier_price, :decimal, precision: 8, scale: 2
  end
end
