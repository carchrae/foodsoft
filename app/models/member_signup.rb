# encoding: utf-8
#
# One membership application, pasted from the sign-up spreadsheet, turned into
# a user account plus their ordergroup.
#
# Nothing here runs by itself. {MemberSignup.parse} only reads text;
# Admin::MemberSignupsController always shows the parsed values for an admin to
# check and correct before {#create!} is called.
class MemberSignup
  include ActiveModel::Model

  EMAIL_FORMAT = /\A([^@\s]+)@((?:[-a-z0-9]+\.)+[a-z]{2,})\z/i
  GROUP_NAME_LIMIT = 25       # Group validates name length 1..25
  DESCRIPTION_LIMIT = 255     # groups.description is a string column
  WELCOME_TOKEN_DAYS = 14     # longer than a password reset: people are slow to read welcome mail

  ATTRIBUTES = [:first_name, :last_name, :email, :phone, :address,
                :household_size, :group_name, :description, :referral]
  attr_accessor(*ATTRIBUTES)

  # Whether the admin ticked this row on the preview screen.
  attr_accessor :selected
  # The raw cells this signup was parsed from, shown on the preview screen.
  attr_accessor :source
  # Filled in by #create!
  attr_reader :user, :ordergroup, :welcome_email_error

  validates :first_name, presence: true, length: {in: 2..50}
  validates :last_name, length: {maximum: 50}
  validates :email, presence: true, format: {with: EMAIL_FORMAT}
  validates :group_name, presence: true, length: {in: 1..GROUP_NAME_LIMIT}
  validates :description, length: {maximum: DESCRIPTION_LIMIT}
  validates :referral, length: {maximum: 1000}
  validate :email_is_free
  validate :group_name_is_free

  def initialize(attributes = {})
    @selected = true
    @source = []
    super
  end

  def full_name
    [first_name, last_name].reject(&:blank?).join(' ')
  end

  def normalized_email
    email.to_s.strip.downcase
  end

  # A one-line summary for the preview screen's row heading.
  def summary
    [full_name.presence, normalized_email.presence].compact.join(' – ')
  end

  # Creates the user, their ordergroup and the membership linking the two.
  # Raises ActiveRecord::RecordInvalid if anything is rejected, leaving nothing
  # behind. Does not send the welcome email; call #send_welcome_email! for that.
  def create!
    ActiveRecord::Base.transaction do
      @user = build_user
      @user.save!
      @ordergroup = build_ordergroup
      @ordergroup.save!
      Membership.create!(user: @user, group: @ordergroup)
    end
    @user
  end

  # Gives the new user a password reset token and emails them a welcome message
  # with a link to choose their own password. Returns false and records the
  # problem in #welcome_email_error when sending fails; the account itself is
  # already created by then, so a mail problem must not undo it.
  def send_welcome_email!
    @user.reset_password_token = @user.new_random_password(16)
    @user.reset_password_expires = Time.now.advance(days: WELCOME_TOKEN_DAYS)
    @user.save!
    I18n.with_locale(@user.locale) do
      Mailer.welcome_new_member(@user, referral).deliver_now
    end
    true
  rescue => error
    @welcome_email_error = error.message
    Rails.logger.error "Could not send welcome email to #{@user.try(:email)}: #{error.message}"
    false
  end

  #### Parsing ################################################################

  # Turns text pasted from the sign-up spreadsheet into MemberSignup objects.
  # Accepts one or many rows, with or without the spreadsheet's header row.
  def self.parse(text)
    rows = split_rows(text)
    return [] if rows.empty?

    mapping = header_mapping(rows.first)
    if mapping
      rows = rows.drop(1)
    end
    rows.map do |row|
      from_row(row, mapping || content_mapping(row))
    end
  end

  # Splits pasted spreadsheet text into rows of cells. Cells are tab separated;
  # a cell containing a tab, a newline or a quote is wrapped in double quotes
  # with inner quotes doubled, which is what both Google Sheets and Excel put on
  # the clipboard. Ruby 2.3's CSV cannot be told to be lenient about stray
  # quotes, so this does the scanning itself.
  def self.split_rows(text)
    text = text.to_s.gsub("\r\n", "\n").tr("\r", "\n")
    rows, row, cell, quoted = [], [], '', false
    i = 0
    while i < text.length
      c = text[i]
      if quoted
        if c == '"'
          if text[i + 1] == '"'
            cell << '"'
            i += 1
          else
            quoted = false
          end
        else
          cell << c
        end
      else
        case c
        when '"' then cell.empty? ? quoted = true : cell << c
        when "\t" then row << cell; cell = ''
        when "\n" then row << cell; rows << row; row, cell = [], ''
        else cell << c
        end
      end
      i += 1
    end
    row << cell
    rows << row
    rows.reject { |r| r.all? { |v| v.to_s.strip.empty? } }
  end

  # Recognises the spreadsheet's header row and maps the columns we need onto
  # their positions. Returns nil when the row is not a header (i.e. it is data).
  # Patterns are tried in this order so that "Email Address" is claimed by
  # :email before :address gets to look at it.
  HEADER_PATTERNS = [
    [:email,          [/e-?mail/i]],
    [:phone,          [/\bphone\b/i, /\bmobile\b/i, /\bcell\b/i]],
    # Before :last_name: the referral question ends "first and last name please",
    # which /\blast\s*name\b/ would happily claim.
    [:referral,       [/who do you know/i, /\brefer(red|ral)\b/i]],
    [:first_name,     [/\bfirst\s*name\b/i, /\bgiven\s*name\b/i]],
    [:last_name,      [/\blast\s*name\b/i, /\bsurname\b/i, /\bfamily\s*name\b/i]],
    [:full_name,      [/\bfull\s*name\b/i, /\byour\s*name\b/i, /\A\s*name\s*\z/i]],
    [:household_size, [/how many people/i, /\bhousehold\b/i, /\bfamily\b/i]],
    [:address,        [/\baddress\b/i]]
  ]

  def self.header_mapping(row)
    # A header row talks about an email column but contains no actual address.
    return nil if row.any? { |c| c.to_s.strip =~ EMAIL_FORMAT }
    return nil unless row.any? { |c| c.to_s =~ /e-?mail/i }

    mapping, taken = {}, []
    HEADER_PATTERNS.each do |field, patterns|
      index = row.each_index.find do |i|
        !taken.include?(i) && patterns.any? { |p| row[i].to_s =~ p }
      end
      next unless index
      mapping[field] = index
      taken << index
    end
    mapping
  end

  # Guesses the columns of a data row pasted without its header, by looking at
  # what the cells contain. The admin corrects anything wrong on the preview
  # screen, so this only has to be right often enough to save typing.
  def self.content_mapping(row)
    mapping = {}
    mapping[:email] = row.each_index.find { |i| row[i].to_s.strip =~ EMAIL_FORMAT }
    mapping[:phone] = row.each_index.find { |i| mapping[:email] != i && phone_like?(row[i]) }
    mapping[:full_name] = row.each_index.find do |i|
      !mapping.values.include?(i) && name_like?(row[i])
    end
    mapping[:household_size] = row.each_index.find do |i|
      !mapping.values.include?(i) && row[i].to_s.strip =~ /\A([1-9]|1\d|20)\z/
    end
    # Free-text answers also contain digits and words, so the address is picked
    # by how much the cell looks like a street address rather than by position.
    scored = row.each_index.reject { |i| mapping.values.include?(i) }
      .map { |i| [i, address_score(row[i])] }
      .select { |_i, score| score >= 3 }
    mapping[:address] = scored.max_by { |i, score| [score, i] }.first if scored.any?
    # Whoever referred them is named further down the form than they are, so of
    # the cells that read like a name the last one left is the best guess.
    mapping[:referral] = row.each_index.select do |i|
      !mapping.values.include?(i) && name_like?(row[i])
    end.last
    mapping.reject { |_k, v| v.nil? }
  end

  def self.phone_like?(value)
    value = value.to_s.strip
    return false unless value =~ /\A\+?[\d(][\d\s().\-]{6,24}\z/
    digits = value.count('0-9')
    digits >= 7 && digits <= 15
  end

  def self.name_like?(value)
    value = value.to_s.strip
    return false if value.empty? || value.length > 60
    words = value.split(/\s+/)
    return false unless (2..4).include?(words.size)
    words.all? { |w| w =~ /\A[[:alpha:]][[:alpha:]'’.\-]*\z/ }
  end

  STREET_WORDS = /\b(road|rd|street|st|avenue|ave|drive|dr|lane|ln|way|crescent|cres|place|pl|court|ct|highway|hwy|trail|terrace|close|box|rr|apt|unit|suite)\b/i
  POSTAL_CODE = /\b([[:alpha:]]\d[[:alpha:]][ -]?\d[[:alpha:]]\d|\d{5}(-\d{4})?)\b/

  # How much a cell looks like a home address, rather than a free-text answer
  # that happens to contain a number. Anything scoring 3 or more is a good bet.
  def self.address_score(value)
    value = value.to_s.strip
    return 0 if value.length < 8 || value.length > 160
    return 0 if phone_like?(value) || value =~ EMAIL_FORMAT
    return 0 unless value =~ /\d/ && value.scan(/[[:alpha:]]{2,}/).size >= 2

    score = 0
    score += 3 if value =~ /\A\d+[[:alpha:]]?\s+[[:alpha:]]/   # starts with a house number
    score += 2 if value =~ POSTAL_CODE
    score += 2 if value =~ STREET_WORDS
    score += 1 if value.include?(',')
    score
  end

  def self.from_row(row, mapping)
    cell = lambda { |field| row[mapping[field]].to_s.strip if mapping[field] }

    first_name, last_name = cell.call(:first_name), cell.call(:last_name)
    if first_name.blank? && cell.call(:full_name).present?
      first_name, last_name = split_name(cell.call(:full_name))
    end

    signup = new(
      first_name: first_name,
      last_name: last_name,
      email: cell.call(:email),
      phone: cell.call(:phone),
      address: cell.call(:address),
      household_size: cell.call(:household_size),
      referral: cell.call(:referral)
    )
    signup.source = row
    signup.group_name = suggested_group_name([first_name, last_name].reject(&:blank?).join(' '))
    signup.description = suggested_description(signup.household_size)
    signup
  end

  # "Mary Jane Van Dam" becomes "Mary" + "Jane Van Dam": the first word is the
  # given name, everything after it the family name.
  def self.split_name(full_name)
    words = full_name.to_s.strip.split(/\s+/)
    [words.first.to_s, words.drop(1).join(' ')]
  end

  # Ordergroups are named after the member. Keeps within the 25 character limit
  # and avoids a name that is already taken.
  def self.suggested_group_name(full_name)
    base = full_name.to_s.strip[0, GROUP_NAME_LIMIT].to_s.strip
    return '' if base.empty?
    return base unless Group.where(name: base).exists?

    (2..99).each do |n|
      candidate = "#{base[0, GROUP_NAME_LIMIT - n.to_s.length - 1].strip} #{n}"
      return candidate unless Group.where(name: candidate).exists?
    end
    base
  end

  def self.suggested_description(household_size)
    return nil if household_size.blank?
    I18n.t('admin.member_signups.household_description', count: household_size.to_i)
  end

  private

  def build_user
    user = User.new(
      first_name: first_name.to_s.strip,
      last_name: last_name.to_s.strip,
      email: normalized_email,
      phone: phone.presence
    )
    password = user.new_random_password(6)
    user.password = password
    user.password_confirmation = password
    user
  end

  def build_ordergroup
    Ordergroup.new(
      name: group_name.to_s.strip,
      description: description.presence,
      contact_person: full_name.presence,
      contact_phone: phone.presence,
      contact_address: address.presence
    )
  end

  def email_is_free
    return if normalized_email.blank?
    return unless User.where('LOWER(users.email) = ?', normalized_email).exists?
    errors.add :email, :taken
  end

  def group_name_is_free
    return if group_name.blank?
    return unless Group.where(name: group_name.to_s.strip).exists?
    errors.add :group_name, :taken
  end
end
