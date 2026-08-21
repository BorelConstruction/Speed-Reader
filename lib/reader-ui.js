/* SpeedReader — the reader component.
 *
 * Renders into a shadow root so page styles can't reach it, and is used by all
 * three surfaces: the in-page overlay, the full-page reader tab, and the live
 * preview on the options page. */
(function () {
  'use strict';

  var NS = (self.SpeedReader = self.SpeedReader || {});

  var FONTS = {
    sans: '"Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif',
    serif: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
    mono: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Consolas, "Liberation Mono", monospace'
  };

  var ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.8" y="5.2" width="3.6" height="13.6" rx="1.2"/><rect x="13.6" y="5.2" width="3.6" height="13.6" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5.5" y="6" width="2.4" height="12" rx="1"/><path d="M19 6.6v10.8L10.2 12z"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="16.1" y="6" width="2.4" height="12" rx="1"/><path d="M5 6.6v10.8L13.8 12z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7.5h8.5M17.5 7.5H20M4 16.5h3.5M12.5 16.5H20"/><circle cx="15" cy="7.5" r="2.4"/><circle cx="10" cy="16.5" r="2.4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>'
  };

  /* ---------------------------------------------------------------- styles */

  var CSS = [
    ':host{all:initial;}',
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}',

    '.sr-root{',
    '  position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;',
    '  font-family:"Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;',
    '  font-size:14px;line-height:1.4;color:var(--sr-fg);-webkit-font-smoothing:antialiased;',
    '  --sr-width:720px;--sr-size:40px;--sr-hl:#e5484d;--sr-ctx-opacity:.32;--sr-backdrop-opacity:.88;',
    '  --sr-word-font:' + FONTS.sans + ';',
    '}',
    '.sr-root[data-theme="dark"]{--sr-bg:#0a0c0f;--sr-panel:#15181d;--sr-border:#272b33;--sr-fg:#f2f4f7;--sr-muted:#98a0ac;--sr-btn:#22262e;--sr-btn-hover:#2d323b;--sr-track:#2a2f38;--sr-tick:#4a5058;}',
    '.sr-root[data-theme="light"]{--sr-bg:#e9ebee;--sr-panel:#ffffff;--sr-border:#e0e4ea;--sr-fg:#14171c;--sr-muted:#697180;--sr-btn:#eef0f4;--sr-btn-hover:#e2e6ec;--sr-track:#e0e4ea;--sr-tick:#c2c8d1;}',

    '.sr-backdrop{position:absolute;inset:0;background:var(--sr-bg);opacity:var(--sr-backdrop-opacity);}',

    '.sr-panel{',
    '  position:relative;width:min(var(--sr-width),94vw);max-height:94vh;overflow:hidden;',
    '  background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:18px;',
    '  box-shadow:0 24px 70px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.18);',
    '  padding:20px 22px 14px;display:flex;flex-direction:column;gap:12px;',
    '}',

    /* --- the RSVP line --- */
    '.sr-stage{position:relative;padding:20px 0 24px;}',
    /* align-items:flex-start (not baseline) — an empty context span has no
     * baseline of its own, which would make the line jitter vertically. */
    '.sr-line{display:flex;align-items:flex-start;font-family:var(--sr-word-font);font-size:var(--sr-size);',
    '  line-height:1.3;height:calc(var(--sr-size) * 1.3);white-space:pre;}',
    '.sr-side{flex:1 1 0;min-width:0;position:relative;overflow:hidden;height:100%;color:var(--sr-fg);line-height:inherit;}',
    /* The runs are absolutely positioned and anchored to the edge that touches
     * the pivot. text-align + overflow would be shorter, but which side of an
     * overflowing line gets clipped is not something to bet the layout on —
     * anchoring means the text nearest the focal letter is always the text
     * that survives the clip. */
    '.sr-run{position:absolute;top:0;white-space:pre;line-height:inherit;}',
    '.sr-left .sr-run{right:0;}',
    '.sr-right .sr-run{left:0;}',
    '.sr-left{-webkit-mask-image:linear-gradient(to right,transparent 0,#000 30%);mask-image:linear-gradient(to right,transparent 0,#000 30%);}',
    '.sr-right{-webkit-mask-image:linear-gradient(to left,transparent 0,#000 30%);mask-image:linear-gradient(to left,transparent 0,#000 30%);}',
    '.sr-ctx-left,.sr-ctx-right{opacity:var(--sr-ctx-opacity);}',
    '.sr-word{color:var(--sr-fg);}',
    '.sr-focus{flex:0 0 auto;color:var(--sr-hl);line-height:inherit;}',
    /* Titles keep the weight the page gave them. Bolding shifts the width of
     * the run either side of the pivot, never the pivot itself. */
    '.sr-h{font-weight:700;}',

    '.sr-tick{position:absolute;left:50%;width:2px;border-radius:1px;background:var(--sr-tick);transform:translateX(-50%);}',
    '.sr-tick-top{top:2px;height:13px;}',
    '.sr-tick-bottom{bottom:6px;height:13px;}',
    '.sr-root.sr-no-ticks .sr-tick{display:none;}',

    /* --- progress --- */
    '.sr-progress{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--sr-muted);}',
    '.sr-count,.sr-eta{font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '.sr-track{position:relative;flex:1;height:16px;display:flex;align-items:center;cursor:pointer;touch-action:none;}',
    '.sr-track::before{content:"";position:absolute;left:0;right:0;height:5px;border-radius:999px;background:var(--sr-track);}',
    '.sr-fill{position:absolute;left:0;height:5px;border-radius:999px;background:var(--sr-hl);width:0;}',
    '.sr-knob{position:absolute;top:50%;width:12px;height:12px;border-radius:50%;background:var(--sr-hl);',
    '  transform:translate(-50%,-50%);box-shadow:0 0 0 3px var(--sr-panel);left:0;}',

    /* --- controls --- */
    '.sr-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}',
    '.sr-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;flex:none;',
    '  border:0;border-radius:10px;background:var(--sr-btn);color:var(--sr-fg);cursor:pointer;padding:0;font:inherit;}',
    '.sr-btn:hover{background:var(--sr-btn-hover);}',
    '.sr-btn:focus-visible{outline:2px solid var(--sr-hl);outline-offset:2px;}',
    '.sr-btn svg{width:19px;height:19px;}',
    '.sr-btn.sr-play{width:42px;height:42px;background:var(--sr-hl);color:#fff;}',
    '.sr-btn.sr-play svg{width:22px;height:22px;}',
    '.sr-btn.sr-play:hover{filter:brightness(1.08);}',
    '.sr-btn.sr-on{background:var(--sr-btn-hover);color:var(--sr-hl);}',
    '.sr-spacer{flex:1 1 12px;}',
    '.sr-speed{display:flex;align-items:center;gap:9px;flex:1 1 190px;min-width:150px;}',
    '.sr-speed input[type=range]{flex:1;min-width:80px;}',
    '.sr-wpm{font-variant-numeric:tabular-nums;font-size:12.5px;color:var(--sr-muted);white-space:nowrap;min-width:70px;text-align:right;}',
    '.sr-wpm b{color:var(--sr-fg);font-weight:600;}',

    'input[type=range]{-webkit-appearance:none;appearance:none;height:4px;border-radius:999px;background:var(--sr-track);accent-color:var(--sr-hl);cursor:pointer;}',
    'input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:13px;height:13px;border-radius:50%;background:var(--sr-hl);border:0;cursor:pointer;}',

    /* --- settings drawer --- */
    '.sr-settings{display:none;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:8px 22px;',
    '  border-top:1px solid var(--sr-border);padding:13px 2px 4px;margin-top:1px;max-height:44vh;overflow:auto;}',
    '.sr-root.sr-settings-open .sr-settings{display:grid;}',
    '.sr-field{display:grid;grid-template-columns:104px 1fr 50px;align-items:center;gap:9px;font-size:12.5px;min-height:26px;}',
    '.sr-field-label{color:var(--sr-muted);}',
    '.sr-field-value{color:var(--sr-muted);text-align:right;font-variant-numeric:tabular-nums;}',
    '.sr-field input[type=range]{width:100%;}',
    '.sr-field select{width:100%;font:inherit;font-size:12.5px;padding:3px 6px;border-radius:7px;',
    '  border:1px solid var(--sr-border);background:var(--sr-btn);color:var(--sr-fg);cursor:pointer;}',
    '.sr-field input[type=checkbox]{width:15px;height:15px;accent-color:var(--sr-hl);cursor:pointer;justify-self:start;}',
    '.sr-colour{display:flex;align-items:center;gap:7px;}',
    '.sr-colour input[type=color]{width:30px;height:24px;padding:0;border:1px solid var(--sr-border);border-radius:6px;background:none;cursor:pointer;}',
    '.sr-colour input[type=text]{width:84px;font:inherit;font-size:12px;padding:3px 6px;border-radius:6px;',
    '  border:1px solid var(--sr-border);background:var(--sr-btn);color:var(--sr-fg);font-variant-numeric:tabular-nums;}',
    '.sr-settings-foot{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:10px;',
    '  padding-top:6px;font-size:11.5px;color:var(--sr-muted);}',
    '.sr-link{background:none;border:0;padding:0;font:inherit;color:var(--sr-muted);text-decoration:underline;cursor:pointer;}',
    '.sr-link:hover{color:var(--sr-fg);}',

    '.sr-hint{font-size:11.5px;color:var(--sr-muted);text-align:center;padding-bottom:2px;}',
    '.sr-hint kbd{font:inherit;font-size:10.5px;background:var(--sr-btn);border:1px solid var(--sr-border);',
    '  border-radius:4px;padding:1px 5px;margin:0 1px;color:var(--sr-fg);}',

    /* --- embedded (options-page preview) --- */
    '.sr-root.sr-embedded{position:relative;inset:auto;z-index:auto;display:block;}',
    '.sr-root.sr-embedded .sr-backdrop{display:none;}',
    '.sr-root.sr-embedded .sr-panel{width:100%;max-height:none;box-shadow:none;}',
    '.sr-root.sr-minimal .sr-progress,.sr-root.sr-minimal .sr-controls,.sr-root.sr-minimal .sr-hint{display:none;}',
    '.sr-root.sr-minimal .sr-panel{padding-bottom:6px;}'
  ].join('\n');

  /* ------------------------------------------------------- settings fields */

  var pct = function (v) { return Math.round(v * 100) + '%'; };
  var px = function (v) { return Math.round(v) + 'px'; };

  var FIELDS = [
    { key: 'readerWidth', label: 'Reader width', type: 'range', min: 320, max: 1400, step: 20, format: px },
    { key: 'fontSize', label: 'Font size', type: 'range', min: 16, max: 96, step: 1, format: px },
    { key: 'fontFamily', label: 'Font', type: 'select', options: [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { key: 'highlightColor', label: 'Highlight', type: 'colour' },
    { key: 'showContext', label: 'Show context', type: 'check' },
    { key: 'contextOpacity', label: 'Context dim', type: 'range', min: 0.05, max: 0.8, step: 0.01, format: pct },
    { key: 'contextWords', label: 'Context words', type: 'range', min: 0, max: 30, step: 1, format: String },
    { key: 'theme', label: 'Theme', type: 'select', options: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] },
    { key: 'backdropOpacity', label: 'Backdrop dim', type: 'range', min: 0, max: 1, step: 0.01, format: pct },
    { key: 'showPivotLines', label: 'Pivot marks', type: 'check' }
  ];

  /* Builds a labelled control per field. `get(key)` reads the current value,
   * `set(key, value)` writes it. Returns a sync() that refreshes every input. */
  function buildFields(container, fields, get, set) {
    var doc = container.ownerDocument;
    var rootNode = container.getRootNode ? container.getRootNode() : doc;
    var syncers = [];

    fields.forEach(function (field) {
      var row = doc.createElement('div');
      row.className = 'sr-field';

      var label = doc.createElement('label');
      label.className = 'sr-field-label';
      label.textContent = field.label;
      row.appendChild(label);

      var valueCell = doc.createElement('span');
      valueCell.className = 'sr-field-value';

      var input;
      var hex;

      if (field.type === 'range') {
        input = doc.createElement('input');
        input.type = 'range';
        input.min = field.min;
        input.max = field.max;
        input.step = field.step;
        input.addEventListener('input', function () {
          var v = field.step < 1 ? parseFloat(input.value) : parseInt(input.value, 10);
          set(field.key, v);
          valueCell.textContent = field.format ? field.format(v) : String(v);
        });
        row.appendChild(input);
        row.appendChild(valueCell);
      } else if (field.type === 'select') {
        input = doc.createElement('select');
        field.options.forEach(function (pair) {
          var opt = doc.createElement('option');
          opt.value = pair[0];
          opt.textContent = pair[1];
          input.appendChild(opt);
        });
        input.addEventListener('change', function () { set(field.key, input.value); });
        row.appendChild(input);
        row.appendChild(valueCell);
      } else if (field.type === 'check') {
        input = doc.createElement('input');
        input.type = 'checkbox';
        input.addEventListener('change', function () { set(field.key, input.checked); });
        row.appendChild(input);
        row.appendChild(valueCell);
      } else if (field.type === 'colour') {
        var wrap = doc.createElement('div');
        wrap.className = 'sr-colour';
        input = doc.createElement('input');
        input.type = 'color';
        hex = doc.createElement('input');
        hex.type = 'text';
        hex.spellcheck = false;
        hex.setAttribute('aria-label', field.label + ' hex value');
        input.addEventListener('input', function () {
          hex.value = input.value;
          set(field.key, input.value);
        });
        hex.addEventListener('input', function () {
          var v = hex.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) {
            input.value = v;
            set(field.key, v);
          }
        });
        wrap.appendChild(input);
        wrap.appendChild(hex);
        row.appendChild(wrap);
        row.appendChild(valueCell);
      }

      label.addEventListener('click', function () { if (input) input.focus(); });

      syncers.push(function () {
        var v = get(field.key);
        if (field.type === 'check') {
          input.checked = !!v;
        } else if (field.type === 'colour') {
          input.value = v;
          if (rootNode.activeElement !== hex) hex.value = v;   // don't fight the typist
        } else {
          input.value = v;
          if (field.type === 'range') valueCell.textContent = field.format ? field.format(v) : String(v);
        }
      });

      container.appendChild(row);
    });

    var sync = function () { syncers.forEach(function (fn) { fn(); }); };
    sync();
    return sync;
  }

  /* --------------------------------------------------------------- reader */

  /* options: { text, settings, onClose, fullPage, embedded, minimal, loop,
   *            autoplay, openOptions } */
  NS.createReader = function createReader(host, options) {
    var opts = options || {};
    var doc = host.ownerDocument;
    var Rsvp = NS.Rsvp;
    var Settings = NS.Settings;

    var settings = Object.assign({}, Settings.DEFAULTS, Settings.normalize(opts.settings || {}));
    var embedded = !!opts.embedded;
    var minimal = !!opts.minimal;
    var fullPage = !!opts.fullPage;
    var loop = !!opts.loop;

    var docModel = Rsvp.tokenize(opts.text || '');
    var tokens = docModel.tokens;
    var index = 0;
    var playing = false;
    var timer = null;
    var destroyed = false;
    var unsubscribe = null;
    var saveTimer = null;
    var pendingSave = {};
    var previousOverflow = null;

    var root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    root.innerHTML = '';

    var style = doc.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    var wrap = doc.createElement('div');
    wrap.className = 'sr-root' + (embedded ? ' sr-embedded' : '') + (minimal ? ' sr-minimal' : '');
    wrap.innerHTML = [
      '<div class="sr-backdrop"></div>',
      '<div class="sr-panel" role="dialog" aria-modal="true" aria-label="SpeedReader">',
      '  <div class="sr-stage">',
      '    <div class="sr-tick sr-tick-top"></div>',
      '    <div class="sr-line">',
      '      <div class="sr-side sr-left"><span class="sr-run"><span class="sr-ctx-left"></span><span class="sr-word sr-pre"></span></span></div>',
      '      <div class="sr-focus"></div>',
      '      <div class="sr-side sr-right"><span class="sr-run"><span class="sr-word sr-post"></span><span class="sr-ctx-right"></span></span></div>',
      '    </div>',
      '    <div class="sr-tick sr-tick-bottom"></div>',
      '  </div>',
      '  <div class="sr-progress">',
      '    <span class="sr-count">0 / 0</span>',
      '    <div class="sr-track" role="slider" tabindex="0" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">',
      '      <div class="sr-fill"></div><div class="sr-knob"></div>',
      '    </div>',
      '    <span class="sr-eta">0:00</span>',
      '  </div>',
      '  <div class="sr-controls">',
      '    <button class="sr-btn sr-prev" type="button" title="Previous sentence (Up)" aria-label="Previous sentence"></button>',
      '    <button class="sr-btn sr-play" type="button" title="Play / pause (Space)" aria-label="Play"></button>',
      '    <button class="sr-btn sr-next" type="button" title="Next sentence (Down)" aria-label="Next sentence"></button>',
      '    <div class="sr-speed">',
      '      <input class="sr-wpm-range" type="range" min="100" max="1000" step="10" aria-label="Words per minute">',
      '      <span class="sr-wpm"><b>350</b> wpm</span>',
      '    </div>',
      '    <button class="sr-btn sr-gear" type="button" title="Appearance" aria-label="Appearance"></button>',
      '    <button class="sr-btn sr-close" type="button" title="Close (Esc)" aria-label="Close"></button>',
      '  </div>',
      '  <div class="sr-settings"></div>',
      '  <div class="sr-hint"><kbd>space</kbd> play &middot; <kbd>a</kbd><kbd>s</kbd> speed &middot;',
      '    <kbd>&larr;</kbd><kbd>&rarr;</kbd> word &middot; <kbd>&uarr;</kbd><kbd>&darr;</kbd> sentence &middot; <kbd>esc</kbd> close</div>',
      '</div>'
    ].join('');
    root.appendChild(wrap);

    var $ = function (sel) { return wrap.querySelector(sel); };

    var ctxLeft = $('.sr-ctx-left');
    var ctxRight = $('.sr-ctx-right');
    var preEl = $('.sr-pre');
    var postEl = $('.sr-post');
    var focusEl = $('.sr-focus');
    var countEl = $('.sr-count');
    var etaEl = $('.sr-eta');
    var trackEl = $('.sr-track');
    var fillEl = $('.sr-fill');
    var knobEl = $('.sr-knob');
    var playBtn = $('.sr-play');
    var prevBtn = $('.sr-prev');
    var nextBtn = $('.sr-next');
    var gearBtn = $('.sr-gear');
    var closeBtn = $('.sr-close');
    var wpmRange = $('.sr-wpm-range');
    var wpmLabel = $('.sr-wpm b');
    var settingsBox = $('.sr-settings');

    prevBtn.innerHTML = ICONS.prev;
    nextBtn.innerHTML = ICONS.next;
    gearBtn.innerHTML = ICONS.gear;
    closeBtn.innerHTML = ICONS.close;
    playBtn.innerHTML = ICONS.play;

    if (embedded) {
      closeBtn.style.display = 'none';
      var panel = $('.sr-panel');
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }

    /* ------------------------------------------------------------ styling */

    var media = null;
    try { media = self.matchMedia('(prefers-color-scheme: dark)'); } catch (err) { media = null; }

    function resolvedTheme() {
      if (settings.theme !== 'auto') return settings.theme;
      return media && media.matches ? 'dark' : 'light';
    }

    function applyStyle() {
      wrap.dataset.theme = resolvedTheme();
      wrap.style.setProperty('--sr-width', settings.readerWidth + 'px');
      wrap.style.setProperty('--sr-size', settings.fontSize + 'px');
      wrap.style.setProperty('--sr-hl', settings.highlightColor);
      wrap.style.setProperty('--sr-ctx-opacity', settings.showContext ? String(settings.contextOpacity) : '0');
      wrap.style.setProperty('--sr-backdrop-opacity', fullPage ? '1' : String(settings.backdropOpacity));
      wrap.style.setProperty('--sr-word-font', FONTS[settings.fontFamily] || FONTS.sans);
      wrap.classList.toggle('sr-no-ticks', !settings.showPivotLines);
      wpmRange.value = settings.wpm;
      wpmLabel.textContent = settings.wpm;
    }

    function onMediaChange() { if (settings.theme === 'auto') applyStyle(); }
    if (media && media.addEventListener) media.addEventListener('change', onMediaChange);

    /* ----------------------------------------------------------- rendering */

    /* One span per token rather than one string per side, so a heading stays
     * bold after it has drifted out into the dimmed context.
     *   lead / tail — separators owned by the caller (the gap to the focused
     *                 word, which depends on hyphenation).
     *   joinsFocus  — the final token is an earlier chunk of the word we're on,
     *                 so its hyphen goes: the rest of the word is right there. */
    function fillContext(el, list, lead, tail, joinsFocus) {
      el.textContent = '';
      if (!list.length) return;

      var frag = doc.createDocumentFragment();

      for (var i = 0; i < list.length; i++) {
        var token = list[i];
        var next = list[i + 1];
        var piece = token.text;

        if (/-$/.test(piece) && (next ? next.wordIndex === token.wordIndex : joinsFocus)) {
          piece = piece.slice(0, -1);
        } else if (next) {
          piece += ' ';
        }

        if (i === 0) piece = lead + piece;
        if (!next) piece += tail;

        var span = doc.createElement('span');
        if (token.heading) span.className = 'sr-h';
        span.textContent = piece;
        frag.appendChild(span);
      }

      el.appendChild(frag);
    }

    function render() {
      var token = tokens[index];

      if (!token) {
        ctxLeft.textContent = '';
        ctxRight.textContent = '';
        preEl.textContent = '';
        focusEl.textContent = '';
        postEl.textContent = 'Nothing to read';
        countEl.textContent = '0 / 0';
        etaEl.textContent = '0:00';
        return;
      }

      var text = token.text;
      preEl.textContent = text.slice(0, token.focus);
      focusEl.textContent = text.charAt(token.focus);
      postEl.textContent = text.slice(token.focus + 1);

      var heading = !!token.heading;
      preEl.classList.toggle('sr-h', heading);
      focusEl.classList.toggle('sr-h', heading);
      postEl.classList.toggle('sr-h', heading);

      var span = settings.showContext ? settings.contextWords : 0;
      if (span > 0) {
        var previous = tokens[index - 1];
        var joinsFocus = !!(previous && previous.wordIndex === token.wordIndex);

        fillContext(ctxLeft, tokens.slice(Math.max(0, index - span), index),
                    '', joinsFocus ? '' : ' ', joinsFocus);
        fillContext(ctxRight, tokens.slice(index + 1, index + 1 + span),
                    /-$/.test(text) ? '' : ' ', '', false);
      } else {
        ctxLeft.textContent = '';
        ctxRight.textContent = '';
      }

      var ratio = tokens.length > 1 ? index / (tokens.length - 1) : 1;
      fillEl.style.width = (ratio * 100).toFixed(2) + '%';
      knobEl.style.left = (ratio * 100).toFixed(2) + '%';
      trackEl.setAttribute('aria-valuenow', Math.round(ratio * 100));
      countEl.textContent = (token.wordIndex + 1) + ' / ' + docModel.wordCount;
      etaEl.textContent = Rsvp.formatTime(Rsvp.remainingMs(docModel, index, settings.wpm));
    }

    /* ------------------------------------------------------------ playback */

    function setPlaying(next) {
      playing = next;
      playBtn.innerHTML = next ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', next ? 'Pause' : 'Play');
    }

    function stopTimer() {
      if (timer !== null) { clearTimeout(timer); timer = null; }
    }

    /* Re-armed per word rather than using setInterval, so punctuation pauses
     * and speed changes both take effect on the very next word. */
    function schedule() {
      stopTimer();
      if (!playing || !tokens.length) return;
      timer = setTimeout(function () {
        timer = null;
        if (index >= tokens.length - 1) {
          if (loop) { index = 0; render(); schedule(); return; }
          setPlaying(false);
          return;
        }
        index++;
        render();
        schedule();
      }, Rsvp.delayFor(tokens[index], settings.wpm));
    }

    function play() {
      if (!tokens.length) return;
      if (index >= tokens.length - 1) index = 0;   // replay from the top
      setPlaying(true);
      render();
      schedule();
    }

    function pause() {
      setPlaying(false);
      stopTimer();
    }

    function toggle() { if (playing) pause(); else play(); }

    function gotoIndex(next, keepPlaying) {
      if (!tokens.length) return;
      index = Rsvp.clamp(Math.round(next), 0, tokens.length - 1);
      render();
      if (playing && keepPlaying !== false) schedule();
    }

    function step(delta) { pause(); gotoIndex(index + delta); }

    /* ------------------------------------------------------------ settings */

    /* Debounced so dragging a slider doesn't blow through chrome.storage.sync's
     * write quota; the pending patch accumulates so no key gets dropped. */
    function flushSave() {
      clearTimeout(saveTimer);
      saveTimer = null;
      var keys = Object.keys(pendingSave);
      if (!keys.length) return;
      var patch = pendingSave;
      pendingSave = {};
      Settings.save(patch);
    }

    function persist(patch) {
      Object.assign(settings, patch);
      applyStyle();
      render();
      if (embedded) return;                 // the preview never writes to storage
      Object.assign(pendingSave, patch);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, 220);
    }

    function setWpm(value) {
      var next = Rsvp.clamp(Math.round(value / 5) * 5, 100, 1000);
      if (next === settings.wpm) return;
      persist({ wpm: next });               // no reschedule: applies to the next word
    }

    var syncFields = buildFields(
      settingsBox,
      FIELDS,
      function (key) { return settings[key]; },
      function (key, value) {
        var patch = {};
        patch[key] = value;
        persist(patch);
      }
    );

    var foot = doc.createElement('div');
    foot.className = 'sr-settings-foot';
    var resetBtn = doc.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sr-link';
    resetBtn.textContent = 'Reset to defaults';
    resetBtn.addEventListener('click', function () {
      var patch = {};
      Object.keys(Settings.DEFAULTS).forEach(function (key) {
        if (key !== 'wpm') patch[key] = Settings.DEFAULTS[key];
      });
      persist(patch);
      syncFields();
    });
    var note = doc.createElement('span');
    note.textContent = 'Settings are shared with the options page.';
    foot.appendChild(resetBtn);
    foot.appendChild(note);
    settingsBox.appendChild(foot);

    /* ------------------------------------------------------------- wiring */

    playBtn.addEventListener('click', toggle);
    prevBtn.addEventListener('click', function () { gotoIndex(Rsvp.sentenceBack(docModel, index)); });
    nextBtn.addEventListener('click', function () { gotoIndex(Rsvp.sentenceForward(docModel, index)); });
    gearBtn.addEventListener('click', function () {
      var open = wrap.classList.toggle('sr-settings-open');
      gearBtn.classList.toggle('sr-on', open);
      if (open) syncFields();
    });
    closeBtn.addEventListener('click', function () { destroy(); });

    wpmRange.addEventListener('input', function () { setWpm(parseInt(wpmRange.value, 10)); });

    var dragging = false;
    var resumeAfterDrag = false;

    function seekFromEvent(event) {
      var rect = trackEl.getBoundingClientRect();
      if (!rect.width) return;
      var ratio = Rsvp.clamp((event.clientX - rect.left) / rect.width, 0, 1);
      gotoIndex(ratio * (tokens.length - 1), false);
    }

    trackEl.addEventListener('pointerdown', function (event) {
      if (!tokens.length) return;
      dragging = true;
      resumeAfterDrag = playing;
      pause();
      try { trackEl.setPointerCapture(event.pointerId); } catch (err) { /* ignore */ }
      seekFromEvent(event);
      event.preventDefault();
    });
    trackEl.addEventListener('pointermove', function (event) {
      if (dragging) seekFromEvent(event);
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      if (resumeAfterDrag) play();
    }
    trackEl.addEventListener('pointerup', endDrag);
    trackEl.addEventListener('pointercancel', endDrag);

    /* --------------------------------------------------------- keyboard */

    function isEditableTarget(node) {
      if (!node || node.nodeType !== 1) return false;
      var tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable === true;
    }

    function onKeyDown(event) {
      if (destroyed) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      var path = event.composedPath ? event.composedPath() : [event.target];
      var target = path[0] || event.target;
      var editing = isEditableTarget(target);

      var key = event.key;
      var handled = true;

      if (editing && key !== 'Escape') return;

      switch (key) {
        case ' ':
        case 'Spacebar':
          toggle();
          break;
        case 'ArrowRight':
          step(1);
          break;
        case 'ArrowLeft':
          step(-1);
          break;
        case 'ArrowUp':
          pause();
          gotoIndex(Rsvp.sentenceBack(docModel, index));
          break;
        case 'ArrowDown':
          pause();
          gotoIndex(Rsvp.sentenceForward(docModel, index));
          break;
        case 'Home':
          pause();
          gotoIndex(0);
          break;
        case 'End':
          pause();
          gotoIndex(tokens.length - 1);
          break;
        case 'Escape':
          destroy();
          break;
        default:
          var lower = typeof key === 'string' ? key.toLowerCase() : '';
          if (lower === 'a') setWpm(settings.wpm - (event.shiftKey ? 100 : 25));
          else if (lower === 's') setWpm(settings.wpm + (event.shiftKey ? 100 : 25));
          else handled = false;
      }

      if (!handled) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }

    if (!embedded) {
      doc.addEventListener('keydown', onKeyDown, true);
      previousOverflow = doc.documentElement.style.overflow;
      doc.documentElement.style.overflow = 'hidden';
    }

    /* Live-apply changes made on the options page while this reader is open. */
    if (!embedded) {
      unsubscribe = Settings.subscribe(function (patch) {
        Object.assign(settings, patch);   // patch carries only what changed
        applyStyle();
        render();
        syncFields();
      });
    }

    /* ---------------------------------------------------------- lifecycle */

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      stopTimer();
      if (!embedded) flushSave();   // don't lose a speed change to a quick Esc
      if (media && media.removeEventListener) media.removeEventListener('change', onMediaChange);
      if (!embedded) {
        doc.removeEventListener('keydown', onKeyDown, true);
        doc.documentElement.style.overflow = previousOverflow || '';
      }
      if (unsubscribe) unsubscribe();

      // Hand back where the reading stopped, so the page can mark the spot.
      if (typeof opts.onStop === 'function' && tokens.length) {
        var stopped = tokens[Rsvp.clamp(index, 0, tokens.length - 1)];
        try {
          opts.onStop(stopped.wordIndex, stopped.raw || stopped.text);
        } catch (err) { /* never let a bookmark stop the reader closing */ }
      }

      if (typeof opts.onClose === 'function') opts.onClose();
    }

    applyStyle();
    render();
    if (opts.autoplay !== false && tokens.length) play();
    if (!embedded) setTimeout(function () { try { playBtn.focus(); } catch (err) { /* ignore */ } }, 0);

    return {
      play: play,
      pause: pause,
      toggle: toggle,
      gotoIndex: gotoIndex,
      destroy: destroy,
      applySettings: function (patch) {
        Object.assign(settings, Settings.normalize(Object.assign({}, settings, patch)));
        applyStyle();
        render();
        syncFields();
      },
      setText: function (text) {
        pause();
        docModel = Rsvp.tokenize(text || '');
        tokens = docModel.tokens;
        index = 0;
        render();
      }
    };
  };

  NS.FIELDS = FIELDS;
  NS.buildFields = buildFields;
  NS.READER_CSS = CSS;
  NS.FONTS = FONTS;
})();
