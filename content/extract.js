/* SpeedReader — pulls readable text out of the page, as blocks rather than one
 * flat string, so the reader knows which lines are (sub)titles.
 *
 * Two entry points, one walker:
 *   blocksFromSelection() — exactly what you highlighted
 *   blocksFromHere()      — from where you clicked to the end of the article
 *
 * Injected on demand into whichever frame was clicked. */
(function () {
  'use strict';

  var NS = (window.SpeedReader = window.SpeedReader || {});

  /* Containers that usually mean "this is the article". Checked nearest-first
   * via closest(); anything else falls back to <body>. */
  var CONTENT_ROOTS = [
    'article', 'main', '[role="main"]', '[itemprop="articleBody"]',
    '.post-content', '.entry-content', '.article-body', '.article__body',
    '.story-body', '.postArticle-content', '.markdown-body'
  ].join(',');

  /* Never read these out loud. */
  var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SVG|CANVAS|IFRAME|OBJECT|EMBED|VIDEO|AUDIO|BUTTON|SELECT|TEXTAREA|INPUT|NAV|ASIDE|FOOTER|FORM)$/;

  /* Tags that force a paragraph break in the output. */
  var BLOCK_TAGS = /^(ADDRESS|ARTICLE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIELDSET|FIGCAPTION|FIGURE|H[1-6]|HEADER|HR|LI|MAIN|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

  /* Elements whose whole job is to title what follows. */
  var HEADING_TAGS = /^(H[1-6]|DT|SUMMARY|LEGEND)$/;

  /* List items and table cells are short and unpunctuated too, and the browser
   * strips the bullet character, so the tokenizer's own list guard can't see
   * them. The markup can, so say so outright and stop it guessing. */
  var NOT_A_TITLE = 'li,td,th';

  var MAX_CHARS = 300000;      // a sane ceiling for a pathological page
  var POINT_MAX_AGE = 60000;   // ignore a right-click older than this
  var BOLD_MAX_WORDS = 24;     // don't bother measuring longer blocks

  /* Viewport point -> { node, offset }, as precise as the engine allows. */
  function positionFromPoint(x, y) {
    var node = null;
    var offset = 0;

    if (document.caretRangeFromPoint) {
      var range = document.caretRangeFromPoint(x, y);
      if (range) { node = range.startContainer; offset = range.startOffset; }
    }
    if (!node && document.caretPositionFromPoint) {
      var position = document.caretPositionFromPoint(x, y);
      if (position) { node = position.offsetNode; offset = position.offset; }
    }
    if (!node) {
      var element = document.elementFromPoint(x, y);
      if (element) { node = element; offset = 0; }
    }
    return node ? { node: node, offset: offset } : null;
  }

  function firstTextNode(element) {
    if (!element) return null;
    if (element.nodeType === 3) return element;
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      if (node.data && node.data.trim()) return node;
    }
    return null;
  }

  /* Landing mid-word reads badly, so rewind to the start of the word. */
  function snapToWordStart(node, offset) {
    var data = node.data || '';
    var i = Math.min(Math.max(offset, 0), data.length);
    while (i > 0 && !/\s/.test(data.charAt(i - 1))) i--;
    return i;
  }

  function contentRoot(node) {
    var element = node.nodeType === 1 ? node : node.parentElement;
    if (!element) return document.body || document.documentElement;
    var match = element.closest ? element.closest(CONTENT_ROOTS) : null;
    if (match && match !== document.body) return match;
    return document.body || document.documentElement;
  }

  /* No layout boxes means the element isn't rendered — cheaper than asking for
   * computed styles on every node of a long page. */
  function isRendered(element) {
    if (element.hasAttribute('hidden')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    return element.getClientRects().length > 0;
  }

  /* Is this text inside something that means "heading"? Definitive when true —
   * the reader takes markup at its word and skips its own guessing. */
  function inHeading(element) {
    var node = element;
    while (node && node.nodeType === 1) {
      if (HEADING_TAGS.test(node.tagName)) return true;
      if (node.getAttribute('role') === 'heading') return true;
      node = node.parentElement;
    }
    return false;
  }

  /* Bold isn't proof of a title on its own — it's a hint the reader weighs
   * alongside "short line, no closing punctuation". Tag first, because it's
   * free; only then pay for a computed style. */
  function isBold(element) {
    if (!element || element.nodeType !== 1) return false;
    if (element.closest && element.closest('strong,b')) return true;
    try {
      var weight = window.getComputedStyle(element).fontWeight;
      if (weight === 'bold' || weight === 'bolder') return true;
      return parseInt(weight, 10) >= 600;
    } catch (err) {
      return false;
    }
  }

  /* Both walks below have to agree exactly on which nodes count, or the word
   * numbering won't line up between them. */
  function nodeFilter(startNode) {
    return {
      acceptNode: function (node) {
        if (node.nodeType !== 1) return NodeFilter.FILTER_ACCEPT;
        // The skip list removes interruptions inside an article; it must not
        // veto the spot you actually pointed at. Right-clicking in a nav and
        // choosing "read from here" should read on from there, not do nothing.
        if (node.contains(startNode)) return NodeFilter.FILTER_ACCEPT;
        if (SKIP_TAGS.test(node.tagName)) return NodeFilter.FILTER_REJECT;
        if (!isRendered(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    };
  }

  /* Where the text we handed to the reader came from, so we can find our way
   * back into the DOM when it closes. */
  function remember(root, node, offset, range) {
    NS._anchor = { root: root, node: node, offset: offset, range: range || null };
  }

  /* Walk from the start position to the end of `root` (or to the end of
   * `range`, when one is given), gathering blocks.
   *
   * Range.toString() would be shorter but it concatenates text nodes with no
   * separator, welding "…the end.Beginning of…" into one word — and it throws
   * away the markup that tells us what's a heading. */
  function collect(root, startNode, startOffset, range) {
    var blocks = [];
    var current = null;
    var started = !root.contains(startNode);
    var total = 0;

    function flush() {
      if (!current) return;
      var text = current.parts.join('').replace(/[^\S\n]+/g, ' ').trim();
      if (text) {
        var block = { text: text };
        var element = current.element;
        if (current.heading) {
          block.heading = true;
        } else if (element && element.closest && element.closest(NOT_A_TITLE)) {
          block.heading = false;
        } else if (text.split(' ').length <= BOLD_MAX_WORDS && isBold(element)) {
          block.bold = true;
        }
        blocks.push(block);
      }
      current = null;
    }

    function pushText(textNode, data) {
      if (!data) return;
      var parent = textNode.parentElement;
      // HTML collapses whitespace, so source line breaks aren't paragraph
      // breaks — only the block tags above are. <pre> keeps its own layout.
      if (!parent || !parent.closest('pre')) data = data.replace(/\s+/g, ' ');

      if (!current) current = { parts: [], heading: false, element: parent };
      if (inHeading(parent)) current.heading = true;
      current.parts.push(data);
      total += data.length;
    }

    function pastEnd(node) {
      if (!range) return false;
      try { return range.comparePoint(node, 0) > 0; } catch (err) { return false; }
    }

    var walker = document.createTreeWalker(
      root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, nodeFilter(startNode));

    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        if (started && BLOCK_TAGS.test(node.tagName)) flush();
        continue;
      }

      if (!started) {
        if (node !== startNode) continue;
        started = true;
        pushText(node, range && node === range.endContainer
          ? node.data.slice(startOffset, range.endOffset)
          : node.data.slice(startOffset));
        if (range && node === range.endContainer) break;
        continue;
      }

      if (pastEnd(node)) break;

      if (range && node === range.endContainer) {
        pushText(node, node.data.slice(0, range.endOffset));
        break;
      }

      pushText(node, node.data);
      if (total > MAX_CHARS) break;
    }

    flush();
    return blocks;
  }

  /* The reverse of collect(): given the same anchor, find the Nth word.
   *
   * It counts words rather than characters on purpose. The text handed to the
   * reader has been through whitespace collapsing, URL collapsing and long-word
   * chunking, none of which preserve character offsets — but all of which
   * preserve *word* boundaries, which is exactly what token.wordIndex counts.
   * So both walks split on whitespace and block edges, and the numbering
   * lines up without any offset arithmetic. */
  function wordRangeAt(anchor, target) {
    var root = anchor.root;
    var startNode = anchor.node;
    var range = anchor.range;

    if (!root || !startNode || !root.isConnected || !startNode.isConnected) return null;

    var started = !root.contains(startNode);
    var index = 0;
    var word = null;
    var found = null;

    /* Returns true once the wanted word is in hand. */
    function endWord() {
      if (!word) return false;
      if (index === target) {
        try {
          var r = document.createRange();
          r.setStart(word.startNode, word.startOffset);
          r.setEnd(word.endNode, word.endOffset);
          found = { range: r, text: word.text };
        } catch (err) {
          found = null;
        }
        word = null;
        return true;
      }
      index++;
      word = null;
      return false;
    }

    var walker = document.createTreeWalker(
      root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, nodeFilter(startNode));

    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === 1) {
        if (started && BLOCK_TAGS.test(node.tagName) && endWord()) return found;
        continue;
      }

      var base = 0;
      if (!started) {
        if (node !== startNode) continue;
        started = true;
        base = anchor.offset;
      }

      var stop = false;
      var data = node.data.slice(base);

      if (range) {
        try { if (range.comparePoint(node, 0) > 0) break; } catch (err) { /* detached */ }
        if (node === range.endContainer) {
          data = node.data.slice(base, range.endOffset);
          stop = true;
        }
      }

      for (var i = 0; i < data.length; i++) {
        var ch = data.charAt(i);
        if (/\s/.test(ch)) {
          if (endWord()) return found;
        } else if (word) {
          word.endNode = node;
          word.endOffset = base + i + 1;
          word.text += ch;
        } else {
          word = {
            startNode: node, startOffset: base + i,
            endNode: node, endOffset: base + i + 1,
            text: ch
          };
        }
      }

      if (stop) break;
    }

    endWord();
    return found;
  }

  /* The reader stopped on word N of what we handed it — put the page's own
   * selection on that same word, so you can see where you got to and carry on
   * from there later. */
  NS.selectWord = function selectWord(index, expected) {
    if (typeof index !== 'number' || index < 0 || !NS._anchor) return false;

    var found = wordRangeAt(NS._anchor, index);
    if (!found) return false;

    // The page may have re-rendered while you were reading; a word that doesn't
    // match what the reader was showing means the DOM moved, so leave it alone
    // rather than highlighting something arbitrary.
    if (expected && found.text !== expected) return false;

    var selection = null;
    try { selection = window.getSelection(); } catch (err) { return false; }
    if (!selection) return false;

    try {
      selection.removeAllRanges();
      selection.addRange(found.range);
    } catch (err) {
      return false;
    }

    var box = found.range.startContainer.parentElement;
    if (box && box.scrollIntoView) {
      try { box.scrollIntoView({ block: 'center', inline: 'nearest' }); }
      catch (err) { box.scrollIntoView(); }
    }

    // Tells content/hotkey.js this selection is a bookmark, not a request to
    // read one word. Compared by value, so editing the selection clears it.
    window.__SPEEDREADER_RESUME__ = { text: String(selection), at: Date.now() };
    return true;
  };

  function blocksFrom(node, offset) {
    var target = node;
    var at = offset;

    if (target.nodeType !== 3) {
      var text = firstTextNode(target.nodeType === 1 ? target : document.body);
      if (!text) return [];
      target = text;
      at = 0;
    }

    var root = contentRoot(target);
    var offset = snapToWordStart(target, at);
    remember(root, target, offset, null);
    return collect(root, target, offset, null);
  }

  /* Exactly the highlighted text, with its headings intact. */
  NS.blocksFromSelection = function blocksFromSelection() {
    var selection = null;
    try { selection = window.getSelection(); } catch (err) { selection = null; }
    if (!selection || !selection.rangeCount) return { blocks: [] };

    var range = selection.getRangeAt(0);
    if (range.collapsed) return { blocks: [] };

    var node = range.startContainer;
    var offset = range.startOffset;
    if (node.nodeType !== 3) {
      var first = firstTextNode(node.childNodes[offset] || node);
      if (!first) return { blocks: [] };
      node = first;
      offset = 0;
    }

    var root = range.commonAncestorContainer;
    if (root.nodeType !== 1) root = root.parentElement;
    if (!root) return { blocks: [] };

    // Clone: selecting the stopped word on close replaces the live selection,
    // which would otherwise mutate the range we need to walk again.
    remember(root, node, offset, range.cloneRange());
    return { blocks: collect(root, node, offset, range) };
  };

  /* Anchor priority:
   *   1. a real selection — you highlighted something, start where it starts
   *      (this is also the "select one character to point at it" fallback)
   *   2. where you last right-clicked
   *   3. a collapsed caret left behind by an ordinary click */
  NS.blocksFromHere = function blocksFromHere() {
    var selection = null;
    try { selection = window.getSelection(); } catch (err) { selection = null; }

    if (selection && selection.rangeCount) {
      var range = selection.getRangeAt(0);
      if (!range.collapsed) return { blocks: blocksFrom(range.startContainer, range.startOffset) };
    }

    var point = window.__SPEEDREADER_POINT__;
    if (point && Date.now() - point.at < POINT_MAX_AGE) {
      var position = positionFromPoint(point.x, point.y);
      if (position) return { blocks: blocksFrom(position.node, position.offset) };
    }

    if (selection && selection.rangeCount) {
      var caret = selection.getRangeAt(0);
      if (caret.startContainer && caret.startContainer.nodeType === 3) {
        return { blocks: blocksFrom(caret.startContainer, caret.startOffset) };
      }
    }

    return { blocks: [] };
  };
})();
