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

  /* Each theme's window and text colours. Kept here rather than only in the
   * CSS because a custom window colour borrows whichever ink reads on it. */
  var THEME_PANEL = { dark: '#15181d', light: '#ffffff' };
  var THEME_INK = { dark: '#f2f4f7', light: '#14171c' };

  /* ← and → move this many words a press; with Shift, one. A word at a time
   * turned out too slow to get anywhere. */
  var WORD_STEP = 2;

  /* A second ↑ within this long of the first goes back a sentence further. */
  var BACK_AGAIN_MS = 1200;

  /* One click of a mouse wheel moves as far as one press of →. A trackpad's
   * stream of small deltas moves at the rate of a click at 100% zoom, which
   * Chrome reports as 100px. A pause this long between events starts a fresh
   * gesture. */
  var WHEEL_CLICK_PX = 100;
  var WHEEL_PX_PER_WORD = WHEEL_CLICK_PX / WORD_STEP;
  var WHEEL_GESTURE_MS = 250;
  var WHEEL_MUTE_MS = 1500;    // longest a trackpad's momentum is ignored after play()

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
    '  --sr-pause-lines:3;--sr-peek-size:max(13px,calc(var(--sr-size) * .5));--sr-peek-lh:calc(var(--sr-peek-size) * 1.6);',
    '}',
    '.sr-root[data-theme="dark"]{--sr-bg:#0a0c0f;--sr-panel:' + THEME_PANEL.dark + ';--sr-border:#272b33;--sr-fg:' + THEME_INK.dark + ';',
    '  --sr-muted:#98a0ac;--sr-btn:#22262e;--sr-btn-hover:#2d323b;--sr-track:#2a2f38;--sr-tick:#4a5058;}',
    '.sr-root[data-theme="light"]{--sr-bg:#e9ebee;--sr-panel:' + THEME_PANEL.light + ';--sr-border:#e0e4ea;--sr-fg:' + THEME_INK.light + ';',
    '  --sr-muted:#697180;--sr-btn:#eef0f4;--sr-btn-hover:#e2e6ec;--sr-track:#e0e4ea;--sr-tick:#c2c8d1;}',
    /* A window colour of the user's own. --sr-panel and --sr-fg arrive inline
     * from applyStyle(); everything else on the window is mixed from those two
     * in the same proportions the stock themes use, so buttons, borders and the
     * progress track sit on any colour the way they sit on white or charcoal.
     * The backdrop stays the theme's. */
    '.sr-root.sr-custom-panel{',
    '  --sr-muted:color-mix(in srgb,var(--sr-fg) 60%,var(--sr-panel));',
    '  --sr-border:color-mix(in srgb,var(--sr-fg) 10%,var(--sr-panel));',
    '  --sr-btn:color-mix(in srgb,var(--sr-fg) 7%,var(--sr-panel));',
    '  --sr-btn-hover:color-mix(in srgb,var(--sr-fg) 12%,var(--sr-panel));',
    '  --sr-track:color-mix(in srgb,var(--sr-fg) 11%,var(--sr-panel));',
    '  --sr-tick:color-mix(in srgb,var(--sr-fg) 24%,var(--sr-panel));}',

    '.sr-backdrop{position:absolute;inset:0;background:var(--sr-bg);opacity:var(--sr-backdrop-opacity);}',

    '.sr-panel{',
    '  position:relative;width:min(var(--sr-width),94vw);max-height:94vh;overflow:hidden;',
    '  background:var(--sr-panel);border:1px solid var(--sr-border);border-radius:18px;',
    '  box-shadow:0 24px 70px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.18);',
    '  padding:20px 22px 14px;display:flex;flex-direction:column;gap:12px;',
    '}',

    /* --- the RSVP line --- */
    '.sr-stage{position:relative;padding:20px 0 24px;min-height:calc(var(--sr-size) * 1.3 + 44px);transition:min-height .2s ease;}',
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
    /* Titles, and words the page set in bold, keep that weight. Bolding shifts
     * the width of the run either side of the pivot, never the pivot itself. */
    '.sr-bold{font-weight:700;}',
    /* Paragraph marks. The kind lives in data-pmark on the root, so changing the
     * setting restyles every mark on screen at once. Drawn in the text colour,
     * not literally black, so they survive the dark theme.
     * Per-kind rules set only size, shape and content — never display, which
     * the .sr-para-mark rules below own. At this specificity a display here
     * would pin the focused word's mark on permanently. */
    '.sr-mark{display:inline-block;margin:0 .22em;color:var(--sr-fg);}',
    '.sr-root[data-pmark="pilcrow"] .sr-mark::before{content:"\\00B6";}',
    '.sr-root[data-pmark="section"] .sr-mark::before{content:"\\00A7";}',
    '.sr-root[data-pmark="dot"] .sr-mark{width:.34em;height:.34em;vertical-align:.1em;',
    '  border-radius:50%;background:var(--sr-fg);}',
    '.sr-root[data-pmark="triangle"] .sr-mark{width:.42em;height:.5em;vertical-align:.03em;background:var(--sr-fg);',
    '  -webkit-clip-path:polygon(0 0,100% 50%,0 100%);clip-path:polygon(0 0,100% 50%,0 100%);}',
    '.sr-root[data-pmark="bar"] .sr-mark{width:1.15em;height:.14em;vertical-align:.3em;',
    '  border-radius:1px;background:var(--sr-fg);}',
    /* The one belonging to the focused word sits outside the dimmed context
     * run, so it stays at full strength — and still shows with context off. */
    '.sr-para-mark{display:none;}',
    '.sr-para-mark.sr-on{display:inline-block;}',

    '.sr-tick{position:absolute;left:50%;width:2px;border-radius:1px;background:var(--sr-tick);transform:translateX(-50%);}',
    '.sr-tick-top{top:2px;height:13px;}',
    '.sr-tick-bottom{bottom:6px;height:13px;}',
    '.sr-root.sr-no-ticks .sr-tick{display:none;}',

    /* --- pause view ---
     * Shared by both layouts: the surrounding passage as ordinary wrapped
     * prose, in a smaller font, with the current word marked. */
    '.sr-flow{font-family:var(--sr-word-font);font-size:var(--sr-peek-size);line-height:var(--sr-peek-lh);',
    '  color:var(--sr-muted);white-space:normal;}',
    '.sr-flow p + p{margin-top:.45em;}',
    '.sr-flow .sr-w{cursor:pointer;border-radius:4px;}',
    '.sr-flow .sr-w:hover{color:var(--sr-fg);}',
    '.sr-flow .sr-cur{color:var(--sr-fg);font-weight:600;',
    '  background:color-mix(in srgb,var(--sr-hl) 18%,transparent);box-shadow:0 0 0 2px color-mix(in srgb,var(--sr-hl) 18%,transparent);}',
    '.sr-flow .sr-cur .sr-cur-focus{color:var(--sr-hl);}',
    '.sr-line,.sr-tick,.sr-ctx-left,.sr-ctx-right{transition:opacity .15s ease;}',
    '.sr-root.sr-paused .sr-tick{opacity:0;}',

    /* "Show text": the passage replaces the line, centred on the current
     * word's line. The stage grows to (2n + 1) lines. */
    '.sr-peek{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);overflow:hidden;',
    '  height:calc(var(--sr-peek-lh) * (2 * var(--sr-pause-lines) + 1));opacity:0;visibility:hidden;',
    '  transition:opacity .18s ease,visibility 0s .18s;',
    '  -webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 12%,#000 88%,transparent 100%);',
    '          mask-image:linear-gradient(to bottom,transparent 0,#000 12%,#000 88%,transparent 100%);}',
    '.sr-peek .sr-flow{position:absolute;left:0;right:0;top:0;}',
    '.sr-root.sr-paused[data-pause="text"] .sr-stage{',
    '  min-height:max(calc(var(--sr-size) * 1.3 + 44px),calc(var(--sr-peek-lh) * (2 * var(--sr-pause-lines) + 1) + 20px));}',
    '.sr-root.sr-paused[data-pause="text"] .sr-line{opacity:0;}',
    '.sr-root.sr-paused[data-pause="text"] .sr-peek{opacity:1;visibility:visible;transition:opacity .18s ease;}',

    /* "Text around word": the word stays put; what came before fades in
     * above it and what follows below. The panel is centred, so growing
     * evenly above and below leaves the word where it was on screen. */
    '.sr-around{position:relative;height:0;overflow:hidden;opacity:0;',
    '  transition:height .2s ease,margin .2s ease,opacity .18s ease;}',
    '.sr-around .sr-flow{position:absolute;left:0;right:0;}',
    '.sr-before .sr-flow{bottom:0;}',
    '.sr-after .sr-flow{top:0;}',
    '.sr-before{-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 45%);mask-image:linear-gradient(to bottom,transparent 0,#000 45%);}',
    '.sr-after{-webkit-mask-image:linear-gradient(to top,transparent 0,#000 45%);mask-image:linear-gradient(to top,transparent 0,#000 45%);}',
    '.sr-root.sr-paused[data-pause="pinned"] .sr-around{height:calc(var(--sr-peek-lh) * var(--sr-pause-lines));opacity:1;}',
    '.sr-root.sr-paused[data-pause="pinned"] .sr-before{margin-bottom:10px;}',
    '.sr-root.sr-paused[data-pause="pinned"] .sr-after{margin-top:10px;}',
    /* The flow above and below already holds those words. */
    '.sr-root.sr-paused[data-pause="pinned"] .sr-ctx-left,.sr-root.sr-paused[data-pause="pinned"] .sr-ctx-right{opacity:0;}',

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
    /* 280px: the narrowest column a colour row (swatch, hex box, Reset) fits. */
    '.sr-settings{display:none;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:8px 22px;',
    '  border-top:1px solid var(--sr-border);padding:13px 2px 4px;margin-top:1px;max-height:44vh;overflow:auto;}',
    '.sr-root.sr-settings-open .sr-settings{display:grid;}',
    '.sr-field{display:grid;grid-template-columns:104px minmax(0,1fr) 50px;align-items:center;gap:9px;font-size:12.5px;min-height:26px;}',
    '.sr-field-label{color:var(--sr-muted);}',
    '.sr-field-value{color:var(--sr-muted);text-align:right;font-variant-numeric:tabular-nums;}',
    '.sr-field input[type=range]{width:100%;}',
    '.sr-field select{width:100%;font:inherit;font-size:12.5px;padding:3px 6px;border-radius:7px;',
    '  border:1px solid var(--sr-border);background:var(--sr-btn);color:var(--sr-fg);cursor:pointer;}',
    '.sr-field input[type=checkbox]{width:15px;height:15px;accent-color:var(--sr-hl);cursor:pointer;justify-self:start;}',
    /* The hex box gives way before the row overflows, so Reset stays in view. */
    '.sr-colour{display:flex;align-items:center;gap:7px;min-width:0;}',
    '.sr-colour input[type=color]{flex:none;width:30px;height:24px;padding:0;border:1px solid var(--sr-border);border-radius:6px;background:none;cursor:pointer;}',
    '.sr-colour input[type=text]{flex:0 1 84px;width:84px;min-width:0;font:inherit;font-size:12px;padding:3px 6px;border-radius:6px;',
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

  function resolveTheme(theme) {
    if (theme === 'dark' || theme === 'light') return theme;
    try {
      return self.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (err) {
      return 'light';
    }
  }

  /* WCAG relative luminance of a '#rrggbb' colour. */
  function luminance(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lin = function (c) {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  }

  /* Whichever theme's text colour has more contrast against `background`. */
  function inkFor(background) {
    var bg = luminance(background);
    var contrast = function (ink) {
      var l = luminance(ink);
      return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
    };
    return contrast(THEME_INK.light) >= contrast(THEME_INK.dark) ? THEME_INK.light : THEME_INK.dark;
  }

  var FIELDS = [
    { key: 'readerWidth', label: 'Reader width', type: 'range', min: 320, max: 1400, step: 20, format: px },
    { key: 'fontSize', label: 'Font size', type: 'range', min: 16, max: 96, step: 1, format: px },
    { key: 'fontFamily', label: 'Font', type: 'select', options: [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']] },
    { key: 'highlightColor', label: 'Highlight', type: 'colour' },
    { key: 'showContext', label: 'Show context', type: 'check' },
    { key: 'contextOpacity', label: 'Context dim', type: 'range', min: 0.05, max: 0.8, step: 0.01, format: pct },
    { key: 'contextWords', label: 'Context words', type: 'range', min: 0, max: 30, step: 1, format: String },
    { key: 'theme', label: 'Theme', type: 'select', options: [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']] },
    // Optional: '' means the theme's own window colour, which the swatch shows.
    { key: 'panelColor', label: 'Window colour', type: 'colour', optional: true,
      fallback: function (get) { return THEME_PANEL[resolveTheme(get('theme'))]; } },
    { key: 'backdropOpacity', label: 'Backdrop dim', type: 'range', min: 0, max: 1, step: 0.01, format: pct },
    { key: 'showPivotLines', label: 'Pivot marks', type: 'check' },
    { key: 'paragraphMark', label: 'Paragraph mark', type: 'select', options: [
      ['none', 'None'],
      ['pilcrow', '¶  Pilcrow'],
      ['section', '§  Section'],
      ['dot', '●  Dot'],
      ['triangle', '▸  Triangle'],
      ['bar', '▬  Bar']
    ] },
    { key: 'pauseView', label: 'When paused', type: 'select', options: [
      ['pinned', 'Text around word'],
      ['text', 'Show text'],
      ['off', 'Nothing']
    ] },
    { key: 'pauseLines', label: 'Lines when paused', type: 'range', min: 1, max: 6, step: 1, format: String }
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
      var clear;

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
        if (field.optional) hex.placeholder = 'theme';
        input.addEventListener('input', function () {
          hex.value = input.value;
          if (clear) clear.hidden = false;
          set(field.key, input.value);
        });
        hex.addEventListener('input', function () {
          var v = hex.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(v)) {
            input.value = v;
            if (clear) clear.hidden = false;
            set(field.key, v);
          } else if (field.optional && !v) {
            // Emptying the box hands the colour back to the theme.
            input.value = field.fallback(get);
            clear.hidden = true;
            set(field.key, '');
          }
        });
        wrap.appendChild(input);
        wrap.appendChild(hex);
        row.appendChild(wrap);
        if (field.optional) {
          clear = doc.createElement('button');
          clear.type = 'button';
          clear.className = 'sr-link';
          clear.textContent = 'Reset';
          clear.title = 'Back to the theme’s colour';
          clear.addEventListener('click', function () {
            set(field.key, '');
            hex.value = '';
            input.value = field.fallback(get);
            clear.hidden = true;
          });
          valueCell.appendChild(clear);
        }
        row.appendChild(valueCell);
      }

      label.addEventListener('click', function () { if (input) input.focus(); });

      syncers.push(function () {
        var v = get(field.key);
        if (field.type === 'check') {
          input.checked = !!v;
        } else if (field.type === 'colour') {
          input.value = v || field.fallback(get);
          if (rootNode.activeElement !== hex) hex.value = v;   // don't fight the typist
          if (clear) clear.hidden = !v;
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
    var dragging = false;
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
      '    <div class="sr-around sr-before"><div class="sr-flow"></div></div>',
      '    <div class="sr-line">',
      '      <div class="sr-side sr-left"><span class="sr-run"><span class="sr-ctx-left"></span><span class="sr-mark sr-para-mark"></span><span class="sr-word sr-pre"></span></span></div>',
      '      <div class="sr-focus"></div>',
      '      <div class="sr-side sr-right"><span class="sr-run"><span class="sr-word sr-post"></span><span class="sr-ctx-right"></span></span></div>',
      '    </div>',
      '    <div class="sr-around sr-after"><div class="sr-flow"></div></div>',
      '    <div class="sr-tick sr-tick-bottom"></div>',
      '    <div class="sr-peek"><div class="sr-flow"></div></div>',
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
      '    <kbd>&larr;</kbd><kbd>&rarr;</kbd> or wheel: words &middot; <kbd>&uarr;</kbd><kbd>&darr;</kbd> sentence &middot; <kbd>esc</kbd> close</div>',
      '</div>'
    ].join('');
    root.appendChild(wrap);

    var $ = function (sel) { return wrap.querySelector(sel); };

    var ctxLeft = $('.sr-ctx-left');
    var ctxRight = $('.sr-ctx-right');
    var paraMark = $('.sr-para-mark');
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
    var stageEl = $('.sr-stage');
    var peekEl = $('.sr-peek');
    var peekFlow = $('.sr-peek .sr-flow');
    var beforeFlow = $('.sr-before .sr-flow');
    var afterFlow = $('.sr-after .sr-flow');

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
      // The window colour overrides the theme's; the text follows it to
      // whichever ink stays readable. The backdrop is still the theme's.
      var panelColor = settings.panelColor;
      wrap.classList.toggle('sr-custom-panel', !!panelColor);
      if (panelColor) {
        wrap.style.setProperty('--sr-panel', panelColor);
        wrap.style.setProperty('--sr-fg', inkFor(panelColor));
      } else {
        wrap.style.removeProperty('--sr-panel');
        wrap.style.removeProperty('--sr-fg');
      }
      wrap.style.setProperty('--sr-width', settings.readerWidth + 'px');
      wrap.style.setProperty('--sr-size', settings.fontSize + 'px');
      wrap.style.setProperty('--sr-hl', settings.highlightColor);
      wrap.style.setProperty('--sr-ctx-opacity', settings.showContext ? String(settings.contextOpacity) : '0');
      wrap.style.setProperty('--sr-backdrop-opacity', fullPage ? '1' : String(settings.backdropOpacity));
      wrap.style.setProperty('--sr-word-font', FONTS[settings.fontFamily] || FONTS.sans);
      wrap.classList.toggle('sr-no-ticks', !settings.showPivotLines);
      wrap.dataset.pmark = settings.paragraphMark;
      wrap.dataset.pause = settings.pauseView;
      wrap.style.setProperty('--sr-pause-lines', String(settings.pauseLines));
      wpmRange.value = settings.wpm;
      wpmLabel.textContent = settings.wpm;
    }

    function onMediaChange() {
      if (settings.theme !== 'auto') return;
      applyStyle();
      syncFields();   // an unset window colour's swatch shows the theme's
    }
    if (media && media.addEventListener) media.addEventListener('change', onMediaChange);

    /* ----------------------------------------------------------- rendering */

    /* One span per token rather than one string per side, so a bold word — a
     * title's, or one the page set in bold — stays bold after it has drifted
     * out into the dimmed context.
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
        } else if (next && !showsMark(next)) {
          piece += ' ';        // a following mark brings its own margins
        }

        var prefix = i === 0 ? lead : '';
        if (!next) piece += tail;

        if (showsMark(token)) {
          if (prefix) frag.appendChild(doc.createTextNode(prefix));
          prefix = '';
          var bar = doc.createElement('span');
          bar.className = 'sr-mark';
          frag.appendChild(bar);
        }

        var span = doc.createElement('span');
        if (token.bold) span.className = 'sr-bold';
        span.textContent = prefix + piece;
        frag.appendChild(span);
      }

      el.appendChild(frag);
    }

    /* Whether this token draws a paragraph mark right now. The tokenizer flags
     * where marks belong; "None" is purely a display choice, so it's checked at
     * render time — and when marks are off, the spacing has to fall back to a
     * plain space, or "included.This" welds together. */
    function showsMark(token) {
      return !!(token && token.paragraphMark) && settings.paragraphMark !== 'none';
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

      var bold = !!token.bold;
      preEl.classList.toggle('sr-bold', bold);
      focusEl.classList.toggle('sr-bold', bold);
      postEl.classList.toggle('sr-bold', bold);

      // The focused word's own bar lives outside the context run, so it keeps
      // full strength and survives context being switched off.
      var markHere = showsMark(token);
      paraMark.classList.toggle('sr-on', markHere);

      var span = settings.showContext ? settings.contextWords : 0;
      if (span > 0) {
        var previous = tokens[index - 1];
        var joinsFocus = !!(previous && previous.wordIndex === token.wordIndex);

        fillContext(ctxLeft, tokens.slice(Math.max(0, index - span), index),
                    '', (joinsFocus || markHere) ? '' : ' ', joinsFocus);
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
      renderPause();
    }

    /* ---------------------------------------------------------- pause view */

    /* How many words to lay out per line of pause text. Generous on purpose —
     * a wide reader at the smallest size fits about this many — since the
     * overflow is clipped anyway and it's only built while paused. */
    var PEEK_WORDS_PER_LINE = 30;

    function pauseShown() {
      return !playing && !dragging && settings.pauseView !== 'off' && tokens.length > 0;
    }

    function firstOfWord(i) {
      while (i > 0 && tokens[i - 1].wordIndex === tokens[i].wordIndex) i--;
      return i;
    }

    function lastOfWord(i) {
      while (i < tokens.length - 1 && tokens[i + 1].wordIndex === tokens[i].wordIndex) i++;
      return i;
    }

    /* The whole word starting at token i, as it reads in running text. A
     * collapsed link is rebuilt from its chunks rather than taken from raw,
     * or the full URL would come back. */
    function wordText(i) {
      if (!tokens[i].link) return tokens[i].raw || tokens[i].text;
      var text = '';
      for (var j = i; j <= lastOfWord(i); j++) {
        var piece = tokens[j].text;
        if (j < lastOfWord(i)) piece = piece.replace(/-$/, '');
        text += piece;
      }
      return text;
    }

    /* Lays out tokens [from, to) as paragraphs of clickable words. The word
     * at index `current` (if it's in range) gets marked, with the focal
     * letter the RSVP line showed — when the word was shown whole. */
    function fillFlow(el, from, to, current) {
      el.textContent = '';
      // Nothing after the last word — and firstOfWord(tokens.length) would throw.
      if (from >= to) return;
      var para = doc.createElement('p');
      el.appendChild(para);

      for (var i = firstOfWord(from); i < to; i = lastOfWord(i) + 1) {
        var token = tokens[i];
        if (token.paragraph && para.firstChild) {
          para = doc.createElement('p');
          el.appendChild(para);
        }

        var span = doc.createElement('span');
        span.className = 'sr-w' + (token.bold ? ' sr-bold' : '');
        span.dataset.index = i;
        var text = wordText(i);

        if (i === firstOfWord(current)) {
          span.classList.add('sr-cur');
          var whole = lastOfWord(i) === i && !token.link;
          if (whole) {
            var focal = doc.createElement('span');
            focal.className = 'sr-cur-focus';
            focal.textContent = text.charAt(token.focus);
            span.appendChild(doc.createTextNode(text.slice(0, token.focus)));
            span.appendChild(focal);
            span.appendChild(doc.createTextNode(text.slice(token.focus + 1)));
          } else {
            span.textContent = text;
          }
        } else {
          span.textContent = text;
        }

        if (para.firstChild) para.appendChild(doc.createTextNode(' '));
        para.appendChild(span);
      }
    }

    function renderPause() {
      var shown = pauseShown();
      wrap.classList.toggle('sr-paused', shown);
      if (!shown) return;

      var start = firstOfWord(index);
      var end = lastOfWord(index);
      var reach = PEEK_WORDS_PER_LINE * (settings.pauseLines + 1);
      var from = Math.max(0, start - reach);
      var to = Math.min(tokens.length, end + 1 + reach);

      if (settings.pauseView === 'pinned') {
        fillFlow(beforeFlow, from, start, -1);
        fillFlow(afterFlow, end + 1, to, -1);
      } else {
        fillFlow(peekFlow, from, to, start);
        centrePeek();
      }
    }

    /* Slides the passage so the current word's line sits on the middle one. */
    function centrePeek() {
      var cur = peekFlow.querySelector('.sr-cur');
      if (!cur || !peekEl.clientHeight) return;
      var middle = cur.offsetTop + cur.offsetHeight / 2;
      peekFlow.style.transform = 'translateY(' + Math.round(peekEl.clientHeight / 2 - middle) + 'px)';
    }

    function onResize() {
      if (wrap.classList.contains('sr-paused') && settings.pauseView === 'text') centrePeek();
    }
    self.addEventListener('resize', onResize);

    /* ------------------------------------------------------------ playback */

    function setPlaying(next) {
      playing = next;
      playBtn.innerHTML = next ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', next ? 'Pause' : 'Play');
      renderPause();
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
      wheelMuteEnd = self.performance.now() + WHEEL_MUTE_MS;   // see onWheel
      setPlaying(true);
      render();
      schedule();
    }

    function pause() {
      setPlaying(false);
      stopTimer();
      lastBack.at = -Infinity;   // as does pausing; reaching the end doesn't
    }

    function toggle() { if (playing) pause(); else play(); }

    /* Every jump — arrow, button, click, scrub — comes through here; the
     * playback timer doesn't. */
    function gotoIndex(next, keepPlaying) {
      if (!tokens.length) return;
      lastBack.at = -Infinity;   // any jump ends a ↑ double-press
      index = Rsvp.clamp(Math.round(next), 0, tokens.length - 1);
      render();
      if (playing && keepPlaying !== false) schedule();
    }

    /* Moves `count` words (negative is back). Doesn't pause: while reading,
     * the line carries on from where it lands. Counts whole words, not
     * tokens — a long word is several chunks, and a step shouldn't stop
     * inside one — and lands on a word's first chunk. Stopped mid-word, the
     * first step back is to the start of that word, as ↑ does for sentences. */
    function stepWords(count) {
      if (!tokens.length) return;
      var i = index;
      for (; count > 0 && lastOfWord(i) < tokens.length - 1; count--) i = lastOfWord(i) + 1;
      for (; count < 0 && i > 0; count++) i = i === firstOfWord(i) ? firstOfWord(i - 1) : firstOfWord(i);
      gotoIndex(i);
    }

    /* ↑ and the previous-sentence button: back to the start of this sentence,
     * or to the one before when already there. While reading, the line has
     * moved off that first word before a second press can land — it may even
     * have finished a short sentence, or the text — so a second press soon
     * after the first, with nothing but reading in between, goes back from
     * where the first one landed, like double-tapping a music player's back
     * button. Paused, that's where the reader still is anyway. */
    var lastBack = { at: -Infinity, to: -1 };

    function sentenceBack(now) {
      if (!tokens.length) return;
      var again = now - lastBack.at < BACK_AGAIN_MS && index >= lastBack.to;
      var to = Rsvp.sentenceBack(docModel, again ? lastBack.to : index);
      gotoIndex(to);
      lastBack = { at: now, to: to };
    }

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
        if (key === 'theme') syncFields();   // an unset window colour's swatch shows the theme's
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
    prevBtn.addEventListener('click', function (event) { sentenceBack(event.timeStamp); });
    nextBtn.addEventListener('click', function () { gotoIndex(Rsvp.sentenceForward(docModel, index)); });
    gearBtn.addEventListener('click', function () {
      var open = wrap.classList.toggle('sr-settings-open');
      gearBtn.classList.toggle('sr-on', open);
      if (open) syncFields();
    });
    closeBtn.addEventListener('click', function () { destroy(); });

    // Any word in the pause text is a place to jump to.
    stageEl.addEventListener('click', function (event) {
      var word = event.target.closest ? event.target.closest('.sr-w') : null;
      if (!word) return;
      pause();
      gotoIndex(parseInt(word.dataset.index, 10));
    });

    wpmRange.addEventListener('input', function () { setWpm(parseInt(wpmRange.value, 10)); });

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
      else renderPause();
    }
    trackEl.addEventListener('pointerup', endDrag);
    trackEl.addEventListener('pointercancel', endDrag);

    /* ------------------------------------------------------- mouse wheel */

    /* The wheel walks through the text; down is forward, as on any page.
     * Unlike the arrows it stops the line: scrolling is for browsing, and the
     * text around your place only shows while paused. */
    var wheelCarry = 0;          // pixels toward the next word
    var wheelDir = 0;            // direction of the gesture under way
    var wheelLast = -Infinity;   // when its last event came
    var wheelPrecise = false;    // it has sent a fraction of a click
    var wheelMuteEnd = -Infinity; // see play() and below

    function wheelStep(words) {
      pause();
      stepWords(words);
    }

    function onWheel(event) {
      if (destroyed || event.ctrlKey) return;            // Ctrl+wheel is the browser's zoom
      var path = event.composedPath ? event.composedPath() : [];
      if (path.indexOf(settingsBox) >= 0) return;        // the drawer scrolls itself

      var dy = event.deltaY;
      if (event.deltaMode === 1) dy *= WHEEL_CLICK_PX / 3;               // lines
      else if (event.deltaMode === 2) dy *= self.innerHeight || 800;     // pages
      if (!dy || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      if (!tokens.length) return;

      var sign = dy > 0 ? 1 : -1;
      var gap = event.timeStamp - wheelLast;
      var fresh = gap > WHEEL_GESTURE_MS || sign !== wheelDir;
      wheelLast = event.timeStamp;
      wheelDir = sign;
      if (gap > WHEEL_GESTURE_MS) wheelPrecise = false;

      // A notched wheel says how many clicks it turned: Chrome's legacy
      // wheelDeltaY is 120 a click whatever the page zoom, display scaling or
      // lines-per-click setting, all of which change the pixel delta. So a
      // click is exactly a press of →. A trackpad can send a whole number now
      // and then too, so once a gesture has sent a fraction, it's counted in
      // pixels to the end.
      var clicks = -(event.wheelDeltaY || 0) / 120;
      var whole = clicks !== 0 && clicks === Math.round(clicks);
      if (clicks && !whole) wheelPrecise = true;
      if (whole && !wheelPrecise) {
        wheelCarry = 0;
        wheelStep(clicks * WORD_STEP);
        return;
      }

      // A trackpad's momentum, still coasting when Space starts the line,
      // would stop it again at once; so for a moment after play() the gesture
      // under way is ignored. Momentum only dies away, so a lull or a change
      // of direction is somebody scrolling again, and lifts that at once.
      if (wheelMuteEnd !== -Infinity) {
        if (event.timeStamp < wheelMuteEnd && !fresh) return;
        wheelMuteEnd = -Infinity;
        if (!fresh) wheelCarry = 0;   // a tail that outlasted the mute starts from nothing
      }

      // Anything finer — a trackpad, a smooth-scrolling mouse — goes by
      // distance, at a 100px click's rate. Pixels carry over between events,
      // so a trickle of small deltas adds up instead of being lost. A gesture
      // starts half a word in, so a step rounds rather than truncates, and
      // its first nudge always moves, however small.
      if (fresh) wheelCarry = sign * WHEEL_PX_PER_WORD / 2;
      wheelCarry += dy;
      var words = Math.trunc(wheelCarry / WHEEL_PX_PER_WORD);
      if (words) {
        wheelCarry -= words * WHEEL_PX_PER_WORD;
      } else if (fresh) {
        words = sign;
        wheelCarry = 0;
      } else {
        return;          // nothing moves, so nothing stops either
      }
      wheelStep(words);
    }

    // Not in the options preview: there the wheel belongs to the page.
    if (!embedded) wrap.addEventListener('wheel', onWheel, { passive: false });

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
          stepWords(event.shiftKey ? 1 : WORD_STEP);
          break;
        case 'ArrowLeft':
          stepWords(event.shiftKey ? -1 : -WORD_STEP);
          break;
        // The arrows move without stopping: while reading, the line carries
        // on from wherever they land, like the sentence buttons.
        case 'ArrowUp':
          sentenceBack(event.timeStamp);
          break;
        case 'ArrowDown':
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
      self.removeEventListener('resize', onResize);
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
