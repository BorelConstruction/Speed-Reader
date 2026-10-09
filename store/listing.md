# Chrome Web Store listing: SpeedReader 1.0.0

Text for every free-text field in the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole),
in dashboard order. Each field's text is in its own `text` block, so it can be copied
as it is. The detailed description is plain text because the store doesn't render
Markdown.

Everything here was checked against `manifest.json` 1.0.0 and the code. If the
manifest's name, description or permissions change, update this file to match.

---

## Package tab

Upload `dist/speedreader-1.0.0.zip`, built by `node tools/pack.mjs` (see the
[pre-submission checklist](#pre-submission-checklist)).

---

## Store listing tab

### Item name

The dashboard takes this from `manifest.json` in the uploaded zip. It's here so you
can check it. 32 characters (limit 75).

```text
SpeedReader — RSVP Speed Reading
```

**Decide on the name before submitting.** An unrelated extension is already listed
as plain
["SpeedReader"](https://chromewebstore.google.com/detail/speedreader/alemimmmfjckmbgofhepgjmakceiiani),
and it does the same job: RSVP, one word at a time, a red focal letter, and a
choice of where to start. Chrome's
[listing guidance](https://developer.chrome.com/docs/webstore/best-listing) asks for
titles that are "Unique: Avoid titles that are similar to existing extensions." The
" — RSVP Speed Reading" suffix sets this one apart only a little, so a reviewer may
ask whether it's a copy. Keeping the name is a choice to make on purpose. A rename
means changing `name` in `manifest.json`, then this file, `PRIVACY.md`, `README.md`
and the promo tile (`store/src/promo.html`).

### Summary

Also taken from `manifest.json` (its `description`). 123 characters (limit 132).

```text
Speed read any selected text with RSVP: one word at a time, focal letter pinned in place, surrounding context kept visible.
```

### Detailed description

```text
Read faster by holding your eyes still. SpeedReader shows text one word at a time in a fixed spot (RSVP, rapid serial visual presentation), so your eyes stop hopping along the line.

• Focal letter pinned in place: each word's recognition point is highlighted and lands on the same pixel, however long the word.
• Context kept visible: the words either side stay faintly on screen, so you keep the thread.
• Pause to look around: pausing shows the lines around your place, and clicking any word jumps to it.
• Natural rhythm: longer beats at full stops, commas, paragraph breaks and headings. Headings and bold words stay bold.
• Readable links and long words: a web address becomes one short token, and very long words are split into chunks.
• Pick up where you left off: close the reader and the word you stopped on is selected on the page. Press Shift+R to carry on from it.

Start however suits you:
• Right-click where you want to begin and choose "Speed read from here" to read to the end of the article.
• Select text and press Shift+R, or right-click it and choose "Speed read selection".
• Click the toolbar button to read your selection, or paste text into it for a full-page reader.
• Press Alt+Shift+R (changeable at chrome://extensions/shortcuts).

While reading, Space plays and pauses, A and S change the speed, the arrow keys move by word or sentence, and Esc closes. Speed runs from 100 to 1000 words per minute.

Make it yours: reader width, font and size, highlight colour, light, dark or automatic theme, window colour, and how many context words show. The Options page has a live preview, and settings follow you through Chrome sync.

Private: it reads only the text you choose to read, plus your current selection when you open the toolbar popup, for its preview. A tiny script on each page listens for Shift+R and notes where you last right-clicked, so "Speed read from here" knows where to start, and does nothing else. No network requests, no analytics, no account: SpeedReader never sends the text you read anywhere.

Chrome doesn't let extensions run on its own pages, the Chrome Web Store or its PDF viewer; there, paste the text into the toolbar popup. After installing, reload any tabs that were already open so Shift+R works in them.
```

### Category

Productivity → Tools. (Productivity → Education is the other reasonable fit.)

### Language

English. The extension has no translations. Its interface uses British spelling
("Window colour"), and so does the description above.

### Graphic assets

See the [image assets checklist](#image-assets-checklist).

### Additional fields

Homepage URL:

```text
https://github.com/BorelConstruction/Speed-Reader
```

Support URL:

```text
https://github.com/BorelConstruction/Speed-Reader/issues
```

Mature content: No.

---

## Privacy tab

### Single purpose description

```text
SpeedReader is a speed-reading tool. It shows text the user chooses (a selection on a web page, a page from a point the user picks to the end of the article, or text pasted into the popup) one word at a time in a fixed position, using rapid serial visual presentation (RSVP), with controls for reading speed and appearance.
```

### Permission justifications

Each block below goes into the justification box for that permission.

#### storage

```text
Saves the user's reader settings (reading speed, font, colours, theme and similar) in chrome.storage.sync so they persist between sessions and follow the user through Chrome sync. chrome.storage.local briefly holds text the user pastes into the popup, to hand it to the extension's full-page reader tab, which deletes it as soon as it has read it. chrome.storage.session records which frame of a tab the current text came from, so that when the reader closes, the extension can select the word the user stopped on in that frame. Nothing taken from web pages is stored.
```

#### contextMenus

```text
Adds two right-click menu items: "Speed read selection", which reads the selected text, and "Speed read from here", which reads from the clicked point to the end of the article. These are two of the main ways to start the reader.
```

#### scripting

```text
Injects the reader into the current tab when the user asks to read, by pressing Shift+R or Alt+Shift+R, choosing a context-menu item, or clicking a button in the popup. content/extract.js collects the selected text, or the text from the chosen point to the end of the article, and lib/settings.js, lib/rsvp.js, lib/reader-ui.js and content/mount.js show it in an overlay on the page. When the reader closes, content/extract.js runs again in the frame the text came from to select the word the user stopped on, so Shift+R can resume from it. scripting is also used to read the current selection when the toolbar popup opens, for the word-count preview on its "Read selection" button, and to show a short notice when there is nothing to read. Nothing is injected into a page until the user asks to read it or opens the toolbar popup.
```

#### activeTab

```text
Keeps the context-menu items, the Alt+Shift+R shortcut and the toolbar popup working for users who set the extension's site access to "On click" or limit it to certain sites. Each of those actions grants temporary access to the current tab, which lets the extension read the selection and inject the reader there without the all-sites host permission. The plain Shift+R shortcut still needs host access, because it comes from the content script.
```

#### Host permission (`<all_urls>`)

The dashboard's host permission box also covers the content script's `matches`, so
this text explains both.

```text
<all_urls> is needed for the content script content/hotkey.js and for the injection it triggers.
1. The main shortcut is a plain Shift+R. chrome.commands can't register it, because Chrome requires command shortcuts to include Ctrl or Alt, so it has to be a keydown listener on the page. (Alt+Shift+R is registered with chrome.commands as an alternative.)
2. "Speed read from here" starts at the word the user right-clicked, but contextMenus.onClicked doesn't report where the click landed. The content script therefore records the position of the last right-click, in page memory only.
3. Pressing Shift+R on a page doesn't grant activeTab, so the service worker needs host access to read the selection and inject the reader into that tab.
The content script runs in all frames so that these also work inside embedded frames. It is under 3 KB, reads no page text until the user presses Shift+R, and sends nothing off the device.
```

#### Content script

Only needed if the dashboard asks about the content script separately. The host
permission text above already covers it.

```text
content/hotkey.js runs on every page because SpeedReader's main shortcut, a plain Shift+R, can't be registered with chrome.commands (Chrome requires Ctrl or Alt), and because "Speed read from here" needs the position of the user's right-click, which contextMenus.onClicked doesn't provide. The script does only those two things. It ignores every other key and key presses in text fields, keeps the right-click position in page memory and uses it only within a minute of the click, and sends nothing off the device. The reader itself is injected only when the user asks to read.
```

### Remote code

Answer **No**, and paste this if a justification is asked for:

```text
All JavaScript ships in the package. The extension loads no external scripts, uses no eval() or new Function(), and makes no network requests.
```

### Data usage

**Data types to tick:**

- [x] **Website content.** The extension reads the text the user chooses (a
  selection, or a page from a chosen point onward) to show it in the reader, and
  reads the selection when the popup opens, for its word-count preview. It is held
  only in memory, and never saved or transmitted. While
  [open code issue 2](#2-text-from-embedded-frames-is-visible-to-the-main-page)
  stands, text read from an embedded frame is visible to the main page's scripts,
  and `PRIVACY.md` says so.
- [x] **User activity.** Required. The dashboard's own examples for it include
  "clicks" and "mouse position", and the Chrome Web Store counts data handled only
  on the device as collected
  ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
  question 3). The content script records the position of the user's last
  right-click, so "Speed read from here" knows where to start, and it watches key
  presses for Shift+R. The position stays in page memory, key presses aren't kept
  at all, and nothing is stored or transmitted.
- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history. The tab's address is checked only to skip pages Chrome doesn't
  allow extensions on, and nothing is recorded.

**Certifications to tick (all three):**

- [x] I do not sell or transfer user data to third parties, outside of the approved
  use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for
  lending purposes

### Privacy policy URL

```text
https://github.com/BorelConstruction/Speed-Reader/blob/main/PRIVACY.md
```

---

## Distribution tab

- Payments: free.
- Visibility: Public.
- Regions: all regions.

---

## Image assets checklist

Every image except the icon is generated by `node store/render.mjs`. The
screenshots run the extension's own code: the in-page reader on a sample article
(screenshots 1–3), the Options page (4), and the popup over that article (5). The
small promo tile is drawn by `store/src/promo.html`. Run the script again after any
change to the reader's look, then check that the images show the current UI.

| Dashboard slot | File | Size |
| --- | --- | --- |
| Store icon | `icons/icon128.png` | 128×128 |
| Screenshot 1 | `store/screenshot-1-reading.png` | 1280×800 |
| Screenshot 2 | `store/screenshot-2-paused.png` | 1280×800 |
| Screenshot 3 | `store/screenshot-3-customise.png` | 1280×800 |
| Screenshot 4 | `store/screenshot-4-options.png` | 1280×800 |
| Screenshot 5 | `store/screenshot-5-popup.png` | 1280×800 |
| Small promo tile | `store/promo-small.png` | 440×280 |
| Marquee promo tile (1400×560) | none, leave empty | |
| Promo video | none, leave empty | |

- [ ] The store icon has transparent padding around 96×96 artwork, so it's the same
      size as other extensions' icons in the store.
- [ ] Screenshots are uploaded in the order above. The first one is the one most
      people see.
- [ ] No image or caption names or shows another extension.

---

## Open code issues

Two bugs in the 1.0.0 code limit what this file and `PRIVACY.md` can truthfully
say, so both documents describe the code as it is now. Fix them before submitting
if you can, then make the follow-up edits listed under each.

### 1. Shift+R after a click can start at an earlier right-click

For a minute after a right-click, `blocksFromHere()` in `content/extract.js` prefers
the right-click position to the caret. So if you right-click in one paragraph, then
click in another and press `Shift`+`R` (or `Alt`+`Shift`+`R` with nothing
selected), it starts at the word you right-clicked. That's why the description above
doesn't offer "click in the text and press Shift+R". The README's "Click where you
want to begin, then press `Shift`+`R`" has the same problem.

Fix: give `Shift`+`R` and the `Alt`+`Shift`+`R` fallback an entry point that checks
the caret before the right-click position, and keep the current order for "Speed
read from here". Swapping the order everywhere would break "Speed read from here"
on links: a right-click on a link doesn't move the caret, so it would start at your
previous click instead. A right-click on plain text does move the caret to the
clicked word. Both were checked in headless Chrome 154 on Windows.

After the fix:

- Add this line to the description, after the "Select text and press Shift+R" line:

  ```text
  • Click in the text and press Shift+R to read on from that spot.
  ```

- Add this check to the final click-through: right-click a word in one paragraph,
  choose **Speed read from here**, read a few words and press `Esc`. Within a
  minute, click in a different paragraph and press `Shift`+`R`. It should start
  where you just clicked. Repeat with `Alt`+`Shift`+`R` and no selection.
- `PRIVACY.md` needs no change. If the fix goes into `content/hotkey.js` instead
  (forgetting the right-click on an ordinary click), then its "Key presses" bullet
  and the content script text above ("does only those two things") must also say
  that the script notices ordinary clicks, and "under 3 KB" needs re-checking.

### 2. Text from embedded frames is visible to the main page

`lib/reader-ui.js` attaches the reader's shadow root with `mode: 'open'`, and the
service worker always opens the reader in the tab's main frame. So when you read
text from an embedded frame from another site, the main page's scripts can read it
from the reader's shadow root. `PRIVACY.md` discloses this under "What the page
you're reading can see".

Fix: attach the shadow root with `mode: 'closed'` and keep the returned root
yourself, for example in a `WeakMap` keyed by the host element. A plain swap breaks
the paste box and the Options preview: `reader/reader.js` and `options/options.js`
call `createReader()` again on the same host, `host.shadowRoot` is then null, and
the second `attachShadow()` throws.

After the fix, delete that section of `PRIVACY.md`, the sentence under "What
SpeedReader doesn't do" that refers to it, and the last sentence of the Website
content note above.

---

## Pre-submission checklist

**Code**

- [ ] Fix the two [open code issues](#open-code-issues) and make the follow-up edits
      listed there. If you submit without fixing them, leave this file and
      `PRIVACY.md` as they are, since they describe the current code.

**Account**

- [ ] Register as a Chrome Web Store developer in the dashboard and pay the one-time
      registration fee.
- [ ] Turn on 2-Step Verification for the Google account. The dashboard requires it
      before you can publish.
- [ ] Fill in the publisher name and contact email on the dashboard's Account page,
      and verify the email. Both are public: the publisher name appears under the
      title, and the email in every listing's contact information
      ([account setup](https://developer.chrome.com/docs/webstore/set-up-account)).
      Use an address you're happy to publish. `PRIVACY.md` points to GitHub issues
      for privacy questions.
- [ ] Declare whether you're a Trader or a Non-trader in the dashboard's account
      settings. The EU Digital Services Act makes every Chrome Web Store developer
      declare one or the other
      ([trader FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq),
      [policy](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure)).
      A non-trader is someone acting outside their trade, business, craft or
      profession, which usually fits a person publishing a free extension as a
      hobby, but Google leaves the call to you. Choosing Trader starts
      verification, and your legal name, address and phone number are then shown
      publicly at the bottom of the listing.

**Privacy policy**

- [ ] Push `PRIVACY.md` to `main` on GitHub.
- [ ] Open the privacy policy URL in a private window and check that it loads
      without signing in.

**Package**

- [ ] Check that `version` in `manifest.json` is higher than any version uploaded
      before. 1.0.0 is fine for the first upload.
- [ ] Run `node tools/pack.mjs` and check that `dist/speedreader-1.0.0.zip` has
      `manifest.json` at its root, with only the extension's own files (no `.git`,
      `.claude`, `store/`, `tools/` or `dist/`).
- [ ] Upload the zip itself. The store signs the package, so no `.crx` or `.pem` is
      needed.

**Final click-through of the packaged build**

- [ ] Extract the zip to a fresh folder. In `chrome://extensions`, turn on Developer
      mode and click **Load unpacked**. Disable your development copy first, or both
      copies will react to `Shift`+`R` and both will add menu items.
- [ ] Reload a normal article page. Select a paragraph, press `Shift`+`R`, read a
      little, and press `Esc`. The word you stopped on should be selected. Press
      `Shift`+`R` again and check that it resumes from that word.
- [ ] Click in the middle of the text and press `Shift`+`R`. It should read on from
      there. Until [open code issue 1](#1-shiftr-after-a-click-can-start-at-an-earlier-right-click)
      is fixed, this only holds if you haven't right-clicked on the page in the
      last minute.
- [ ] Right-click a word and choose **Speed read from here**. Then select text,
      right-click, and choose **Speed read selection**.
- [ ] Press `Alt`+`Shift`+`R` with a selection.
- [ ] In the popup, try **Read selection on this page**. Then paste text and use
      **Read pasted text**. The full-page reader should open, and closing it should
      close the tab.
- [ ] On a `chrome://` page, check that the popup's paste box still works.
- [ ] Open the Options page and change a setting. It should apply to an open reader
      straight away. Then click **Reset everything to defaults**.
- [ ] On the extension's Details page, set **Site access** to "On click", then
      reload the article. Check that both menu items, `Alt`+`Shift`+`R` and the
      popup still work, and that **Speed read from here** on a plain word starts at
      that word. Don't count it as a failure if `Shift`+`R` does nothing, or if
      **Speed read from here** on a link starts somewhere else: both rely on the
      page script, which needs site access. Then set it back.
- [ ] Check that `chrome://extensions` shows no **Errors** button for the extension,
      and that the service worker's console (**Inspect views**) is clean.

**Dashboard**

- [ ] Fill in every field from this file, then compare the preview with the text
      here.
- [ ] Check that the description doesn't mention or compare SpeedReader with any
      other extension. Don't paste the README's opening paragraph.
- [ ] Check the homepage too, since store policies cover the pages a listing links
      to. The homepage URL opens the GitHub repo, which shows `README.md`. Its
      opening paragraph and the repo's About description shouldn't present
      SpeedReader as "in the style of" another extension or link to that
      extension's store page.
- [ ] Check that the README's Privacy section links to `PRIVACY.md` and doesn't
      contradict it. In particular it shouldn't say the text you read "never leaves
      your machine" (the full-page reader's tab title can sync with Chrome history),
      and sync holds 15 settings, not "a dozen". Its "Click where you want to begin,
      then press `Shift`+`R`" depends on
      [open code issue 1](#1-shiftr-after-a-click-can-start-at-an-earlier-right-click).
- [ ] Submit for review.
