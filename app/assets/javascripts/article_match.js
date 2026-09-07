// Article matching shared by the modern swap page and the copy-order page:
// name similarity, unit parsing and conversion, case maths, and the red-to-green
// tint for a score. Plain ES5, exposed as window.FoodsoftArticleMatch.
//
// Similarity: the product words decide (front to back, the first word weighs
// 1, the second ½, the third ¼…), pack/size specs and character bigrams only
// nudge, a different first word caps the score, and the origin is a small
// tiebreaker. Supplier and manufacturer are ignored on purpose.
(function () {
  'use strict';

  // ---- text similarity -------------------------------------------------------------

  var UNAVAILABLE_RE = /unavailable!?/ig;

  function isUnavailableName(name) { return /unavailable/i.test(name || ''); }

  // "STRAWBERRY CLAMSHELL FCY 8x1# UNAVAILABLE!" -> "strawberry clamshell fcy 8x1#"
  function cleanName(name) {
    return (name || '').toLowerCase().replace(UNAVAILABLE_RE, ' ').replace(/[^a-z0-9#%.\/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function tokens(s) { return s ? s.split(' ').filter(function (t) { return t.length; }) : []; }

  function bigrams(s) {
    var out = {}, t = s.replace(/ /g, '');
    for (var i = 0; i < t.length - 1; i++) out[t.substr(i, 2)] = (out[t.substr(i, 2)] || 0) + 1;
    return out;
  }

  // Sørensen–Dice on two bags of things ({item: count})
  function dice(a, b) {
    var na = 0, nb = 0, both = 0, k;
    for (k in a) na += a[k];
    for (k in b) nb += b[k];
    if (!na && !nb) return 1;
    if (!na || !nb) return 0;
    for (k in a) if (b[k]) both += Math.min(a[k], b[k]);
    return 2 * both / (na + nb);
  }

  function bag(list) {
    var out = {};
    list.forEach(function (t) { out[t] = (out[t] || 0) + 1; });
    return out;
  }

  // grade / quality codes that say nothing about what the product is
  var GRADE_RE = /^(fcy|xfcy|x-fcy|fancy|ch|choice|hh|gh|fld|field|v\/f|org|organic|cert|conv|repack|bulk|-)$/;
  // pack sizes, counts and size codes: "11#", "22/25#", "12x3#", "60ct", "l/xl", "med"
  var SPEC_RE = /(\d|#)|^(s|m|l|xl|xxl|xs|sm|med|lrg|jbo|jumbo|s\/m|m\/l|l\/xl|xl\/xxl)$/;

  // split a cleaned name into product words and pack/size specs
  function nameParts(name) {
    var words = [], specs = [];
    tokens(cleanName(name)).forEach(function (t) {
      if (GRADE_RE.test(t)) return;
      (SPEC_RE.test(t) ? specs : words).push(SPEC_RE.test(t) ? t : stem(t));
    });
    return { words: words, specs: specs };
  }

  // Product words compared front to back: the first word weighs 1, the second ½,
  // the third ¼… Words in the common prefix count fully ("APPLES GALA" in both),
  // a later word found somewhere in the other name counts half ("BAGGED"), so
  // the variety always beats the packaging.
  function wordWeight(i) { return Math.pow(0.5, i); }
  function weightedWordDice(a, b) {
    if (!a.length && !b.length) return 1;
    if (!a.length || !b.length) return 0;
    var prefix = 0;
    while (prefix < a.length && prefix < b.length && sameWord(a[prefix], b[prefix])) prefix++;
    function total(list) { var t = 0, i; for (i = 0; i < list.length; i++) t += wordWeight(i); return t; }
    function credit(list, other) {
      var c = 0, i, j, found;
      for (i = 0; i < list.length; i++) {
        if (i < prefix) { c += wordWeight(i); continue; }
        found = false;
        for (j = prefix; j < other.length && !found; j++) found = sameWord(list[i], other[j]);
        if (found) c += wordWeight(i) * 0.5;
      }
      return c;
    }
    return (credit(a, b) + credit(b, a)) / (total(a) + total(b));
  }

  // 0..1: the product words decide; pack/size specs and character bigrams of
  // the words (typos, rewordings) only nudge the result up to 15%
  function nameSimilarity(a, b) {
    var ca = cleanName(a), cb = cleanName(b);
    if (ca === cb) return 1;
    var pa = nameParts(a), pb = nameParts(b);
    var words = weightedWordDice(pa.words, pb.words);
    var specs = (pa.specs.length || pb.specs.length) ? dice(bag(pa.specs), bag(pb.specs)) : 1;
    var chars = dice(bigrams(pa.words.join(' ')), bigrams(pb.words.join(' ')));
    var score = words * (0.85 + 0.075 * specs + 0.075 * chars);
    // a different product word ("YAMS BAGGED 12x3#" vs "APPLES ... BAGGED 12x3#") can never score well
    return sameProduct(a, b) ? score : score * 0.4;
  }

  // 0..1; unknown on either side counts as a half match
  function originSimilarity(a, b) {
    var ca = cleanName(a), cb = cleanName(b);
    if (!ca || !cb) return 0.5;
    if (ca === cb) return 1;
    return dice(bag(tokens(ca.replace(/\//g, ' '))), bag(tokens(cb.replace(/\//g, ' '))));
  }

  // "1lb", "1 LB" and "LB" are the same unit for our purposes (see OrdersHelper#swap_unit_key)
  function unitKey(unit) {
    return (unit || '').toLowerCase().replace(/\s+/g, '').replace(/^1(?=[a-z#])/, '');
  }

  function firstWord(name) { return tokens(cleanName(name))[0] || ''; }

  // "3LB" -> {amount: 3, base: 'lb'}, "500ml" -> {amount: 500, base: 'ml'}, "2kg" -> {amount: 2000, base: 'g'}
  var BASES = { lb: 'lb', lbs: 'lb', '#': 'lb', pound: 'lb', pounds: 'lb', g: 'g', gr: 'g', gram: 'g', grams: 'g', kg: 'g', kgs: 'g',
                ml: 'ml', l: 'ml', ltr: 'ml', litre: 'ml', liter: 'ml', oz: 'oz', ozs: 'oz', ct: 'ct', count: 'ct', ea: 'ct', each: 'ct', pc: 'ct', pcs: 'ct' };
  var KILO = { kg: 1000, kgs: 1000, l: 1000, ltr: 1000, litre: 1000, liter: 1000 };
  function parseUnit(unit) {
    var m = /^\s*(\d*\.?\d+)?\s*([a-z#]+)\s*$/i.exec(unit || '');
    if (!m) return null;
    var name = m[2].toLowerCase(), amount = m[1] ? parseFloat(m[1]) : 1;
    return { amount: amount * (KILO[name] || 1), base: BASES[name] || name };
  }

  // How the demand (wanted + extra) fills cases of the given size: the same maths
  // as OrderArticle#calculate_units_to_order and #missing_units
  function caseFill(quantity, tolerance, size) {
    if (!size || size < 1) return { units: quantity, missing: 0 };
    var units = Math.floor(quantity / size), rest = quantity % size;
    if (rest > 0 && rest + tolerance >= size) units += 1;
    var missing = size - (rest + tolerance);
    if (missing < 0 || missing === size) missing = 0;
    return { units: units, missing: missing };
  }

  // How many "to" units make one "from" unit when both share a base, any real
  // number (.125 LB -> LB is 0.125, 3LB -> LB is 3); null across bases. Used to
  // compare prices for the same amount.
  function unitRatio(fromUnit, toUnit) {
    if (unitKey(fromUnit) === unitKey(toUnit)) return 1;
    var a = parseUnit(fromUnit), b = parseUnit(toUnit);
    if (!a || !b || a.base !== b.base || !b.amount) return null;
    return a.amount / b.amount;
  }

  // Whole number of "to" units that make one "from" unit (3LB -> LB is 3), 1 for
  // the same unit, null when amounts cannot be converted (LB -> 3LB, LB -> CT)
  function conversionFactor(fromUnit, toUnit) {
    var f = unitRatio(fromUnit, toUnit);
    if (f == null || f < 1 || Math.abs(f - Math.round(f)) > 1e-6) return null;
    return Math.round(f);
  }

  // "8", "0.125", "1/8" -> number, null when not a positive number
  function parseFactor(text) {
    var t = (text || '').trim().replace(',', '.');
    if (!t) return null;
    var m = /^(\d*\.?\d+)\s*\/\s*(\d*\.?\d+)$/.exec(t), v;
    if (m) v = parseFloat(m[1]) / parseFloat(m[2]); else if (/^\d*\.?\d+$/.test(t)) v = parseFloat(t);
    return (v > 0 && isFinite(v)) ? v : null;
  }
  function scaleAmount(n, f) { return Math.round(n * f); }

  // the candidate's price for the same amount as one of the current article
  function equivalentPrice(oa, a) {
    var ratio = unitRatio(oa.unit, a.unit);
    return ratio == null ? a.price : a.price * ratio;
  }

  // "apples", "apple"; "strawberries", "strawberry"; "tomatoes", "tomato" are the same word
  function stem(w) { return w.replace(/ies$/, 'y').replace(/(es|s)$/, ''); }
  function sameWord(a, b) {
    if (a === b) return true;
    var sa = stem(a), sb = stem(b);
    if (sa === sb) return true;
    // "tomato" / "tomatoe", "grape" / "grap": one is a prefix of the other
    var shorter = sa.length < sb.length ? sa : sb, longer = shorter === sa ? sb : sa;
    return shorter.length >= 4 && longer.indexOf(shorter) === 0 && longer.length - shorter.length <= 2;
  }
  function sameProduct(a, b) { return sameWord(firstWord(a), firstWord(b)); }

  // 0..1 combined score: the name decides, the origin only nudges it (a
  // different origin costs at most 8% of the name score)
  function similarity(from, to) {
    return nameSimilarity(from.name, to.name) * (0.92 + 0.08 * originSimilarity(from.origin, to.origin));
  }

  // red at 0.3 and below, amber around 0.6, green at 0.9 and above
  function hue(score) {
    var t = Math.max(0, Math.min(1, (score - 0.3) / 0.6));
    return Math.round(120 * t);
  }

  function tint(score) { return 'hsl(' + hue(score) + ', 70%, 88%)'; }
  function ink(score) { return 'hsl(' + hue(score) + ', 60%, 28%)'; }

  window.FoodsoftArticleMatch = {
    UNAVAILABLE_RE: UNAVAILABLE_RE,
    isUnavailableName: isUnavailableName,
    cleanName: cleanName,
    firstWord: firstWord,
    stem: stem,
    sameWord: sameWord,
    sameProduct: sameProduct,
    nameSimilarity: nameSimilarity,
    originSimilarity: originSimilarity,
    similarity: similarity,
    unitKey: unitKey,
    parseUnit: parseUnit,
    unitRatio: unitRatio,
    conversionFactor: conversionFactor,
    equivalentPrice: equivalentPrice,
    parseFactor: parseFactor,
    scaleAmount: scaleAmount,
    caseFill: caseFill,
    hue: hue,
    tint: tint,
    ink: ink
  };
})();
