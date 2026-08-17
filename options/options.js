/* SpeedReader — options page. Drives the same settings store as the in-reader
 * gear panel, and previews the result with a real reader instance. */
(function () {
  'use strict';

  var NS = self.SpeedReader;
  var Settings = NS.Settings;

  var SAMPLE = [
    'Rapid serial visual presentation shows one word at a time in a fixed spot,',
    'so your eyes stop hopping across the line and simply hold still.',
    'The letter in red is the focal point of each word — keep your gaze on it.',
    'Everything around it stays faintly visible, so you never lose the thread.'
  ].join(' ');

  var SPEED_FIELD = {
    key: 'wpm',
    label: 'Reading speed',
    type: 'range',
    min: 100,
    max: 1000,
    step: 10,
    format: function (v) { return v + ' wpm'; }
  };

  var APPEARANCE_KEYS = [
    'readerWidth', 'fontSize', 'fontFamily', 'highlightColor',
    'showContext', 'contextOpacity', 'contextWords',
    'theme', 'backdropOpacity', 'showPivotLines'
  ];

  var READING_KEYS = ['showContext', 'contextWords'];

  function pick(keys) {
    return keys.map(function (key) {
      for (var i = 0; i < NS.FIELDS.length; i++) {
        if (NS.FIELDS[i].key === key) return NS.FIELDS[i];
      }
      return null;
    }).filter(Boolean);
  }

  var readingFields = [SPEED_FIELD].concat(pick(READING_KEYS));
  var appearanceFields = pick(APPEARANCE_KEYS.filter(function (key) {
    return READING_KEYS.indexOf(key) < 0;
  }));

  var settings = Object.assign({}, Settings.DEFAULTS);
  var preview = null;
  var syncers = [];
  var savedNote = document.getElementById('saved');
  var noteTimer = null;

  function get(key) { return settings[key]; }

  /* Debounced: dragging a slider fires an input event per pixel, and
   * chrome.storage.sync has a per-minute write quota. */
  var pendingSave = {};
  var saveTimer = null;

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!Object.keys(pendingSave).length) return;
    var patch = pendingSave;
    pendingSave = {};
    Settings.save(patch);
    flashSaved();
  }

  function set(key, value) {
    settings[key] = value;
    if (preview) preview.applySettings(settings);
    pendingSave[key] = value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 250);
  }

  window.addEventListener('beforeunload', flushSave);

  function flashSaved() {
    savedNote.textContent = 'Saved';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(function () { savedNote.textContent = ''; }, 1400);
  }

  function syncAll() { syncers.forEach(function (fn) { fn(); }); }

  Settings.load().then(function (loaded) {
    settings = loaded;

    syncers.push(NS.buildFields(document.getElementById('fields-reading'), readingFields, get, set));
    syncers.push(NS.buildFields(document.getElementById('fields-appearance'), appearanceFields, get, set));

    preview = NS.createReader(document.getElementById('preview'), {
      text: SAMPLE,
      settings: settings,
      embedded: true,
      minimal: true,
      loop: true
    });
  });

  document.getElementById('reset').addEventListener('click', function () {
    settings = Object.assign({}, Settings.DEFAULTS);
    Settings.reset();
    if (preview) preview.applySettings(settings);
    syncAll();
    flashSaved();
  });

  /* Keep in step if the gear panel in an open reader changes something.
   * The callback carries only the changed keys — merge, don't replace. */
  Settings.subscribe(function (patch) {
    Object.assign(settings, patch);
    if (preview) preview.applySettings(settings);
    syncAll();
  });
})();
