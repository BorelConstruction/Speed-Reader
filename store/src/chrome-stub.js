/* Store screenshots — a stand-in for the chrome.* APIs the extension's pages
 * touch, so the real popup, options page and reader scripts run unmodified in
 * an ordinary tab.
 *
 * Injected by store/render.mjs at document start in every frame, before any
 * of the page's own scripts, with window.__SHOT__ already set:
 *   settings       — what chrome.storage.sync holds for this shot. Pages ask
 *                    for it with the defaults as the argument, so whatever a
 *                    shot leaves out comes back as the default, exactly as a
 *                    fresh install would.
 *   extensionRoot  — file:// URL of the repo, for chrome.runtime.getURL.
 *
 * Only the surface the pages actually use is here. Anything else stays
 * undefined on purpose: a page reaching for an API this doesn't cover should
 * fail loudly in render.mjs, not quietly render the wrong thing. */
(function () {
  'use strict';

  var shot = window.__SHOT__ || {};

  /* Captured now: a shot may freeze the page's timers to hold the reader on
   * one word, and storage callbacks still have to arrive after that. */
  var later = window.setTimeout.bind(window);

  function copy(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  /* The real APIs are asynchronous and take a callback or return a promise.
   * Answering on a later task, never synchronously, keeps the pages' ordering
   * assumptions honest. */
  function reply(callback, value) {
    if (typeof callback === 'function') {
      later(function () { callback(copy(value)); }, 0);
      return undefined;
    }
    return new Promise(function (resolve) {
      later(function () { resolve(copy(value)); }, 0);
    });
  }

  function event() {
    var listeners = [];
    return {
      addListener: function (fn) { if (listeners.indexOf(fn) < 0) listeners.push(fn); },
      removeListener: function (fn) {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      hasListener: function (fn) { return listeners.indexOf(fn) >= 0; },
      dispatch: function () {
        var args = arguments;
        listeners.slice().forEach(function (fn) {
          later(function () { fn.apply(null, args); }, 0);
        });
      }
    };
  }

  /* ---------------------------------------------------------------- storage */

  var onChanged = event();

  function storageArea(name, initial) {
    var data = copy(initial) || {};

    /* get() takes null (everything), a key, a list of keys, or an object of
     * keys with the defaults to use for any that aren't stored. */
    function pick(keys) {
      var out = {};
      if (keys == null) return copy(data);
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) {
        keys.forEach(function (key) { if (key in data) out[key] = data[key]; });
        return out;
      }
      Object.keys(keys).forEach(function (key) {
        out[key] = key in data ? data[key] : keys[key];
      });
      return out;
    }

    function change(apply) {
      var changes = {};
      apply(function (key, value) {
        var oldValue = data[key];
        if (value === undefined) delete data[key];
        else data[key] = copy(value);
        changes[key] = { oldValue: copy(oldValue), newValue: copy(value) };
      });
      if (Object.keys(changes).length) onChanged.dispatch(changes, name);
    }

    return {
      get: function (keys, callback) {
        if (typeof keys === 'function') { callback = keys; keys = null; }
        return reply(callback, pick(keys));
      },
      set: function (items, callback) {
        change(function (put) {
          Object.keys(items || {}).forEach(function (key) { put(key, items[key]); });
        });
        return reply(callback);
      },
      remove: function (keys, callback) {
        change(function (put) {
          [].concat(keys).forEach(function (key) { if (key in data) put(key, undefined); });
        });
        return reply(callback);
      },
      clear: function (callback) {
        change(function (put) { Object.keys(data).forEach(function (key) { put(key, undefined); }); });
        return reply(callback);
      }
    };
  }

  /* ---------------------------------------------------------------- runtime */

  /* What the service worker would answer. Only the popup asks anything that
   * needs a real answer: the selection preview. The worker gets that by
   * running String(getSelection()) in the tab; here the "tab" is the page the
   * popup is drawn over, which is this frame's top window. */
  function answer(message) {
    if (message && message.type === 'sr-get-selection') {
      var text = '';
      try { text = String(window.top.getSelection()); } catch (err) { text = ''; }
      return { text: text };
    }
    return { ok: true };
  }

  /* sendMessage([extensionId,] message [, options] [, callback]) */
  function sendMessage() {
    var args = [].slice.call(arguments);
    var callback = typeof args[args.length - 1] === 'function' ? args.pop() : null;
    var message = typeof args[0] === 'string' ? args[1] : args[0];
    return reply(callback, answer(message));
  }

  /* The tab the popup belongs to — the page underneath it. */
  function activeTab() {
    var top = window;
    try { top = window.top; void top.location.href; } catch (err) { top = window; }
    return {
      id: 1, index: 0, windowId: 1, active: true, highlighted: true,
      url: top.location.href, title: top.document.title
    };
  }

  var chromeStub = {
    storage: {
      sync: storageArea('sync', shot.settings),
      local: storageArea('local', {}),
      session: storageArea('session', {}),
      onChanged: onChanged
    },
    runtime: {
      id: 'speedreader-store-shots',
      lastError: undefined,
      sendMessage: sendMessage,
      getURL: function (path) {
        return new URL(String(path).replace(/^\//, ''), shot.extensionRoot || location.href).href;
      },
      openOptionsPage: function (callback) { return reply(callback); },
      onMessage: event()
    },
    tabs: {
      query: function (info, callback) { return reply(callback, [activeTab()]); },
      create: function (props, callback) {
        return reply(callback, Object.assign({ id: 2, index: 1, windowId: 1 }, props));
      }
    }
  };

  // Replace whatever `chrome` an ordinary tab has (loadTimes, csi, …) outright.
  Object.defineProperty(window, 'chrome', {
    value: chromeStub, configurable: true, enumerable: true, writable: true
  });
})();
