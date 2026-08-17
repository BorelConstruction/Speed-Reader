/* SpeedReader — the only script that runs on every page.
 *
 * Two jobs, both tiny: listen for Shift+R, and remember where you last
 * right-clicked. The reader itself is injected on demand by the service
 * worker. Chrome's commands API can't bind a bare Shift+R (it insists on Ctrl
 * or Alt), so the hotkey has to be a page listener. */
(function () {
  'use strict';

  if (window.__SPEEDREADER_HOTKEY__) return;
  window.__SPEEDREADER_HOTKEY__ = true;

  /* chrome.contextMenus.onClicked doesn't tell us where the click landed, so
   * stash it here; content/extract.js turns it into a text position. */
  window.addEventListener('contextmenu', function (event) {
    window.__SPEEDREADER_POINT__ = { x: event.clientX, y: event.clientY, at: Date.now() };
  }, true);

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

    var selection = null;
    try { selection = window.getSelection(); } catch (err) { selection = null; }

    var text = selection ? String(selection) : '';
    var message;

    if (text.trim()) {
      message = { type: 'sr-start', text: text };
    } else if (selection && selection.rangeCount &&
               selection.getRangeAt(0).startContainer.nodeType === 3) {
      // Nothing highlighted, but clicking on a page leaves a collapsed caret —
      // read from there to the end of the article instead of doing nothing.
      message = { type: 'sr-start-here' };
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      chrome.runtime.sendMessage(message, function () {
        void chrome.runtime.lastError;   // the worker may answer after we're gone
      });
    } catch (err) {
      /* extension was reloaded out from under this page — nothing to do */
    }
  }, true);
})();
