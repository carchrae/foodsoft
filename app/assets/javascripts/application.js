//= require jquery
//= require jquery_ujs
//= require select2-full
//= require twitter/bootstrap
//= require jquery.tokeninput
//= require bootstrap-datepicker/core
//= require bootstrap-datepicker/locales/bootstrap-datepicker.de
//= require bootstrap-datepicker/locales/bootstrap-datepicker.es
//= require bootstrap-datepicker/locales/bootstrap-datepicker.nl
//= require bootstrap-datepicker/locales/bootstrap-datepicker.fr
//= require list
//= require list.unlist
//= require list.delay
//= require list.reset
//= require i18n
//= require i18n/translations
//= require_self
//= require ordering
//= require stupidtable
//= require touchclick
//= require delta_input
//= require recurring_select

$.fn.select2.defaults.set('theme', 'bootstrap');

// Load following statements, when DOM is ready
$(function() {

    // Show/Hide a specific DOM element
    $(document).on('click', 'a[data-toggle-this]', function() {
        $($(this).data('toggle-this')).toggle();
        return false;
    });

    // Remove this item from DOM
    $(document).on('click', 'a[data-remove-this]', function() {
        $($(this).data('remove-this')).remove();
        return false;
    });

    // Check/Uncheck a single checkbox
    $(document).on('click', '[data-check-this]', function() {
        var checkbox = $($(this).data('check-this'));
        checkbox.attr('checked', !checkbox.is(':checked'));
        highlightRow(checkbox);
        return false;
    });

    // Check/Uncheck all checkboxes for a specific form
    $(document).on('click', 'input[data-check-all]', function() {
        var status = $(this).is(':checked');
        var context = $(this).data('check-all');
        var elms = $('input[type="checkbox"]', context);
        for(i=elms.length-1; i>=0; --i) { // performance can be an issue here, so use native loop
          var elm = elms[i];
          elm.checked = status;
          highlightRow($(elm));
        }
    });

    // Submit form when changing a select menu.
    $(document).on('change', 'form[data-submit-onchange] select:not([data-ignore-onchange])', function() {
        var confirmMessage = $(this).children(':selected').data('confirm');
        if (confirmMessage) {
            if (confirm(confirmMessage)) {
                $(this).parents('form').submit();
            }
        } else {
            $(this).parents('form').submit();
        }
        return false;
    });

    // Submit form when clicking on checkbox
    $(document).on('click', 'form[data-submit-onchange] input[type=checkbox]:not([data-ignore-onchange])', function() {
        $(this).parents('form').submit();
    });

    // Submit form when changing text of an input field.
    // Submission will be done after 500ms of not typed, unless data-submit-onchange=changed,
    // in which case it happens when the input box loses its focus ('changed' event).
    // (changeDate is for bootstrap-datepicker)
    $(document).on('changed keyup focusin changeDate', 'form[data-submit-onchange] input[type=text]:not([data-ignore-onchange])', function(e) {
        var input = $(this);
        // when form has data-submit-onchange=changed, don't do updates while typing
        if (e.type!='changed' && e.type!='changeDate' && input.parents('form[data-submit-onchange=changed]').length>0) {
          return true;
        }
        // remember old value when it's getting the focus (unless we already have a change pending)
        if (e.type=='focusin') {
          if (!input.data('submit-timeout-id')) input.data('old-value', input.val());
          return true;
        }
        // trigger timeout to submit form when value was changed
        clearTimeout(input.data('submit-timeout-id'));
        input.data('submit-timeout-id', setTimeout(function() {
          if (input.val() != input.data('old-value')) input.parents('form').submit();
          input.removeData('submit-timeout-id');
          input.removeData('old-value');
        }, 500));
    });

    $('[data-redirect-to]').bind('change', function() {
        var newLocation = $(this).children(':selected').val();
        if (newLocation != "") {
            document.location.href = newLocation;
        }
    });

    // Remote paginations
    $(document).on('click', 'div.pagination[data-remote] a', function() {
        $.getScript($(this).attr('href'));
        return false;
    });

    // Disable action of disabled buttons
    $(document).on('click', 'a.disabled', function() {
        return false;
    });

    // Handle ajax errors
    //     render json: {error: "can't except this!"}, status: :unprocessable_entity
    $(document).ajaxError(function(ev, xhr, settings, exception) {
        try {
            msg = xhr.responseJSON.error;
        } catch(err) {
            msg = I18n.t('errors.general');
        }
        alert(msg);
    });

    // The autocomplete attribute is used for both autocompletion and storing
    // for passwords, it's nice to store it when editing one's own profile,
    // but never autocomplete. Only implemented for passwords.
    $('input[type="password"][autocomplete="off"][data-store="on"]').each(function() {
      $(this).on('change', function() {
        $(this).removeAttr('autocomplete');
      });
    });

    // Use bootstrap datepicker for dateinput
    $('.datepicker').datepicker({format: 'yyyy-mm-dd', language: I18n.locale, todayHighlight: true});

    // bootstrap tooltips (for price)
    //   Extra options don't work when using selector, so override defaults
    //   https://github.com/twbs/bootstrap/issues/3875 . These can still be
    //   overridden per tooltip using data-placement attributes and the like.
    $.extend($.fn.tooltip.defaults, {
      html: true,
      animation: false,
      placement: 'left',
      container: 'body'
    });
    $(document).tooltip({
      selector: '[data-toggle~="tooltip"]',
    });

    // See stupidtable.js for initialization of local table sorting
});

