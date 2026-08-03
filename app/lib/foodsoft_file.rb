# Foodsoft-file import
class FoodsoftFile
  # parses a string from a foodsoft-file
  # returns two arrays with articles and outlisted_articles
  # the parsed article is a simple hash
  def self.parse(file, options = {})
    SpreadsheetFile.parse file, options do |row, row_index|
      next if row[2].blank?

      article = { order_number: row[1],
                  name: row[2],
                  note: row[3],
                  manufacturer: row[4],
                  origin: row[5],
                  unit: row[6],
                  price: row[7],
                  tax: row[8],
                  deposit: (row[9].nil? ? '0' : row[9]),
                  unit_quantity: row[10],
                  article_category: row[13] }
      status = row[0] && row[0].strip.downcase == 'x' ? :outlisted : nil
      yield status, article, row_index
    end
  end

  # Horizon distributes price lists with their own column layout; map the
  # lettered spreadsheet columns to article attributes.
  def self.parse_horizon(file, options = {})
    SpreadsheetFile.parse file, options do |row, row_index|
      next if row[2].blank?

      row_to_index = ('a'..'z').zip(0..25).to_h
      map = lambda do |r|
        tax = 0
        tax += 5 if r[row_to_index['n']]
        tax += 7 if r[row_to_index['m']]

        unit_quantity = r[row_to_index['h']]
        # annoying import inconsistency, EA means UQ = 1
        unit_quantity = 1 if unit_quantity == 'EA'

        {
          order_number: r[row_to_index['b']],
          name: r[row_to_index['d']],
          note: r[row_to_index['g']],
          manufacturer: r[row_to_index['c']],
          unit: r[row_to_index['i']],
          unit_quantity: unit_quantity,
          price: r[row_to_index['j']],
          tax: tax,
          article_category: 'Grocery'
        }
      end
      begin
        article = map.call(row)
        status = nil
        next unless article[:order_number].present? && article[:price].to_f != 0
      rescue StandardError => e
        Rails.logger.error("horizon parse error on row #{row_index}: #{e}")
        next
      end
      yield status, article, row_index
    end
  end
end
