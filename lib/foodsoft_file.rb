# Foodsoft-file import
class FoodsoftFile

  # parses a string from a foodsoft-file
  # returns two arrays with articles and outlisted_articles
  # the parsed article is a simple hash
  def self.parse(file, options = {})
    SpreadsheetFile.parse file, options do |row, row_index|
      next if row[2].blank?

      article = { :order_number => row[1],
                  :name => row[2],
                  :note => row[3],
                  :manufacturer => row[4],
                  :origin => row[5],
                  :unit => row[6],
                  :price => row[7],
                  :tax => row[8],
                  :deposit => (row[9].nil? ? "0" : row[9]),
                  :unit_quantity => row[10],
                  :article_category => row[13] }
      status = row[0] && row[0].strip.downcase == 'x' ? :outlisted : nil
      yield status, article, row_index
    end
  end

  # header labels used to locate columns in newer Horizon catalogues
  HORIZON_HEADER_COLUMNS = {
    'code' => :order_number,
    'brand name' => :manufacturer,
    'sku description' => :name,
    'catalogue description' => :note,
    'case pack' => :unit_quantity,
    'unit size' => :unit,
    'unit price' => :price
  }.freeze

  def self.parseHorizon(file, options = {})
    row_to_index = ('a'..'z').zip(0..25).to_h
    # legacy catalogue layout (up to ~2024): Bulk column at E, data shifted
    # one right of the header labels, taxes at M/N
    cols = {
      order_number: row_to_index['b'],
      manufacturer: row_to_index['c'],
      name: row_to_index['d'],
      note: row_to_index['g'],
      unit_quantity: row_to_index['h'],
      unit: row_to_index['i'],
      price: row_to_index['j'],
      pst: row_to_index['m'],
      gst: row_to_index['n']
    }

    SpreadsheetFile.parse file, options do |row, row_index|
      headers = row.map { |cell| cell.to_s.gsub(/\s+/, ' ').strip }
      if headers.include?('Code') && headers.include?('Unit Price')
        # In the legacy catalogue the header labels sit one column left of the
        # data (merged cells), so keep the static mapping for it; it is
        # recognisable by 'Bulk' appearing before 'Catalogue Description'.
        bulk_index = headers.index('Bulk')
        note_index = headers.index('Catalogue Description')
        unless bulk_index && note_index && bulk_index < note_index
          headers.each_with_index do |header, index|
            key = HORIZON_HEADER_COLUMNS[header.downcase]
            key ||= :pst if header.start_with?('P (')
            key ||= :gst if header.start_with?('T (')
            cols[key] = index if key
          end
        end
        next
      end

      next if row[cols[:manufacturer]].blank?

      begin
        tax = 0
        tax += 5 if row[cols[:gst]].present?
        tax += 7 if row[cols[:pst]].present?

        unit_quantity = row[cols[:unit_quantity]]
        # annoying import inconsistency, EA means UQ = 1
        unit_quantity = 1 if (unit_quantity == 'EA')

        article = {
          order_number: row[cols[:order_number]],
          name: row[cols[:name]],
          note: row[cols[:note]],
          manufacturer: row[cols[:manufacturer]],
          # origin: 0,
          unit: row[cols[:unit]],
          unit_quantity: unit_quantity,
          price: row[cols[:price]],
          tax: tax,
          # deposit:
          article_category: 'Grocery'
        }
        status = nil
        next unless article[:order_number].present? && article[:price].to_f != 0
      rescue => error
        puts "error : #{error}"
        next
      end
      yield status, article, row_index
    end
  end
end
