/* SpeedReader — settings store.
 * Wrapped in an IIFE so the file can be injected more than once into the same
 * isolated world without "Identifier has already been declared" errors. */
(function () {
  'use strict';

  var NS = (self.SpeedReader = self.SpeedReader || {});

  var DEFAULTS = {
    wpm: 350,               // 100–1000, persisted between runs
    readerWidth: 720,       // px — how much text you can see at once
    showContext: true,      // show the dimmed words around the current one
    contextOpacity: 0.32,   // how dim that context is
    contextWords: 12,       // how many words on each side
    highlightColor: '#e5484d',
    theme: 'auto',          // auto | dark | light
    backdropOpacity: 0.88,  // how much the page behind is dimmed
    fontSize: 40,           // px
    fontFamily: 'sans',     // sans | serif | mono
    showPivotLines: true
  };

  var NUMBERS = {
    wpm: [100, 1000],
    readerWidth: [320, 1400],
    contextOpacity: [0, 1],
    contextWords: [0, 40],
    backdropOpacity: [0, 1],
    fontSize: [16, 96]
  };

  var ENUMS = {
    theme: ['auto', 'dark', 'light'],
    fontFamily: ['sans', 'serif', 'mono']
  };

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  /* Coerce whatever came out of storage into something the UI can trust. */
  function normalize(raw) {
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      var value = raw && Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : DEFAULTS[key];

      if (NUMBERS[key]) {
        var num = Number(value);
        value = isFinite(num) ? clamp(num, NUMBERS[key][0], NUMBERS[key][1]) : DEFAULTS[key];
      } else if (ENUMS[key]) {
        if (ENUMS[key].indexOf(value) < 0) value = DEFAULTS[key];
      } else if (typeof DEFAULTS[key] === 'boolean') {
        value = !!value;
      } else if (key === 'highlightColor') {
        if (typeof value !== 'string' || !/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(value.trim())) {
          value = DEFAULTS[key];
        } else {
          value = value.trim();
        }
      }
      out[key] = value;
    });
    return out;
  }

  function load() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.get(DEFAULTS, function (stored) {
          if (chrome.runtime.lastError) resolve(normalize(null));
          else resolve(normalize(stored));
        });
      } catch (err) {
        resolve(normalize(null));
      }
    });
  }

  function save(patch) {
    return new Promise(function (resolve) {
      try {
        chrome.storage.sync.set(patch, function () {
          void chrome.runtime.lastError;
          resolve();
        });
      } catch (err) {
        resolve();
      }
    });
  }

  function reset() {
    return save(Object.assign({}, DEFAULTS));
  }

  /* Calls back with ONLY the keys that changed, coerced. The caller merges it
   * into its own state — passing a whole settings object here would quietly
   * reset every key the caller had that storage didn't mention. */
  function subscribe(callback) {
    function handler(changes, area) {
      if (area !== 'sync') return;

      var raw = {};
      var keys = [];
      Object.keys(changes).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
        var value = changes[key].newValue;
        raw[key] = value === undefined ? DEFAULTS[key] : value;   // key was cleared
        keys.push(key);
      });
      if (!keys.length) return;

      var coerced = normalize(raw);
      var patch = {};
      keys.forEach(function (key) { patch[key] = coerced[key]; });
      callback(patch);
    }
    try {
      chrome.storage.onChanged.addListener(handler);
    } catch (err) {
      return function () {};
    }
    return function () {
      try { chrome.storage.onChanged.removeListener(handler); } catch (err) { /* gone */ }
    };
  }

  NS.Settings = {
    DEFAULTS: DEFAULTS,
    LIMITS: NUMBERS,
    clamp: clamp,
    normalize: normalize,
    load: load,
    save: save,
    reset: reset,
    subscribe: subscribe
  };
})();
