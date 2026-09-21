# Foodsoft-file import
class FoodsoftFile

  # parses a string from a foodsoft-file
  # returns two arrays with articles and outlisted_articles
  # the parsed article is a simple hash
  #
  # When the spreadsheet turns out to be a supplier catalogue with a header row
  # we recognise (see {horizon_columns}), the columns are taken from that header
  # instead of from the fixed foodsoft positions. The block is then called with
  # +:horizon+ as a fourth argument; blocks that only take three arguments are
  # unaffected.
  def self.parse(file, options = {})
    cols = nil

    SpreadsheetFile.parse file, options do |row, row_index|
      if (detected = horizon_columns(row))
        cols = detected
        next
      end

      if cols
        article = horizon_article(row, cols)
        yield nil, article, row_index, :horizon if article
        next
      end

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
      yield status, article, row_index, :foodsoft
    end
  end

  # Header labels of the Horizon/Purity Life catalogue, normalised with
  # {normalize_header}, mapped to the article attribute they hold.
  #
  # The catalogue layout changes every few months - columns get inserted,
  # renamed or moved - so the columns are located by label instead of by a
  # fixed position. Labels we do not know about are simply ignored.
  HORIZON_HEADER_COLUMNS = {
    'code' => :order_number,
    'item code' => :order_number,
    'product code' => :order_number,
    'brand' => :manufacturer,
    'brand name' => :manufacturer,
    'sku' => :name,
    'sku description' => :name,
    'catalogue description' => :note,
    'catalog description' => :note,
    'case pack' => :unit_quantity,
    'pack' => :unit_quantity,
    'unit size' => :unit,
    'size' => :unit,
    'unit price' => :price,
    'case price' => :case_price,
    'upc' => :upc,
    'bulk' => :bulk,
    'p pst' => :pst,
    'p bc pst' => :pst,
    'pst' => :pst,
    't gst' => :gst,
    'gst' => :gst
  }.freeze

  # a row is considered a catalogue header row when it carries at least this
  # many of the labels above
  HORIZON_HEADER_MIN_MATCHES = 4

  # columns that describe an article rather than a flag; a row needs a couple
  # of these before we believe it is a catalogue header row at all
  HORIZON_ARTICLE_COLUMNS = [:order_number, :name, :note, :unit, :unit_quantity, :price].freeze

  # without these we cannot import anything, so say so instead of guessing
  HORIZON_REQUIRED_COLUMNS = [:order_number, :name, :price].freeze

  # Used when a catalogue has no header row we can read; this is the layout
  # used up to ~2024 (data of the 'Bulk' and 'Catalogue Description' columns
  # sits one column right of their header labels).
  HORIZON_LEGACY_COLUMNS = {
    order_number: 1,  # B
    manufacturer: 2,  # C
    name: 3,          # D
    note: 6,          # G
    unit_quantity: 7, # H
    unit: 8,          # I
    price: 9,         # J
    pst: 12,          # M
    gst: 13           # N
  }.freeze

  def self.parseHorizon(file, options = {})
    cols = nil

    SpreadsheetFile.parse file, options do |row, row_index|
      if (detected = horizon_columns(row))
        cols = detected
        next
      end

      cols ||= HORIZON_LEGACY_COLUMNS
      article = horizon_article(row, cols)
      yield nil, article, row_index, :horizon if article
    end
  end

  # Does this spreadsheet look like a supplier catalogue we have a column
  # mapping for? Only reads the first rows, so it can be used to pick a parser.
  def self.horizon_file?(file, options = {})
    # SpreadsheetFile.parse consumes :filename and adds :csv_options, so keep
    # the caller's options intact for the real parse run
    options = options.dup
    catch(:horizon_file) do
      SpreadsheetFile.parse file, options do |row, row_index|
        throw :horizon_file, true if horizon_columns(row)
        throw :horizon_file, false if row_index > 50
      end
      false
    end
  rescue => error
    Rails.logger.warn "could not sniff spreadsheet format: #{error.message}" if defined?(Rails)
    false
  end

  # Maps a header row to column indexes, or nil when the row is not a header
  # row. Raises when it clearly is a catalogue header but misses a column we
  # need - better a visible error than an import with shifted columns.
  def self.horizon_columns(row)
    cols = {}
    row.each_with_index do |cell, index|
      key = HORIZON_HEADER_COLUMNS[normalize_header(cell)]
      # first occurrence wins, so a repeated label cannot move a column
      cols[key] = index if key && !cols.key?(key)
    end
    return nil if cols.size < HORIZON_HEADER_MIN_MATCHES
    return nil if (cols.keys & HORIZON_ARTICLE_COLUMNS).size < 2

    missing = HORIZON_REQUIRED_COLUMNS.reject { |key| cols.key?(key) }
    if missing.any?
      raise "catalogue header row is missing the #{missing.join(', ')} column(s); " \
            "found: #{row.map { |cell| cell.to_s.strip }.reject(&:empty?).join(', ')}"
    end

    apply_horizon_header_offset(cols)
  end

  # In the older catalogue the 'Bulk' and 'Catalogue Description' labels sit one
  # column left of their data because of merged header cells. That layout is
  # recognisable by 'Bulk' coming before 'Catalogue Description'; newer
  # catalogues have 'Bulk' somewhere to the right of it.
  def self.apply_horizon_header_offset(cols)
    if cols[:bulk] && cols[:note] && cols[:bulk] < cols[:note]
      cols = cols.dup
      cols[:bulk] += 1
      cols[:note] += 1
    end
    cols
  end

  # 'P (BC PST)' -> 'p bc pst', 'Gluten- Free' -> 'gluten free'
  def self.normalize_header(cell)
    cell.to_s.gsub(/[^a-z0-9]+/i, ' ').strip.squeeze(' ').downcase
  end

  def self.horizon_article(row, cols)
    order_number = horizon_value(row, cols, :order_number)
    price = horizon_value(row, cols, :price)
    # section titles, empty and discontinued rows
    return nil if order_number.blank? || price.to_f == 0

    tax = 0
    tax += 5 if horizon_value(row, cols, :gst).present?
    tax += 7 if horizon_value(row, cols, :pst).present?

    unit_quantity = horizon_value(row, cols, :unit_quantity)
    # annoying import inconsistency, EA means UQ = 1
    unit_quantity = 1 if unit_quantity.to_s.strip.casecmp('EA').zero?

    {
      order_number: order_number,
      name: horizon_value(row, cols, :name),
      note: horizon_value(row, cols, :note),
      manufacturer: horizon_value(row, cols, :manufacturer),
      # origin: 0,
      unit: horizon_value(row, cols, :unit),
      unit_quantity: unit_quantity,
      price: price,
      tax: tax,
      # deposit:
      article_category: 'Grocery'
    }
  end

  def self.horizon_value(row, cols, key)
    index = cols[key]
    return nil unless index

    value = row[index]
    # an order number read as a number would come out as "25408.0"
    value = value.to_i.to_s if key == :order_number && value.is_a?(Numeric) && value.to_i == value
    value
  end
end
