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

  /* ---------------------------------------------------------------- links */

  /* A URL spelled out letter by letter is noise, so it collapses to a single
   * token: "https/…".
   *
   * Only URL-shaped *text* collapses. A link whose text reads as words — "the
   * original paper" — is usually the most meaningful phrase in the sentence,
   * and is left exactly as it is. */
  var URL_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
  var URL_WWW = /^www\d{0,3}\./i;

  /* A scheme-less host has to show a recognised TLD before we believe it.
   * Without that bar, "input.value/2" and "Fig.3/4" get swallowed too. */
  var URL_BARE = new RegExp('^[a-z0-9][a-z0-9-]*(\\.[a-z0-9-]+)*\\.(' + [
    'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'io', 'co', 'ai', 'dev', 'app',
    'me', 'info', 'biz', 'news', 'blog', 'xyz', 'online', 'site', 'tech', 'wiki',
    'uk', 'de', 'fr', 'jp', 'cn', 'ru', 'nl', 'it', 'es', 'se', 'no', 'fi', 'dk',
    'pl', 'br', 'in', 'au', 'ca', 'ch', 'at', 'be', 'cz', 'gr', 'hu', 'il', 'ie',
    'kr', 'mx', 'nz', 'pt', 'ro', 'sg', 'tr', 'ua', 'tv', 'ly', 'gl', 'to', 'cc', 'us', 'eu'
  ].join('|') + ')(:\\d+)?/', 'i');

  var URL_LEAD = /^[([{«"'“‘<]+/;
  var URL_TAIL = /[)\]}»"'”’>]*[.,;:!?…]*[)\]}»"'”’>]*$/;

  function urlLabel(body) {
    var scheme = URL_SCHEME.exec(body);
    if (scheme) return scheme[0].slice(0, scheme[0].indexOf(':')).toLowerCase();
    if (URL_WWW.test(body)) return 'www';
    return 'link';
  }

  /* word -> { text, endsSentence } when it is a URL, else null.
   *
   * Brackets and closing punctuation are stripped rather than kept: "(https/…)"
   * reads worse than "https/…", and the ellipsis already says something was
   * elided. Whether the URL finished a sentence is reported separately, so the
   * sentence break survives even though the full stop doesn't. */
  function collapseUrl(word) {
    var body = String(word).replace(URL_LEAD, '');

    var match = URL_TAIL.exec(body);
    var tail = match ? match[0] : '';
    if (tail) body = body.slice(0, body.length - tail.length);
    if (!body) return null;

    if (!URL_SCHEME.test(body) && !URL_WWW.test(body) && !URL_BARE.test(body)) return null;

    return { text: urlLabel(body) + '/…', endsSentence: /[.!?…]/.test(tail) };
  }

  function isUrl(word) {
    return collapseUrl(word) !== null;
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
    if (isUrl(next)) return true;   // "…and that was that. https://example.com/x"

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

  /* ---------------------------------------------------------- (sub)titles */

  var HEADING_MAX_WORDS = 12;
  var HEADING_MAX_WORDS_BOLD = 22;

  /* Prose that merely lost its closing full stop is still prose, so any
   * sentence-ish terminator rules a block out. This is the strongest single
   * signal available without markup: a line break, no finishing punctuation. */
  var PROSE_TAIL = /[.!?…,;]["'”’»)\]]*$/;

  /* Bullets and numbered items are short and unpunctuated too, and they are
   * emphatically not titles. */
  var LIST_MARKER = /^([-–—•*·▪‣]\s|\(?\d{1,3}[.)]\s|\(?[a-z][.)]\s)/i;

  /* Only consulted when the markup didn't already settle it — see toBlocks. */
  function looksLikeHeading(block, index, blocks) {
    var text = block.text;
    if (!text) return false;
    if (index >= blocks.length - 1) return false;    // a title has something under it
    if (LIST_MARKER.test(text)) return false;
    if (PROSE_TAIL.test(text)) return false;

    var words = text.split(/\s+/);
    if (words.length > (block.bold ? HEADING_MAX_WORDS_BOLD : HEADING_MAX_WORDS)) return false;
    if (words.some(isUrl)) return false;   // a bare link is a link, not a title

    // Several sentences that happen to end without punctuation are still prose.
    for (var i = 0; i < words.length - 1; i++) {
      if (isSentenceEnd(words[i], words[i + 1], i === 0)) return false;
    }
    return true;
  }

  /* Relative display duration. 1 = one "beat" at the current WPM. */
  function weightFor(token) {
    var text = token.text;
    var weight = 1;

    if (token.headingEnd) weight *= 4.2;          // let a title land before moving on
    else if (token.beforeHeading) weight *= 3.2;  // and give it a beat of run-up
    else if (token.blockEnd) weight *= 2.6;
    else if (token.endsSentence) weight *= 2.1;
    else if (/[,;:—–)]["'”’]?$/.test(text)) weight *= 1.5;

    if (token.heading) weight *= 1.2;             // titles read a touch slower
    if (token.link) weight *= 1.4;                // a whole URL just went past
    if (/\d/.test(text)) weight *= 1.25;

    if (text.length > 8) weight *= 1 + (text.length - 8) * 0.045;
    if (/-$/.test(text)) weight *= 0.85;   // a mid-word chunk, keep it brisk

    return weight;
  }

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u00a0\u2007\u202f\u2009\u200a]/g, ' ')
      .replace(/[\t\f\v]+/g, ' ')
      .replace(/[ ]{2,}/g, ' ');
  }

  /* Input may be a plain string (pasted text), an array of blocks, or
   * { blocks: [...] } as content/extract.js produces.
   *
   * A block is { text, heading?, bold? }. `heading` is a tri-state: true or
   * false is the markup speaking — an <h2>, say — and is taken at face value.
   * undefined means nobody knows, so looksLikeHeading decides, with `bold` as
   * a thumb on the scale. */
  function toBlocks(input) {
    var list = null;
    if (input && Array.isArray(input.blocks)) list = input.blocks;
    else if (Array.isArray(input)) list = input;

    if (!list) {
      return normalizeText(input).split(/\n+/).map(function (line) {
        return { text: line.trim(), heading: undefined, bold: false };
      }).filter(function (block) { return block.text; });
    }

    var out = [];
    list.forEach(function (entry) {
      var raw = typeof entry === 'string' ? { text: entry } : (entry || {});
      // A DOM block can still hold newlines of its own — a <pre>, typically.
      normalizeText(raw.text).split(/\n+/).forEach(function (line) {
        var text = line.trim();
        if (!text) return;
        out.push({
          text: text,
          heading: typeof raw.heading === 'boolean' ? raw.heading : undefined,
          bold: !!raw.bold
        });
      });
    });
    return out;
  }

  function isEmpty(input) {
    return toBlocks(input).length === 0;
  }

  /* input -> { tokens, sentenceStarts, cum, wordCount } */
  function tokenize(input) {
    var blocks = toBlocks(input);
    var words = [];

    blocks.forEach(function (block, i) {
      if (typeof block.heading !== 'boolean') block.heading = looksLikeHeading(block, i, blocks);
    });

    blocks.forEach(function (block, blockIndex) {
      var parts = block.text.split(/\s+/).filter(Boolean);
      var nextBlock = blocks[blockIndex + 1];
      parts.forEach(function (word, i) {
        var link = collapseUrl(word);
        words.push({
          word: link ? link.text : word,
          raw: word,                       // sentence detection reads the original
          link: !!link,
          linkEndsSentence: !!link && link.endsSentence,
          heading: block.heading,
          firstInBlock: i === 0,
          startsBlock: i === 0 && blockIndex > 0,
          endsBlock: i === parts.length - 1,
          beforeHeading: i === parts.length - 1 && !block.heading && !!nextBlock && nextBlock.heading
        });
      });
    });

    var tokens = [];
    words.forEach(function (entry, wordIndex) {
      var next = words[wordIndex + 1] ? words[wordIndex + 1].raw : '';
      var lastOfBlock = entry.endsBlock && wordIndex < words.length - 1;
      // A collapsed link carries its own verdict: the "…" that replaced the URL
      // must not be mistaken for an ellipsis the author wrote.
      var ends = lastOfBlock || (entry.link
        ? entry.linkEndsSentence
        : isSentenceEnd(entry.word, next, entry.firstInBlock));
      var chunks = splitLongWord(entry.word);

      chunks.forEach(function (chunk, chunkIndex) {
        var isLast = chunkIndex === chunks.length - 1;
        tokens.push({
          text: chunk,
          // The word as it appeared on the page, before collapsing or chunking.
          // Lets the page find this word again when the reader closes.
          raw: entry.raw,
          focus: focusIndex(chunk),
          wordIndex: wordIndex,
          heading: entry.heading,
          link: entry.link,
          paragraph: entry.startsBlock && chunkIndex === 0,
          endsSentence: isLast && ends,
          blockEnd: isLast && lastOfBlock,
          headingEnd: isLast && lastOfBlock && entry.heading,
          beforeHeading: isLast && entry.beforeHeading,
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

  NS.Rsvp = {
    tokenize: tokenize,
    toBlocks: toBlocks,
    isEmpty: isEmpty,
    looksLikeHeading: looksLikeHeading,
    collapseUrl: collapseUrl,
    isUrl: isUrl,
    focusIndex: focusIndex,
    isSentenceEnd: isSentenceEnd,
    delayFor: delayFor,
    remainingMs: remainingMs,
    formatTime: formatTime,
    sentenceBack: sentenceBack,
    sentenceForward: sentenceForward,
    clamp: clamp
  };
})();
