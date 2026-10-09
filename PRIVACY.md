# SpeedReader privacy policy

**Effective date: 8 October 2026**

SpeedReader is a Chrome extension for speed reading. It works entirely inside your
browser. It has no server, makes no network requests, and never sends the text you
read anywhere.

## What SpeedReader accesses

It accesses only what it needs to put text in the reader:

- **Text you ask it to read.** This is either your selection, or everything from a
  spot you point at to the end of the article. You point at it by right-clicking, or
  by clicking in the text. Along with the words, it notes which lines are headings
  and which words are bold, so the reader can pause on titles and keep the emphasis.
- **Your selection, when you open the toolbar popup.** It uses this to show a word
  count and a short preview on the "Read selection" button.
- **Text you paste or type** into the popup, or into the text box of the full-page
  reader.
- **Where you last right-clicked on a page.** It keeps a screen position and a time
  in the page, so "Speed read from here" knows which word to start at. It is used
  only to pick the word a read starts at, and only within a minute of the
  right-click.
- **Key presses, to notice `Shift`+`R`.** A small script on each page watches for
  that one key combination. It ignores every other key, ignores everything you type
  into text fields, and records nothing.
- **The current tab's address, when you press `Alt`+`Shift`+`R`.** It checks the
  address only to see whether Chrome lets extensions run on that page.

When you close the reader, SpeedReader selects the word you stopped on in the page
and remembers that word, so pressing `Shift`+`R` again carries on from there.

## How it's used

Only to show the text to you in the reader or as the popup's preview, and to find
your place in the page again when you close the reader. Nothing is analysed or kept
for any other purpose.

## Where anything is kept

| What | Where | For how long |
| --- | --- | --- |
| The text being read, your last right-click position, the word you stopped on, and where the read started | Memory, inside the tab you're reading | Until you reload, leave or close the page |
| Your settings | `chrome.storage.sync` | Until you change or reset them, or uninstall |
| Text you paste into the popup | `chrome.storage.local` | Deleted as soon as the reader tab has picked it up |
| Which frame of a tab the current read came from (a tab number and a frame number, no text) | `chrome.storage.session` | Memory only. Chrome clears it when you quit the browser |

**Settings** means these 15 values and nothing else: reading speed, reader width,
whether the context words show, how many show and how dim they are, highlight
colour, window colour, theme, backdrop dim, font size, font, pivot marks on or off,
paragraph mark, what pausing shows, and how many lines it shows. None of them
contains anything you've read.

If you use Chrome sync, Chrome copies these settings to the other browsers where
you're signed in, through your Google account, as it does for any extension that
uses sync storage. Chrome carries that data, not SpeedReader.

The full-page reader's tab title shows the first few words of the text you pasted.
Like any page you open, that tab can then appear in Chrome's own history and in its
list of recently closed tabs. If you sync your history or open tabs in Chrome,
Chrome may also copy that title to your Google account. You can delete it from your
history as usual.

Those settings and that tab title leave your device only through Chrome's own sync,
and only if you've turned it on. SpeedReader itself sends nothing else off your
device.

## What the page you're reading can see

On a web page, the reader opens inside the tab's main page, and that page's own
scripts can see it, including the words it shows. Usually those are the page's own
words, shown back to it. But the reader opens in the main page even when the text
comes from a frame embedded in it, such as a document viewer or comment box from
another site. The main page's scripts could then see that text too. SpeedReader
doesn't send it anywhere, but it doesn't hide it from the main page either.

## What SpeedReader doesn't do

- It sends nothing anywhere: no network requests, no analytics or telemetry, no
  crash reports, no accounts.
- It doesn't sell, share or transfer your data, and gives none of it to third
  parties. The embedded-frame case above is the only way another site could see
  text you read.
- It doesn't use your data for advertising, to judge creditworthiness or for
  lending, or to build a profile of you.
- It runs no remote code. Everything it runs is inside the package you install.
- It doesn't read a page's text until you ask it to read, or open the toolbar popup,
  which reads only your selection, for its preview. The only script that runs on
  every page is the small listener for `Shift`+`R` and right-clicks described above.

## Why it asks for each permission

- **Storage:** saves your settings, hands pasted text to the reader tab, and
  remembers which frame a read came from.
- **Context menus:** adds "Speed read selection" and "Speed read from here" to the
  right-click menu.
- **Scripting:** gets the text from a page and adds the reader to it when you ask to
  read, and selects the word you stopped on when the reader closes. It also reads
  your selection when you open the toolbar popup, and shows a short notice when
  there's nothing to read.
- **Active tab:** keeps the right-click menu, `Alt`+`Shift`+`R` and the toolbar
  popup working on the current tab if you set SpeedReader's site access to "On
  click" or limit it to certain sites. A plain `Shift`+`R` still needs site access.
- **Access to all sites, and the script that runs on every page:** Chrome's own
  shortcut system only accepts shortcuts that include `Ctrl` or `Alt`, so a plain
  `Shift`+`R` has to be noticed by a script on the page. That script also records
  where you right-click, because Chrome doesn't tell extensions where a menu was
  opened. Site access then lets SpeedReader get the text and open the reader after
  you press `Shift`+`R`.

## Deleting your data

- **Uninstall SpeedReader** to remove everything it stored, settings included.
- **Options page → "Reset everything to defaults"** puts every setting back to its
  default value.
- Pasted text is deleted as soon as it's read. The frame number is gone when you
  quit Chrome. Anything held in a page is gone when you reload or close it.

## Children

SpeedReader isn't aimed at children. It sends no information about anyone, children
included, to its developer or to any third party.

## Changes to this policy

Any change will be posted here with a new effective date. Earlier versions are in
this file's history on GitHub.

## Contact

For questions about this policy, open an issue at
<https://github.com/BorelConstruction/Speed-Reader/issues>.

## Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store
User Data Policy, including the Limited Use requirements.
