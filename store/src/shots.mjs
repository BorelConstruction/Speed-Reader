/* The Chrome Web Store images store/render.mjs produces, in listing order.
 *
 *   file         written to store/<file>
 *   size         [width, height] in CSS px, captured at deviceScaleFactor 1
 *   page         what to load, relative to store/
 *   colorScheme  prefers-color-scheme for the page (the popup and options
 *                page follow it; the article page is light either way)
 *   settings     what chrome.storage.sync holds; anything left out is the
 *                default from lib/settings.js, as on a fresh install
 *   setup        script evaluated once the page has loaded (see shot-kit.js)
 *   params       handed to that script
 *
 * Screenshots: exactly 1280×800, the size the store asks for. The small promo
 * tile: exactly 440×280. */

export const SHOTS = [
  {
    // The headline shot: the overlay mid-read on an ordinary article. Held
    // playing on a word in the second paragraph, so the dimmed context shows
    // on both sides and the progress bar is part-way along. pauseView 'off'
    // keeps the single-word line on screen even if the reader were paused.
    file: 'screenshot-1-reading.png',
    size: [1280, 800],
    page: 'src/article.html',
    colorScheme: 'dark',
    settings: { theme: 'dark', pauseView: 'off' },
    setup: 'src/overlay.js',
    params: { word: 'reading', occurrence: 1, play: true }
  },
  {
    // Same word, paused, with the default "Text around word": the lines
    // before and after fade in above and below while the word stays put.
    file: 'screenshot-2-paused.png',
    size: [1280, 800],
    page: 'src/article.html',
    colorScheme: 'dark',
    settings: { theme: 'dark', pauseView: 'pinned' },
    setup: 'src/overlay.js',
    params: { word: 'reading', occurrence: 1, play: false }
  },
  {
    // Customisation: a warm window colour, serif type, a teal highlight, with
    // the gear panel open showing those same values. Parked on the article's
    // subheading — "happens" in "What happens mid-jump" is the word's second
    // appearance — so the bold title treatment shows on the line.
    file: 'screenshot-3-customise.png',
    size: [1280, 800],
    page: 'src/article.html',
    colorScheme: 'dark',
    settings: {
      theme: 'dark',
      panelColor: '#f4ecd8',
      fontFamily: 'serif',
      highlightColor: '#0f766e',
      fontSize: 44,
      readerWidth: 860,
      pauseView: 'off'
    },
    setup: 'src/overlay.js',
    params: { word: 'happens', occurrence: 2, play: false, openSettings: true }
  },
  {
    // The real options page at 125%: the live preview and the Reading and
    // Appearance cards, which fill the frame exactly (see options-preview.js).
    file: 'screenshot-4-options.png',
    size: [1280, 800],
    page: '../options/options.html',
    colorScheme: 'light',
    settings: {},
    setup: 'src/options-preview.js',
    params: { word: 'focal', occurrence: 1, zoom: 1.25, startAt: '.preview-card' }
  },
  {
    // The toolbar popup over the article, with the article selected, so the
    // popup offers to read it. Enlarged a little (see popup-card.js).
    file: 'screenshot-5-popup.png',
    size: [1280, 800],
    page: 'src/article.html',
    colorScheme: 'dark',
    settings: {},
    setup: 'src/popup-card.js',
    params: { zoom: 1.2 }
  },
  {
    file: 'promo-small.png',
    size: [440, 280],
    page: 'src/promo.html',
    colorScheme: 'dark'
  }
];
