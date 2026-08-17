# SpeedReader

An RSVP speed-reading extension for Chrome and Edge, in the style of
[Reedy](https://github.com/nicksergeant/reedy). Select text anywhere, hit a key, and
the words flash by one at a time in a fixed spot — so your eyes stop hopping across
the line and simply hold still.

Each word's focal letter (its *optimal recognition point*) is highlighted in red and
pinned to the exact same pixel, whatever the word's length. Unlike AccelaReader, the
words either side stay faintly visible, so you keep the thread of the sentence.

Manifest V3, plain JavaScript, **no build step** — clone it and load the folder.

---

## Install it

1. Download or clone this folder somewhere permanent (the browser reads it from disk
   every time it starts, so don't put it in a temp directory).
2. Open the extensions page:
   - **Chrome** — `chrome://extensions`
   - **Edge** — `edge://extensions`
3. Turn on **Developer mode** (top-right in Chrome, left sidebar in Edge).
4. Click **Load unpacked** and pick the `SpeedReader` folder — the one containing
   `manifest.json`.
5. Pin the icon to the toolbar (puzzle-piece menu → pin) so it's one click away.

Already have tabs open? Reload them once. `Shift`+`R` needs the content script, and
that only attaches to pages loaded after the extension was installed.

## Start reading

Any of these:

- **Select text and press `Shift`+`R`.**
- **Select text, right-click, choose "Speed read selection".**
- **Click the toolbar icon** → "Read selection on this page".
- **Click the toolbar icon and paste text** into the box → "Read pasted text".
  This opens a full-page reader, which is also the way to read something while
  you're on a page extensions can't touch.
- **`Alt`+`Shift`+`R`** — a browser-level shortcut, useful when a page swallows
  keystrokes. Rebind it at `chrome://extensions/shortcuts`.

The reader opens paused on the first word, so you get a moment to settle before
anything moves. Press `Space` (or the play button, which already has focus) to go.

## Keys while reading

| Key | Does |
| --- | --- |
| `Space` | Play / pause |
| `A` / `S` | Slower / faster, in 25 wpm steps (hold `Shift` for 100) |
| `←` / `→` | One word back / forward |
| `↑` / `↓` | Previous / next sentence |
| `Home` / `End` | Jump to the start / end |
| `Esc` | Close the reader |

`↑` behaves like the track-back button on a music player: the first press returns to
the start of the sentence you're in, the next takes you to the one before it.

Everything is on-screen too — play/pause, skip a sentence either way, a 100–1000 wpm
slider, and a progress bar you can click or drag to scrub. The counter and the
"time left" readout account for the extra beats spent on punctuation.

## Make it yours

Click the sliders icon in the reader, or open the extension's **Options** page (via
the popup's gear, or right-click the toolbar icon → Options). Both edit the same
settings, and anything you change applies immediately to a reader you already have
open. Settings sync across your signed-in browsers.

| Setting | Default | What it does |
| --- | --- | --- |
| Reading speed | 350 wpm | 100–1000. **Saved between runs.** |
| Reader width | 720 px | How much text is visible at once |
| Show context | on | The dimmed words around the current one |
| Context dim | 32% | How faint they are |
| Context words | 12 | How many on each side |
| Highlight | `#e5484d` | Colour of the focal letter |
| Theme | Auto | Auto / dark / light |
| Backdrop dim | 88% | How much the page behind is greyed out |
| Font size | 40 px | |
| Font | Sans | Sans / serif / mono |
| Pivot marks | on | The small ticks above and below the focal letter |

## How it works

**Focal letter.** The highlighted letter is picked by word length — 1st letter for a
one-letter word, 2nd up to five letters, 3rd up to nine, and so on — ignoring leading
punctuation. It sits in its own flex item between two equal-width halves, so it lands
on the same pixel every time regardless of the font.

**Timing.** Each word gets a base beat of `60000 / wpm` milliseconds, then a
multiplier: ×2.1 at the end of a sentence, ×2.6 at a paragraph break, ×1.5 after a
comma, ×1.25 for numbers, plus a little extra for long words. The timer is re-armed
per word rather than run on an interval, so a speed change lands on the very next word.

**Sentences.** Detected from `.` `!` `?` `…`, with the usual traps handled:
abbreviations (`Dr.`, `e.g.`), initials (`J. R.`), decimals (`3.50`), and list markers
(`1.` at the start of a line). A number that genuinely ends a sentence — "…in 2019." —
still counts.

**Long words.** Anything over 13 characters is broken into hyphenated chunks, so the
line never has to shrink. The chunks rejoin seamlessly in the context strip.

## Layout

```
manifest.json
background.js          service worker — context menu, shortcut, on-demand injection
lib/settings.js        defaults, storage, live change notifications
lib/rsvp.js            tokenizer, sentence detection, focal letter, timing
lib/reader-ui.js       the reader component (shadow DOM, controls, keyboard)
content/hotkey.js      the only always-on script: listens for Shift+R
content/mount.js       injected on demand — mounts the overlay
popup/                 toolbar popup
options/               settings page with a live preview
reader/                full-page reader for pasted text
icons/                 icons + make-icons.mjs, the script that generated them
```

Only `content/hotkey.js` (under 2 KB) runs on pages you visit. The reader itself is
injected by the service worker the moment you actually ask for it, so nothing heavy
loads on a page you never read.

The three surfaces — page overlay, full-page tab, options preview — are the same
`createReader()` component with different flags, so they can't drift apart.

To regenerate the icons after recolouring them, edit the `SHAPES` array at the top of
`icons/make-icons.mjs` and run:

```bash
node icons/make-icons.mjs
```

## Privacy

No network requests, no analytics, no accounts. The text you read never leaves your
machine. `chrome.storage.sync` holds your settings (a dozen numbers and colours) and
nothing else; pasted text goes through `chrome.storage.local` and is deleted the
instant the reader picks it up.

## Where it won't work

- `chrome://`, `edge://`, `about:` pages, and the extension gallery — browsers block
  extensions there. Use the popup's paste box instead.
- The built-in PDF viewer. Copy the text and paste it in.
- `file://` pages, unless you tick **Allow access to file URLs** on the extension's
  details page.
- Pages opened before you installed the extension, until you reload them.
