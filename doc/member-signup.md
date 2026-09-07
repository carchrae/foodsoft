# Setting up a new member

Handover notes for the work done on 2026-09-07.

`/join` is unchanged: it still explains the coop and links to the Google Form.
The form's response spreadsheet stays the intake. What is new is the admin
screen that turns a row of that spreadsheet into a real account.

| Screen | URL |
|---|---|
| Paste rows | `/f/admin/member_signups/new` (Administration → Set up a new member) |
| Check the parsed values | `POST /f/admin/member_signups/preview` |
| Create and email | `POST /f/admin/member_signups` |

## The flow

1. Copy one or more rows out of the sign-up spreadsheet and paste them into the
   text box. Including the header row is fine and gives the best results.
2. The next screen shows what was read from each row in editable fields, with
   the raw pasted row underneath so you can see what came in. Correct anything
   wrong, untick rows you do not want, and press **Create accounts and send
   welcome emails**.
3. For each ticked row this creates a `User`, an `Ordergroup` named after them,
   and the `Membership` joining the two — in one transaction, so a rejected row
   leaves nothing behind. Each new member gets a random password they never see
   and a welcome email with a link to choose their own.

Nothing is ever created without that confirmation step, and a row whose email
address is already in use, or whose name is missing, is refused with the reason
shown on the row.

## How a pasted row is read

`MemberSignup.parse` (`app/models/member_signup.rb`) splits the paste into rows
and cells itself: cells are tab separated and a cell containing a tab, newline
or quote is wrapped in double quotes with inner quotes doubled, which is what
Google Sheets and Excel put on the clipboard. Ruby 2.3's `CSV` cannot be told to
be lenient about stray quotes in free-text answers, hence the hand-written
scanner.

Columns are then matched in one of two ways:

* **With a header row** — patterns are tried in a fixed order so that
  "Email Address" is claimed by the email column before the address column gets
  to look at it, and each column can only be claimed once.
* **Without a header row** — the cells are inspected: the email is the cell that
  parses as an address, the phone the first cell that is only dialling
  characters, the name the first cell of two to four all-letter words, the
  household size the first bare number 1–20. The home address is *scored* rather
  than positional (starts with a house number, contains a postal code, contains
  a street word, contains a comma) because the free-text answers also contain
  digits and words; anything scoring 3 or more wins.

Both paths were checked against a full 17-column row from the current form and
produce the same result. The preview screen exists precisely so the guesses do
not have to be perfect.

The ordergroup is named after the member, cut to the 25 characters `Group`
allows, with " 2", " 3" … appended if that name is taken.

## Welcome email

`Mailer#welcome_new_member` reuses the existing password-reset token mechanism
with a 14 day expiry (people are slow to read welcome mail) and links to
`/f/login/new_password`. If the token has run out by the time they click it, the
mail tells them to use "Forgot password" instead. A mail failure is reported on
the results screen and never undoes the account, which already exists by then.

## Case-insensitive email

Logging in and asking for a password reset used to be case sensitive, because
Postgres compares strings case sensitively and the lookups were plain
`find_by_email` / `find_by_nick`. Now:

* `User.find_by_login` and `User.find_by_email_case_insensitive` compare with
  `LOWER()` and strip surrounding whitespace; `User.authenticate` uses them.
* `User#normalize_email` (a `before_validation`) stores every address stripped
  and downcased, so no two accounts can differ only by case. Existing addresses
  are normalised the next time that user record is saved; until then the
  `LOWER()` lookups already make login work.
* `LoginController#reset_password` and `Invite#email_not_already_registered`
  use the case-insensitive lookup too.

## Files

New:

* `app/models/member_signup.rb`
* `app/controllers/admin/member_signups_controller.rb`
* `app/views/admin/member_signups/{new,preview,create}.html.haml`
* `app/views/mailer/welcome_new_member.text.haml`

Existing files touched (all additive, to keep the port to `custom-rebuild` easy):

* `app/models/user.rb` — `normalize_email`, `find_by_login`,
  `find_by_email_case_insensitive`; `authenticate` now calls `find_by_login`.
* `app/models/invite.rb`, `app/controllers/login_controller.rb` — one lookup each.
* `app/mailers/mailer.rb` — one new method.
* `config/routes.rb` — one `resources` block inside `namespace :admin`.
* `config/navigation.rb` — one menu item.
* `config/locales/en.yml` — `admin.member_signups`, `mailer.welcome_new_member`,
  `navigation.admin.member_signups`, `activemodel.attributes.member_signup`.
