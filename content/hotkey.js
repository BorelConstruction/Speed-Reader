/* SpeedReader — the only script that runs on every page.
 *
 * It listens for Shift+R and nothing else; the reader itself is injected on
 * demand by the service worker. Chrome's commands API can't bind a bare
 * Shift+R (it insists on Ctrl or Alt), so this has to be a page listener. */
(function () {
  'use strict';

  if (window.__SPEEDREADER_HOTKEY__) return;
  window.__SPEEDREADER_HOTKEY__ = true;

  function isEditable(node) {
    if (!node || node.nodeType !== 1) return false;
    var tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (node.isContentEditable) return true;
    return false;
  }

  window.addEventListener('keydown', function (event) {
    if (!event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key !== 'R' && event.key !== 'r') return;
    if (event.repeat) return;

    // The reader owns the keyboard once it's open.
    if (window.__SPEEDREADER_MOUNTED__) return;

    var path = event.composedPath ? event.composedPath() : [event.target];
    if (isEditable(path[0] || event.target) || isEditable(document.activeElement)) return;

    var selection = '';
    try {
      selection = window.getSelection ? String(window.getSelection()) : '';
    } catch (err) {
      selection = '';
    }
    if (!selection.trim()) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      chrome.runtime.sendMessage({ type: 'sr-start', text: selection }, function () {
        void chrome.runtime.lastError;   // the worker may answer after we're gone
      });
    } catch (err) {
      /* extension was reloaded out from under this page — nothing to do */
    }
  }, true);
})();
