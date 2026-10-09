/* Store screenshots — the toolbar popup, dropped down over article.html.
 *
 * The popup is the real popup/popup.html in an iframe, sized to exactly what
 * it lays out to, in a card with the rounded corners and shadow Chrome gives
 * an extension popup. No browser chrome is drawn: the card simply hangs from
 * the top-right corner, where the toolbar would be.
 *
 * The article is selected first, so the popup's "Read selection on this page"
 * button shows its real word count and snippet — chrome-stub.js answers the
 * popup's sr-get-selection with this page's selection, as the service worker
 * would. */
window.__shotKit.run(async function (kit, params) {
  var story = document.getElementById('story');
  kit.select(story.querySelector('p'), story.querySelector('p:last-of-type'));

  /* Shown at 120%. At 1:1 the popup's 13px type is a smudge once the store
   * scales the screenshot down, and it is what this shot is about. zoom, not
   * transform, so the popup lays out and rasterises at that size and stays
   * sharp. It scales the card's offsets too: 8px and 18px land at about 10
   * and 22. */
  var style = document.createElement('style');
  style.textContent = [
    '.popup-card{position:fixed;top:8px;right:18px;z-index:10;zoom:' + (params.zoom || 1) + ';',
    '  border-radius:10px;overflow:hidden;',
    '  box-shadow:0 22px 60px rgba(20,23,28,.30),0 4px 14px rgba(20,23,28,.18),0 0 0 1px rgba(20,23,28,.10);}',
    '.popup-card iframe{display:block;border:0;width:328px;height:0;}'
  ].join('\n');
  document.head.appendChild(style);

  var card = document.createElement('div');
  card.className = 'popup-card';
  var frame = document.createElement('iframe');
  card.appendChild(frame);

  var loaded = new Promise(function (resolve) { frame.addEventListener('load', resolve, { once: true }); });
  frame.src = '../../popup/popup.html';
  document.body.appendChild(card);
  await loaded;

  var popup = frame.contentDocument;
  await kit.until(function () {
    var note = popup.getElementById('selection-note');
    return note && note.textContent !== 'Checking…';
  }, 'the popup to read the selection');

  frame.style.height = popup.documentElement.scrollHeight + 'px';
  await kit.frames(2);

  /* With no toolbar drawn, page content sticking out from under the card —
   * half an "N" of the "Notes" nav link, a sliver of the rail's list numbers,
   * the rail's rule just below the card — makes the popup look like a widget
   * the site put on top of its own page. Whatever the card covers, or nearly
   * touches, is hidden, so the page reads as simply running behind it.
   * visibility, not display, so nothing that stays moves. */
  var NEAR = 12;
  var cardBox = card.getBoundingClientRect();
  var behind = document.querySelectorAll('.site nav a, .rail section');
  for (var i = 0; i < behind.length; i++) {
    var box = behind[i].getBoundingClientRect();
    var touches = box.right > cardBox.left - NEAR && box.left < cardBox.right + NEAR &&
                  box.bottom > cardBox.top - NEAR && box.top < cardBox.bottom + NEAR;
    if (touches) behind[i].style.visibility = 'hidden';
  }
});
