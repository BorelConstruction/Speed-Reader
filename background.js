/* SpeedReader — service worker.
 *
 * Owns the context menu, the browser-level shortcut, and on-demand injection
 * of the reader. Nothing heavy runs on pages until you actually ask to read. */

'use strict';

var READER_FILES = [
  'lib/settings.js',
  'lib/rsvp.js',
  'lib/reader-ui.js',
  'content/mount.js'
];

var MENU_SELECTION = 'sr-read-selection';
var MENU_HERE = 'sr-read-here';

/* file: is deliberately absent — it works once "Allow access to file URLs" is
 * ticked on the extension's details page, and fails harmlessly otherwise. */
var RESTRICTED = /^(chrome|edge|about|devtools|view-source|chrome-extension|moz-extension|chrome-untrusted):/i;
var WEBSTORE = /^https?:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore|microsoftedge\.microsoft\.com\/addons)/i;

function canInject(url) {
  if (!url) return false;
  return !RESTRICTED.test(url) && !WEBSTORE.test(url);
}

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    void chrome.runtime.lastError;

    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: 'Speed read selection',
      contexts: ['selection']
    }, function () { void chrome.runtime.lastError; });

    // Also offered alongside a selection: highlighting a word or two and
    // choosing this reads on from there rather than reading just the highlight.
    chrome.contextMenus.create({
      id: MENU_HERE,
      title: 'Speed read from here',
      contexts: ['page', 'link', 'selection']
    }, function () { void chrome.runtime.lastError; });
  });
});

/* Runs in the page: returns whatever is selected. getSelection().toString()
 * keeps the paragraph breaks that info.selectionText flattens away. */
function grabSelection() {
  try {
    return window.getSelection ? String(window.getSelection()) : '';
  } catch (err) {
    return '';
  }
}

/* Runs in the page: a small transient notice for the "nothing selected" case. */
function showToast(message) {
  var id = '__speedreader_toast__';
  var existing = document.getElementById(id);
  if (existing) existing.remove();

  var node = document.createElement('div');
  node.id = id;
  node.textContent = message;
  node.setAttribute('style', [
    'all:initial', 'position:fixed', 'z-index:2147483647', 'left:50%', 'top:22px',
    'transform:translateX(-50%)', 'background:#15181d', 'color:#f2f4f7',
    'font:14px/1.45 "Segoe UI",-apple-system,Roboto,Helvetica,Arial,sans-serif',
    'padding:10px 16px', 'border-radius:11px', 'border:1px solid #272b33',
    'box-shadow:0 12px 34px rgba(0,0,0,.45)', 'pointer-events:none'
  ].join(';'));
  document.documentElement.appendChild(node);
  setTimeout(function () { node.remove(); }, 2400);
}

async function readSelection(tabId, frameId) {
  var target = typeof frameId === 'number'
    ? { tabId: tabId, frameIds: [frameId] }
    : { tabId: tabId, allFrames: true };

  try {
    var results = await chrome.scripting.executeScript({ target: target, func: grabSelection });
    for (var i = 0; i < results.length; i++) {
      if (results[i] && typeof results[i].result === 'string' && results[i].result.trim()) {
        return results[i].result;
      }
    }
  } catch (err) {
    /* restricted page, or the frame went away */
  }
  return '';
}

/* "Read from here": resolve the click (or selection) into a text position in
 * the frame that was clicked, and pull everything from there to the end of the
 * surrounding article. */
async function readFromHere(tabId, frameId) {
  var target = { tabId: tabId, frameIds: [typeof frameId === 'number' ? frameId : 0] };
  try {
    await chrome.scripting.executeScript({ target: target, files: ['content/extract.js'] });
    var results = await chrome.scripting.executeScript({
      target: target,
      func: function () { return window.SpeedReader.textFromHere(); }
    });
    if (results && results[0] && typeof results[0].result === 'string') return results[0].result;
  } catch (err) {
    /* restricted page, or the frame went away */
  }
  return '';
}

async function toast(tabId, message) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      func: showToast,
      args: [message]
    });
  } catch (err) {
    /* nothing we can do on a restricted page */
  }
}

/* Inject the reader into the top frame of `tabId` and hand it the text.
 * Re-injection is safe: every file is wrapped in an IIFE. */
async function startReading(tabId, text, emptyMessage) {
  if (!text || !text.trim()) {
    await toast(tabId, emptyMessage || 'SpeedReader: select some text first.');
    return { ok: false, error: 'no-text' };
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      files: READER_FILES
    });
    await chrome.scripting.executeScript({
      target: { tabId: tabId, frameIds: [0] },
      func: function (payload) { window.SpeedReader.open(payload); },
      args: [text]
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function activeTab() {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

var NOTHING_HERE = 'SpeedReader: no readable text at that spot.';

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (!tab || tab.id == null) return;

  if (info.menuItemId === MENU_SELECTION) {
    var selected = await readSelection(tab.id, info.frameId);
    await startReading(tab.id, selected || info.selectionText || '');
    return;
  }

  if (info.menuItemId === MENU_HERE) {
    var onward = await readFromHere(tab.id, info.frameId);
    await startReading(tab.id, onward, NOTHING_HERE);
  }
});

chrome.commands.onCommand.addListener(async function (command) {
  if (command !== 'start-reading') return;
  var tab = await activeTab();
  if (!tab || tab.id == null) return;
  if (!canInject(tab.url)) return;
  var text = await readSelection(tab.id);
  if (!text.trim()) text = await readFromHere(tab.id, 0);   // fall back to the caret
  await startReading(tab.id, text, NOTHING_HERE);
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message.type !== 'string') return undefined;

  if (message.type === 'sr-start') {
    // From the in-page Shift+R listener, with a selection.
    var tabId = sender.tab && sender.tab.id;
    if (tabId == null) return undefined;
    startReading(tabId, message.text || '').then(sendResponse);
    return true;
  }

  if (message.type === 'sr-start-here') {
    // Shift+R with only a caret: read on from wherever it sits.
    var hereTabId = sender.tab && sender.tab.id;
    if (hereTabId == null) return undefined;
    (async function () {
      var text = await readFromHere(hereTabId, sender.frameId);
      sendResponse(await startReading(hereTabId, text, NOTHING_HERE));
    })();
    return true;
  }

  if (message.type === 'sr-start-in-tab') {
    // From the popup: read whatever is selected on the given tab.
    (async function () {
      var id = message.tabId;
      if (id == null) {
        var tab = await activeTab();
        id = tab && tab.id;
      }
      if (id == null) { sendResponse({ ok: false, error: 'no-tab' }); return; }
      var text = message.text || await readSelection(id);
      sendResponse(await startReading(id, text));
    })();
    return true;
  }

  if (message.type === 'sr-get-selection') {
    (async function () {
      var id = message.tabId;
      if (id == null) {
        var tab = await activeTab();
        id = tab && tab.id;
      }
      if (id == null) { sendResponse({ text: '' }); return; }
      sendResponse({ text: await readSelection(id) });
    })();
    return true;
  }

  if (message.type === 'sr-close-tab') {
    // reader.html can't close itself: window.close() only works on windows a
    // script opened, and chrome.tabs.create doesn't count.
    if (sender.tab && sender.tab.id != null) {
      chrome.tabs.remove(sender.tab.id, function () { void chrome.runtime.lastError; });
    }
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'sr-open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return true;
  }

  return undefined;
});
