/* SpeedReader — the RSVP engine: tokenizing, sentence detection, focal-letter
 * (ORP) placement and per-word timing. Pure logic, no DOM. */
(function () {
  'use strict';

  var NS = (self.SpeedReader = self.SpeedReader || {});

  /* Words that end in a period without ending a sentence. */
  var ABBREV = {};
  ('mr mrs ms mx dr prof rev hon sr jr st mt ft vs etc al fig figs no nos vol vols ' +
   'ch chap pp ed eds est approx dept univ inc ltd co corp govt assn bros dist ' +
   'jan feb mar apr jun jul aug sep sept oct nov dec mon tue tues wed thu thurs fri sat sun ' +
   'a.m p.m e.g i.e cf ca viz esp ibid op min max sec secs hrs kg km cm mm lb oz ' +
   'u.s u.k e.u ph.d m.d b.a m.a d.c n.b p.s').split(' ').forEach(function (w) { ABBREV[w] = true; });

  var MAX_WORD_LEN = 13;   // longer words get broken into chunks, like Reedy does
  var CHUNK_LEN = 10;

  var TERMINATOR = /([.!?…]+)["'”’»)\]」]*$/;
  var LEADING_JUNK = /^[^\p{L}\p{N}]+/u;
  var TRAILING_JUNK = /[^\p{L}\p{N}]+$/u;

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  /* Does `word` terminate a sentence? `next` is the following word, used to
   * disambiguate the cases a period alone can't settle. */
  function isSentenceEnd(word, next, firstInBlock) {
    var match = TERMINATOR.exec(word);
    if (!match) return false;

    var punct = match[1];
    var core = word.slice(0, match.index).replace(LEADING_JUNK, '').toLowerCase();

    if (!/[!?]/.test(punct)) {
      if (!core) return false;
      if (core.length === 1 && /\p{L}/u.test(core)) return false;  // an initial: "J."
      if (ABBREV[core]) return false;
      // "1." opening a line is a list marker; "…in 2019." is a real full stop.
      if (punct === '.' && firstInBlock && /^\d{1,3}$/.test(core)) return false;
    }

    if (!next) return true;

    var first = next.charAt(0);
    if (/[\p{Lu}\p{N}"'“‘(\[]/u.test(first)) return true;
    if (!/\p{L}/u.test(first)) return true;
    if (!/\p{Ll}/u.test(first)) return true;   // scripts without case, e.g. CJK
    return false;                              // "... and then" — same sentence
  }

  /* The optimal recognition point: which letter gets held at the pivot. */
  function focusIndex(word) {
    var lead = (LEADING_JUNK.exec(word) || [''])[0].length;
    var core = word.slice(lead).replace(TRAILING_JUNK, '');
    var n = core.length;
    var offset;

    if (n <= 1) offset = 0;
    else if (n <= 5) offset = 1;
    else if (n <= 9) offset = 2;
    else if (n <= 13) offset = 3;
    else offset = 4;

    return clamp(lead + offset, 0, Math.max(0, word.length - 1));
  }

  function splitLongWord(word) {
    if (word.length <= MAX_WORD_LEN) return [word];
    var parts = [];
    var i = 0;
    while (word.length - i > MAX_WORD_LEN) {
      parts.push(word.slice(i, i + CHUNK_LEN) + '-');
      i += CHUNK_LEN;
    }
    parts.push(word.slice(i));
    return parts;
  }

  /* Relative display duration. 1 = one "beat" at the current WPM. */
  function weightFor(token) {
    var text = token.text;
    var weight = 1;

    if (token.blockEnd) weight *= 2.6;
    else if (token.endsSentence) weight *= 2.1;
    else if (/[,;:—–)]["'”’]?$/.test(text)) weight *= 1.5;

    if (/\d/.test(text)) weight *= 1.25;

    if (text.length > 8) weight *= 1 + (text.length - 8) * 0.045;
    if (/-$/.test(text)) weight *= 0.85;   // a mid-word chunk, keep it brisk

    return weight;
  }

  /* text -> { tokens, sentenceStarts, cum, wordCount } */
  function tokenize(input) {
    var text = String(input == null ? '' : input)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f\u2009\u200a]/g, ' ')
      .replace(/[\t\f\v]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ');

    var blocks = text.split(/\n+/);
    var words = [];

    blocks.forEach(function (block, blockIndex) {
      var parts = block.trim().split(/\s+/).filter(Boolean);
      parts.forEach(function (word, i) {
        words.push({
          word: word,
          firstInBlock: i === 0,
          startsBlock: i === 0 && blockIndex > 0,
          endsBlock: i === parts.length - 1
        });
      });
    });

    var tokens = [];
    words.forEach(function (entry, wordIndex) {
      var next = words[wordIndex + 1] ? words[wordIndex + 1].word : '';
      var lastOfBlock = entry.endsBlock && wordIndex < words.length - 1;
      var ends = lastOfBlock || isSentenceEnd(entry.word, next, entry.firstInBlock);
      var chunks = splitLongWord(entry.word);

      chunks.forEach(function (chunk, chunkIndex) {
        var isLast = chunkIndex === chunks.length - 1;
        tokens.push({
          text: chunk,
          focus: focusIndex(chunk),
          wordIndex: wordIndex,
          paragraph: entry.startsBlock && chunkIndex === 0,
          endsSentence: isLast && ends,
          blockEnd: isLast && lastOfBlock,
          sentence: 0,
          weight: 1
        });
      });
    });

    var sentenceStarts = [];
    var sentence = -1;
    var cum = new Float64Array(tokens.length + 1);

    tokens.forEach(function (token, i) {
      if (i === 0 || tokens[i - 1].endsSentence) {
        sentence++;
        sentenceStarts.push(i);
      }
      token.sentence = sentence;
      token.weight = weightFor(token);
      cum[i + 1] = cum[i] + token.weight;
    });

    return {
      tokens: tokens,
      sentenceStarts: sentenceStarts,
      cum: cum,
      wordCount: words.length
    };
  }

  function beat(wpm) {
    return 60000 / clamp(Number(wpm) || 300, 60, 1500);
  }

  function delayFor(token, wpm) {
    return beat(wpm) * (token ? token.weight : 1);
  }

  function remainingMs(doc, index, wpm) {
    if (!doc || !doc.tokens.length) return 0;
    var from = clamp(index, 0, doc.tokens.length);
    return beat(wpm) * (doc.cum[doc.tokens.length] - doc.cum[from]);
  }

  function formatTime(ms) {
    var total = Math.max(0, Math.round(ms / 1000));
    var minutes = Math.floor(total / 60);
    var seconds = total % 60;
    if (minutes >= 60) {
      var hours = Math.floor(minutes / 60);
      return hours + ':' + String(minutes % 60).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }
    return minutes + ':' + String(seconds).padStart(2, '0');
  }

  /* Start of the sentence containing `index`, or of the previous one when we're
   * already sitting on the first word (the usual "track back" behaviour). */
  function sentenceBack(doc, index) {
    var starts = doc.sentenceStarts;
    if (!starts.length) return 0;
    var current = 0;
    for (var i = 0; i < starts.length; i++) {
      if (starts[i] <= index) current = i; else break;
    }
    if (starts[current] < index) return starts[current];
    return starts[Math.max(0, current - 1)];
  }

  function sentenceForward(doc, index) {
    var starts = doc.sentenceStarts;
    for (var i = 0; i < starts.length; i++) {
      if (starts[i] > index) return starts[i];
    }
    return Math.max(0, doc.tokens.length - 1);
  }

  /* Rebuild a readable string from tokens. A chunk of a split long word ends in
   * a hyphen; when the rest of the word follows, drop it so the context strip
   * shows the whole word rather than the machinery that split it. */
  function joinTokens(list) {
    var out = '';
    for (var i = 0; i < list.length; i++) {
      var text = list[i].text;
      var continues = /-$/.test(text) && i < list.length - 1;
      out += continues ? text.slice(0, -1) : text;
      if (i < list.length - 1 && !continues) out += ' ';
    }
    return out;
  }

  NS.Rsvp = {
    tokenize: tokenize,
    focusIndex: focusIndex,
    isSentenceEnd: isSentenceEnd,
    delayFor: delayFor,
    remainingMs: remainingMs,
    formatTime: formatTime,
    sentenceBack: sentenceBack,
    sentenceForward: sentenceForward,
    joinTokens: joinTokens,
    clamp: clamp
  };
})();
