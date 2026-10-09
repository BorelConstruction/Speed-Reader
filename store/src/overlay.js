/* Store screenshots — the in-page reader, opened over article.html the way
 * "Speed read selection" opens it.
 *
 * It replays what background.js does, with the page's own <script> tags
 * standing in for chrome.scripting: select the article, inject
 * content/extract.js and take blocksFromSelection() — so headings and bold
 * words arrive marked up exactly as on a real page — then inject READER_FILES
 * and call SpeedReader.open() with the result. content/mount.js builds the
 * overlay; nothing here touches its markup.
 *
 * params (from src/shots.mjs):
 *   word, occurrence  where to park the reader (see kit.seek)
 *   play              true: reading, frozen mid-stream; false: paused
 *   openSettings      true: open the gear panel, by clicking the gear */
window.__shotKit.run(async function (kit, params) {
  var story = document.getElementById('story');
  kit.select(story.querySelector('p'), story.querySelector('p:last-of-type'));

  await kit.loadScript('../../content/extract.js');
  var payload = window.SpeedReader.blocksFromSelection();

  // The same files, in the same order, as READER_FILES in background.js.
  var readerFiles = ['lib/settings.js', 'lib/rsvp.js', 'lib/reader-ui.js', 'content/mount.js'];
  for (var i = 0; i < readerFiles.length; i++) await kit.loadScript('../../' + readerFiles[i]);

  window.SpeedReader.open(payload);
  var entry = await kit.until(function () {
    return window.SpeedReader._active && kit.readers[kit.readers.length - 1];
  }, 'the reader to open');

  // Let the reader's own focus-on-open land, then take the ring away again.
  await kit.sleep(60);
  kit.blurReader(entry);

  if (params.play) {
    kit.freezeTimers();
    entry.reader.play();
  }
  kit.seek(entry, params.word, params.occurrence);

  if (params.openSettings) {
    kit.rootOf(entry).querySelector('.sr-gear').click();
  }

  // The stage and pause view animate their height for 200ms.
  await kit.sleep(400);
});
