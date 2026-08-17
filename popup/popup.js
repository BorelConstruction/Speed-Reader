/* SpeedReader — toolbar popup. */
(function () {
  'use strict';

  var Settings = self.SpeedReader.Settings;

  var readSelectionBtn = document.getElementById('read-selection');
  var selectionNote = document.getElementById('selection-note');
  var pasteBox = document.getElementById('paste');
  var readPasteBtn = document.getElementById('read-paste');
  var wpmRange = document.getElementById('wpm');
  var wpmOut = document.getElementById('wpm-out');
  var optionsBtn = document.getElementById('options');

  var currentTab = null;
  var selectionText = '';

  function send(message) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(message, function (response) {
        void chrome.runtime.lastError;
        resolve(response || {});
      });
    });
  }

  function preview(text) {
    var flat = text.replace(/\s+/g, ' ').trim();
    var words = flat ? flat.split(' ').length : 0;
    var snippet = flat.length > 46 ? flat.slice(0, 46).trimEnd() + '…' : flat;
    return words + (words === 1 ? ' word' : ' words') + ' · “' + snippet + '”';
  }

  /* --- speed slider (shared with every other surface) --- */

  Settings.load().then(function (settings) {
    wpmRange.value = settings.wpm;
    wpmOut.textContent = settings.wpm + ' wpm';
  });

  var saveTimer = null;

  function saveWpm() {
    clearTimeout(saveTimer);
    Settings.save({ wpm: parseInt(wpmRange.value, 10) });
  }

  wpmRange.addEventListener('input', function () {
    wpmOut.textContent = parseInt(wpmRange.value, 10) + ' wpm';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveWpm, 200);
  });
  // The popup can vanish mid-debounce, so commit on release and on close too.
  wpmRange.addEventListener('change', saveWpm);
  window.addEventListener('blur', saveWpm);

  /* --- selection on the active page --- */

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    currentTab = tabs && tabs[0] ? tabs[0] : null;

    if (!currentTab) {
      readSelectionBtn.disabled = true;
      selectionNote.textContent = 'No active tab.';
      return;
    }

    send({ type: 'sr-get-selection', tabId: currentTab.id }).then(function (response) {
      selectionText = (response && response.text) || '';
      if (selectionText.trim()) {
        selectionNote.textContent = preview(selectionText);
      } else {
        readSelectionBtn.disabled = true;
        selectionNote.textContent = 'Nothing selected on this page.';
        pasteBox.focus();
      }
    });
  });

  readSelectionBtn.addEventListener('click', function () {
    if (!currentTab) return;
    send({ type: 'sr-start-in-tab', tabId: currentTab.id, text: selectionText })
      .then(function () { window.close(); });
  });

  /* --- pasted text opens the full-page reader --- */

  function updatePasteButton() {
    readPasteBtn.disabled = !pasteBox.value.trim();
  }

  pasteBox.addEventListener('input', updatePasteButton);

  pasteBox.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      readPasteBtn.click();
    }
  });

  readPasteBtn.addEventListener('click', function () {
    var text = pasteBox.value;
    if (!text.trim()) return;
    chrome.storage.local.set({ pendingText: text }, function () {
      void chrome.runtime.lastError;
      chrome.tabs.create({ url: chrome.runtime.getURL('reader/reader.html') }, function () {
        window.close();
      });
    });
  });

  optionsBtn.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  updatePasteButton();

  /* Enter fires the primary action when the paste box isn't focused. */
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter' || event.target === pasteBox) return;
    if (!readSelectionBtn.disabled) {
      event.preventDefault();
      readSelectionBtn.click();
    }
  });
})();
