class AddSupplierNoteToOrders < ActiveRecord::Migration[4.2]
  def change
    add_column :orders, :supplier_note, :text
  end
end
