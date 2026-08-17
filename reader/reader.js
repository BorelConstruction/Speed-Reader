/* SpeedReader — the standalone reader tab, used for text pasted into the popup.
 * Same component as the in-page overlay, just opaque and full-screen. */
(function () {
  'use strict';

  var NS = self.SpeedReader;
  var host = document.getElementById('host');
  var fallback = document.getElementById('paste-fallback');
  var fallbackText = document.getElementById('fallback-text');
  var fallbackGo = document.getElementById('fallback-go');

  var active = null;

  function themeBackground(settings) {
    var dark = settings.theme === 'dark' ||
      (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.body.style.background = dark ? '#0a0c0f' : '#e9ebee';
    fallback.style.background = dark ? '#0a0c0f' : '#e9ebee';
    fallback.style.color = dark ? '#f2f4f7' : '#14171c';
  }

  function start(text) {
    NS.Settings.load().then(function (settings) {
      themeBackground(settings);
      fallback.classList.remove('show');
      if (active) active.destroy();
      active = NS.createReader(host, {
        text: text,
        settings: settings,
        fullPage: true,
        autoplay: false,        // same as the overlay: wait for Space or Play
        onClose: function () {
          active = null;
          // Ask the worker to close this tab; window.close() won't do it for a
          // tab created with chrome.tabs.create.
          chrome.runtime.sendMessage({ type: 'sr-close-tab' }, function () {
            void chrome.runtime.lastError;
          });
          // If the tab is still here a moment later, show the paste box rather
          // than leaving a blank page behind.
          setTimeout(showFallback, 250);
        }
      });
    });
  }

  function showFallback() {
    fallback.classList.add('show');
    fallbackText.focus();
  }

  fallbackGo.addEventListener('click', function () {
    var text = fallbackText.value;
    if (text.trim()) start(text);
  });

  fallbackText.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      fallbackGo.click();
    }
  });

  NS.Settings.load().then(themeBackground);

  chrome.storage.local.get({ pendingText: '' }, function (stored) {
    void chrome.runtime.lastError;
    var text = (stored && stored.pendingText) || '';
    // One-shot handoff: clear it so a refresh doesn't silently replay old text.
    chrome.storage.local.remove('pendingText', function () { void chrome.runtime.lastError; });

    if (text.trim()) {
      document.title = text.replace(/\s+/g, ' ').trim().slice(0, 40) + ' — SpeedReader';
      start(text);
    } else {
      showFallback();
    }
  });
})();
