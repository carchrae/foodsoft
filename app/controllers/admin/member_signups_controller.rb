# encoding: utf-8
#
# Creates member accounts from rows pasted out of the sign-up spreadsheet.
#
# Three steps: paste (#new) -> check and correct the parsed values (#preview)
# -> create the accounts and email the new members (#create). Accounts are
# never created without an admin confirming the preview.
class Admin::MemberSignupsController < Admin::BaseController

  def new
    @paste = ''
    @signups = []
  end

  def preview
    @paste = params[:paste].to_s
    @signups = MemberSignup.parse(@paste)
    if @signups.empty?
      flash.now[:alert] = t('.nothing_found')
      render :new
    else
      @signups.each(&:valid?)
      render :preview
    end
  end

  def create
    @paste = params[:paste].to_s
    @signups = signups_from_params
    selected = @signups.select(&:selected)

    if selected.empty?
      flash.now[:alert] = t('.nothing_selected')
      return render :preview
    end
    unless selected.all?(&:valid?)
      flash.now[:alert] = t('.please_fix')
      return render :preview
    end

    @created, @failed = [], []
    selected.each do |signup|
      begin
        signup.create!
        signup.send_welcome_email!
        @created << signup
      rescue => error
        @failed << [signup, error.message]
      end
    end
    render :create
  end

  private

  def signups_from_params
    (params[:signups] || {}).values.map do |attributes|
      signup = MemberSignup.new
      MemberSignup::ATTRIBUTES.each do |attribute|
        signup.send "#{attribute}=", attributes[attribute.to_s]
      end
      signup.selected = attributes['selected'].to_s == '1'
      signup
    end
  end
end
