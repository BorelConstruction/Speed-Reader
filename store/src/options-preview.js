/* Store screenshots — the options page, its live preview parked on a word.
 *
 * The preview is a real reader that plays its sample text on a loop, so left
 * alone each run would catch it somewhere different. It is held playing on
 * one word instead (kit.freezeTimers): mid-sentence, context either side, as
 * it looks while you tweak the settings below it.
 *
 * params (from src/shots.mjs):
 *   word, occurrence  where to park the preview (see kit.seek)
 *   zoom              how large to show the page (1 = as authored)
 *   startAt           selector for what sits at the top of the frame;
 *                     anything above it is scrolled off */
window.__shotKit.run(async function (kit, params) {
  var entry = await kit.until(function () { return kit.readers[0]; }, 'the live preview');
  kit.freezeTimers();
  kit.seek(entry, params.word, params.occurrence);

  /* At 1:1 the page's 760px column leaves 40% of the 1280px frame empty, and
   * its 11–13px labels are a smudge once the store scales the screenshot
   * down — the reason the popup shot is enlarged too. zoom, not transform,
   * so the page lays out and rasterises at that size and stays sharp. */
  document.documentElement.style.zoom = params.zoom || 1;

  /* Enlarged, the header and three cards no longer fit. The header is what
   * goes — the listing shows the name and icon right beside the screenshot —
   * so the live preview and the two settings cards, the point of the shot,
   * fill the frame whole. */
  var TOP_MARGIN = 6;
  if (params.startAt) {
    var first = document.querySelector(params.startAt);
    window.scrollBy(0, Math.round(first.getBoundingClientRect().top - TOP_MARGIN));
  }

  /* Whatever doesn't fit is cut by the bottom edge. Cutting through a card's
   * title or a row of settings reads as a mistake; a nudge of a few pixels
   * shows it whole, and the card going on below it says "more if you
   * scroll", as it should. */
  var BOTTOM_MARGIN = 10;
  var whole = document.querySelectorAll('.card h2, .sr-field');
  for (var i = 0; i < whole.length; i++) {
    var box = whole[i].getBoundingClientRect();
    if (box.top < innerHeight && box.bottom > innerHeight - BOTTOM_MARGIN) {
      window.scrollBy(0, Math.ceil(box.bottom - innerHeight + BOTTOM_MARGIN));
      break;
    }
  }

  await kit.sleep(100);
});
