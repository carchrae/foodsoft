require_relative '../spec_helper'

describe FoodsoftFile do
  # the catalogue layout in use since 2025
  let(:header) do
    ['UPC', 'Code', 'Brand Name', 'SKU Description', 'Catalogue Description',
     'Case Pack', 'Unit Size', 'Unit Price', 'Case Price', 'P (PST)', 'T (GST)',
     'Enviro', 'Bulk', 'Repack', 'Dry Chill Frozen', 'Organic', 'Canadian',
     'Fair Trade', 'Gluten- Free', 'Plant-Based', 'Vegan', 'PUR', 'Cs Wt (lbs)']
  end

  let(:row) do
    ['810003511065', '25408', 'Once Upon A Farm', 'OUAF SMTHI BERRY 8/105ML*',
     'Dairy-Free Smoothie, Berry Berry, Organic', '8', '105ml', '3.6', '28.8',
     nil, nil, nil, nil, nil, 'R', '*', nil, nil, nil, 'PB', 'V', 'KD', '3.4']
  end

  describe 'catalogue columns' do
    it 'finds the columns by header label' do
      cols = FoodsoftFile.horizon_columns(header)
      expect(cols[:order_number]).to eq 1
      expect(cols[:name]).to eq 3
      expect(cols[:note]).to eq 4
      expect(cols[:unit_quantity]).to eq 5
      expect(cols[:unit]).to eq 6
      expect(cols[:price]).to eq 7
    end

    it 'is not confused by inserted, moved or renamed columns' do
      moved = header.dup
      moved.insert(17, 'Non-GMO')       # inserted in the middle
      moved.push('SRM')                 # appended
      moved[9] = 'P (BC PST)'           # renamed
      cols = FoodsoftFile.horizon_columns(moved)

      expect(cols[:name]).to eq 3
      expect(cols[:price]).to eq 7
      expect(cols[:pst]).to eq 9
    end

    it 'shifts the merged columns of the pre-2025 layout' do
      legacy = ['UPC', 'Code', 'Brand Name', 'SKU Description', 'Bulk',
                'Catalogue Description', nil, 'Case Pack', 'Unit Size',
                'Unit Price', 'Case Price', 'BB Date Guarantee', 'P (BC PST)',
                'T (GST)', 'Enviro', 'Pur', 'Storage', 'Cs Wt (lbs)']
      cols = FoodsoftFile.horizon_columns(legacy)

      # labels sit one column left of their data for Bulk and the description
      expect(cols[:note]).to eq 6
      expect(cols[:name]).to eq 3
      expect(cols[:unit_quantity]).to eq 7
      expect(cols[:price]).to eq 9
    end

    it 'ignores rows that are not a header row' do
      expect(FoodsoftFile.horizon_columns(row)).to be_nil
      expect(FoodsoftFile.horizon_columns(['Chill'])).to be_nil
      expect(FoodsoftFile.horizon_columns([])).to be_nil
    end

    it 'complains instead of guessing when a needed column is gone' do
      expect { FoodsoftFile.horizon_columns(header - ['Unit Price']) }
        .to raise_error(/unit price|price/i)
    end
  end

  describe 'catalogue rows' do
    let(:cols) { FoodsoftFile.horizon_columns(header) }

    it 'reads an article' do
      article = FoodsoftFile.horizon_article(row, cols)
      expect(article[:order_number]).to eq '25408'
      expect(article[:name]).to eq 'OUAF SMTHI BERRY 8/105ML*'
      expect(article[:note]).to eq 'Dairy-Free Smoothie, Berry Berry, Organic'
      expect(article[:manufacturer]).to eq 'Once Upon A Farm'
      expect(article[:unit]).to eq '105ml'
      expect(article[:unit_quantity]).to eq '8'
      expect(article[:price]).to eq '3.6'
      expect(article[:tax]).to eq 0
    end

    it 'adds up the tax columns' do
      taxed = row.dup
      taxed[9], taxed[10] = 'P', 'T'
      expect(FoodsoftFile.horizon_article(taxed, cols)[:tax]).to eq 12
    end

    it 'treats a case pack of EA as one' do
      each = row.dup
      each[5] = 'EA'
      expect(FoodsoftFile.horizon_article(each, cols)[:unit_quantity]).to eq 1
    end

    it 'skips section titles and rows without a price' do
      expect(FoodsoftFile.horizon_article(['Chill'], cols)).to be_nil

      no_price = row.dup
      no_price[7] = nil
      expect(FoodsoftFile.horizon_article(no_price, cols)).to be_nil
    end

    it 'keeps a numeric order number readable' do
      numeric = row.dup
      numeric[1] = 25408.0
      expect(FoodsoftFile.horizon_article(numeric, cols)[:order_number]).to eq '25408'
    end
  end
end