// retrigger last local table sorting
function updateSort(table) {
  $('.sorting-asc, .sorting-desc', table).toggleClass('.sorting-asc .sorting-desc')
    .removeData('sort-dir').trigger('click'); // CAUTION: removing data field of plugin
}

// gives the row an yellow background
function highlightRow(checkbox) {
    var row = checkbox.closest('tr');
    if (checkbox.is(':checked')) {
        row.addClass('selected');
    } else {
        row.removeClass('selected');
    }
}

// Use with auto_complete to set a unique id,
// e.g. when the user selects a (may not unique) name
// There must be a hidden field with the id 'hidden_field'
function setHiddenId(text, li) {
  $('hidden_id').value = li.id;
}


function debounce(wait, func) {
    var timeout;
    return function() {
        var context = this, args = arguments;
        if (wait) {
            clearTimeout(timeout);
            timeout = setTimeout(function () {
                timeout = null;
                func.apply(context, args);
            }, wait);
        }else{
            func.apply(context, args);
        }
    };
}

var updateReceived = debounce(1000,
    function (id, multiplier){
        var amount = $('#a_'+id);
        var received = $('#r_'+id);
        received.val(amount.val() / multiplier);
        received.submit();
    }
);


function changed(changed){
    if (changed===true){
        this._changed=true;
    } else
    if (changed===false){
        this._changed=false;
    }
    return this._changed || false;
}


// Quick and simple export target #table_id into a csv
function download_table_as_csv(table_id) {
    // Select rows from table_id
    var rows = document.querySelectorAll('table#' + table_id + ' tr');
    // Construct csv
    var csv = [];
    for (var i = 0; i < rows.length; i++) {
        var row = [], cols = rows[i].querySelectorAll('td, th');
        for (var j = 0; j < cols.length; j++) {
            // Clean innertext to remove multiple spaces and jumpline (break csv)
            var data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, '').replace(/(\s\s)/gm, ' ')
            // Escape double-quote with double-double-quote (see https://stackoverflow.com/questions/17808511/properly-escape-a-double-quote-in-csv)
            data = data.replace(/"/g, '""');
            // Push escaped string
            row.push('"' + data + '"');
        }
        csv.push(row.join(';'));
    }
    var csv_string = csv.join('\n');
    // Download it
    var filename = 'export_' + table_id + '_' + new Date().toLocaleDateString() + '.csv';
    var link = document.createElement('a');
    link.style.display = 'none';
    link.setAttribute('target', '_blank');
    link.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv_string));
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}