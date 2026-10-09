/* Store screenshots — helpers for the per-shot setup scripts.
 *
 * Injected by store/render.mjs at document start in every frame, right after
 * chrome-stub.js. A setup script is evaluated once the page has loaded and
 * calls window.__shotKit.run(async function (kit, params) { … }). When that
 * resolves, run() waits for fonts and a painted frame and sets
 * window.__shotReady; if it throws, window.__shotError carries the reason.
 * render.mjs polls for one or the other, then takes the screenshot. */
(function () {
  'use strict';

  var shot = window.__SHOT__ || {};
  var kit = (window.__shotKit = {});

  /* Captured before any shot can freeze the page's timers — see freezeTimers. */
  var realSetTimeout = window.setTimeout.bind(window);
  var realRaf = window.requestAnimationFrame.bind(window);

  /* -------------------------------------------------------- reader capture */

  /* Every reader the page creates, in order. The options page keeps its
   * preview in a closure, so the only way to steer it is to be handed it as
   * it's made. lib/reader-ui.js assigns NS.createReader exactly once; the
   * setter keeps that function and the getter hands out a wrapper that
   * records each instance. The library itself runs untouched. */
  kit.readers = [];

  var NS = (window.SpeedReader = window.SpeedReader || {});
  var createReader = null;

  function recordingCreateReader(host, options) {
    var reader = createReader(host, options);
    kit.readers.push({ reader: reader, host: host });
    return reader;
  }

  Object.defineProperty(NS, 'createReader', {
    configurable: true,
    enumerable: true,
    get: function () { return createReader ? recordingCreateReader : undefined; },
    set: function (fn) { createReader = fn; }
  });

  /* --------------------------------------------------------------- timing */

  kit.sleep = function (ms) {
    return new Promise(function (resolve) { realSetTimeout(resolve, ms); });
  };

  kit.frames = function (count) {
    return new Promise(function (resolve) {
      (function next(left) {
        if (left <= 0) resolve();
        else realRaf(function () { next(left - 1); });
      })(count || 1);
    });
  };

  /* Resolves with fn()'s first truthy value, or rejects naming `what`. */
  kit.until = function (fn, what, timeoutMs) {
    var deadline = Date.now() + (timeoutMs || 8000);
    return new Promise(function (resolve, reject) {
      (function poll() {
        var value;
        try { value = fn(); } catch (err) { value = null; }
        if (value) return resolve(value);
        if (Date.now() > deadline) return reject(new Error('timed out waiting for ' + what));
        realSetTimeout(poll, 30);
      })();
    });
  };

  /* A screenshot is one instant, but "reading" is a state with a timer
   * behind it: the reader re-arms a setTimeout per word. Swapping in a
   * setTimeout that never fires leaves it genuinely playing — pause icon,
   * pivot marks, no pause view — but parked on whichever word it was last
   * sent to. The kit and the chrome stub kept the real one. */
  kit.freezeTimers = function () {
    window.setTimeout = function () { return 0; };
  };

  /* ------------------------------------------------------------- the page */

  function textNodes(element) {
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) if (node.data.trim()) nodes.push(node);
    return nodes;
  }

  /* Selects from the start of `first` to the end of `last`, as a drag would. */
  kit.select = function (first, last) {
    var from = textNodes(first)[0];
    var toNodes = textNodes(last);
    var to = toNodes[toNodes.length - 1];
    if (!from || !to) throw new Error('nothing to select');
    var range = document.createRange();
    range.setStart(from, 0);
    range.setEnd(to, to.data.replace(/\s+$/, '').length);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return String(selection);
  };

  /* ----------------------------------------------------------- the reader */

  /* The reader's shadow root. It's closed, so host.shadowRoot is null; the
   * reader keeps its own handle in SpeedReader._shadowRoots, which these pages
   * can reach because — unlike a real page, whose scripts live in a different
   * world from the extension's — they load the reader into their own. The
   * fallback covers a reader built before the root was closed. */
  kit.rootOf = function (entry) {
    var roots = window.SpeedReader && window.SpeedReader._shadowRoots;
    return (roots && roots.get(entry.host)) || entry.host.shadowRoot;
  };

  function readerParts(root) {
    var pick = function (sel) { var el = root.querySelector(sel); return el ? el.textContent : ''; };
    return {
      word: pick('.sr-pre') + pick('.sr-focus') + pick('.sr-post'),
      count: pick('.sr-count')
    };
  }

  function bare(text) {
    return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  }

  /* Moves `reader` onto the `occurrence`-th time (1-based) `word` is shown.
   * It walks the reader itself, reading the word back out of its shadow DOM,
   * so the position always matches what the reader really displays — however
   * the tokenizer happens to split the text. */
  kit.seek = function (entry, word, occurrence) {
    var root = kit.rootOf(entry);
    var wanted = bare(word);
    var seen = 0;
    for (var i = 0; i < 20000; i++) {
      entry.reader.gotoIndex(i);
      var parts = readerParts(root);
      if (bare(parts.word) === wanted && ++seen === (occurrence || 1)) return i;
      var count = parts.count.split('/').map(function (n) { return n.trim(); });
      if (count[0] === count[1]) break;   // walked off the end
    }
    throw new Error('the reader never shows "' + word + '" #' + (occurrence || 1));
  };

  /* Programmatic focus — the reader focuses its Play button on open — draws a
   * focus ring, which is noise in a still. */
  kit.blurReader = function (entry) {
    var root = kit.rootOf(entry);
    var active = root && root.activeElement;
    if (active && active.blur) active.blur();
  };

  /* ------------------------------------------------------------ lifecycle */

  kit.loadScript = function (src) {
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.onload = function () { script.remove(); resolve(); };
      script.onerror = function () { reject(new Error('could not load ' + src)); };
      (document.head || document.documentElement).appendChild(script);
    });
  };

  kit.run = function (setup) {
    Promise.resolve()
      .then(function () { return setup(kit, shot.params || {}); })
      .then(function () { return document.fonts.ready; })
      .then(function () { return kit.frames(2); })
      .then(function () { window.__shotReady = true; })
      .catch(function (err) {
        window.__shotError = String((err && err.stack) || err);
      });
  };
})();
