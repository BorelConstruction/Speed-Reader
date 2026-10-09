/* Builds the Chrome Web Store upload. Zero dependencies — writes the ZIP by hand.
 *
 *   node tools/pack.mjs
 *
 * Output: dist/speedreader-<version>.zip, with <version> taken from
 * manifest.json. Upload that file on the developer dashboard.
 *
 * Why not just zip the folder? The folder also holds the README, this script,
 * the icon generator, editor droppings and whatever else happens to land in
 * it. None of that belongs in a store upload, and anything that slips in is
 * shipped to every user and read by the store reviewer. So the zip is built
 * from an explicit allowlist (RUNTIME below): a file goes in because a rule
 * names it, never merely because nothing excluded it.
 *
 * Before writing anything it checks the manifest fields the store insists on,
 * and that the files the extension points at are in the zip: paths in
 * manifest.json; src, href and the like in the HTML; url() and @import in the
 * CSS; and, in the JS, string literals that are nothing but a file name
 * (READER_FILES, executeScript({ files }), runtime.getURL). A path put
 * together at run time ('lib/' + name) can't be checked. A missing file
 * doesn't show up until someone uses the feature that needs it, by which time
 * the build is live, so those fail the build, as does markup that Manifest
 * V3's content security policy would block. A packaged file that nothing
 * points at only warns.
 *
 * The zip is reproducible: sorted entries, fixed timestamps and permissions,
 * and text files always packaged with LF line endings, because git checks them
 * out with CRLF wherever core.autocrlf is on (the Windows default) and git
 * status doesn't show the difference. So a commit gives the same bytes from
 * any checkout (on the same Node build; the compressed data is whatever its
 * zlib produces), and you can match an upload to a fresh build of that commit
 * by the SHA-256 it prints. The build warns when a packaged file isn't what's
 * committed. */

import * as zlib from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, posix } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
const ZIP_PREFIX = 'speedreader';

/* What goes in the zip, and nothing else. Each rule is one folder (not
 * recursive) and the exact names or extensions (any case) it may contribute.
 * A runtime file in a new place needs a rule here; the reference checks below
 * say so if you forget. Extensions rather than "everything in popup/" so a
 * stray notes.txt or editor backup in a runtime folder still stays out. */
const RUNTIME = [
  { dir: '',        names: ['manifest.json', 'background.js'] },
  { dir: 'content', extensions: ['.js'] },
  { dir: 'lib',     extensions: ['.js'] },
  { dir: 'popup',   extensions: ['.html', '.css', '.js'] },
  { dir: 'options', extensions: ['.html', '.css', '.js'] },
  { dir: 'reader',  extensions: ['.html', '.css', '.js'] },
  { dir: 'icons',   extensions: ['.png'] }
];

/* Packaged with CRLF turned into LF, so the bytes don't depend on how git
 * checked the file out. Pages and scripts behave the same either way: JS reads
 * CRLF as one line break, and as LF inside template literals; the HTML, CSS
 * and XML (SVG) parsers turn it into LF before anything else sees the text;
 * JSON counts both as whitespace. Plain .txt isn't here, because a script that
 * reads one would see the difference. */
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.html', '.htm', '.css', '.json', '.svg']);

/* The store's limits for the fields it shows on the listing. */
const MAX_NAME = 75;
const MAX_DESCRIPTION = 132;

/* ---------------------------------------------------------------- reporting */

function fail(message) {
  console.error(`pack: ${message}`);
  process.exit(1);
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function formatSize(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/* ----------------------------------------------------------- the file list */

function extensionOf(name) {
  return extname(name).toLowerCase();
}

/* Two kinds of name are never packaged, even when a rule would match. Names
 * starting with "_": Chrome refuses to load an extension with one at its root
 * (they're reserved for _locales and the store's _metadata), and deeper down,
 * where Chrome allows them, this project uses the prefix for scratch pages
 * (_preview*.html), which must stay out too. Names starting with ".": editor
 * and OS droppings. */
function isReservedName(name) {
  return name.startsWith('_') || name.startsWith('.');
}

function isAllowed(rule, name) {
  if (isReservedName(name)) return false;
  if (rule.names) return rule.names.includes(name);
  return rule.extensions.includes(extensionOf(name));
}

/* Entry names are built from RUNTIME's forward-slash folders, so they can't
 * pick up Windows backslashes, but a file *named* with a backslash is legal on
 * Linux and would turn into a folder when extracted on Windows. Belt and
 * braces: refuse anything that isn't a plain relative path. */
function checkEntryName(name) {
  const segments = name.split('/');
  const bad = name.includes('\\') || name.startsWith('/') ||
    segments.some(s => s === '' || s === '.' || s === '..');
  if (bad) fail(`refusing to package "${name}": not a plain relative path`);
}

/* CRLF to LF, byte by byte rather than through a string, so a file that isn't
 * valid UTF-8 comes through otherwise untouched. In UTF-8 (and ASCII) a 0x0D
 * or 0x0A byte is always that character, never part of a longer one. */
function toLf(data) {
  const out = Buffer.alloc(data.length);
  let length = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x0d && data[i + 1] === 0x0a) continue;
    out[length++] = data[i];
  }
  return out.subarray(0, length);
}

/* Byte order, not localeCompare: the order must not depend on the machine. */
function byName(a, b) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/* Returns the files to package and, for the summary, what was seen in a
 * runtime folder but left out (the root's README and friends aren't listed;
 * nobody expects those in the zip). */
function collectFiles() {
  const files = [];
  const leftOut = [];

  for (const rule of RUNTIME) {
    let entries;
    try {
      entries = readdirSync(join(ROOT, rule.dir), { withFileTypes: true });
    } catch {
      continue;   // a missing folder surfaces as a missing reference instead
    }
    for (const entry of entries) {
      const name = rule.dir ? `${rule.dir}/${entry.name}` : entry.name;
      if (entry.isFile() && isAllowed(rule, entry.name)) {
        checkEntryName(name);
        const data = readFileSync(join(ROOT, name));
        files.push({ name, data: TEXT_EXTENSIONS.has(extensionOf(name)) ? toLf(data) : data });
      } else if (rule.dir) {
        leftOut.push(entry.isDirectory() ? `${name}/` : name);
      }
    }
  }

  return { files: files.sort(byName), leftOut: leftOut.sort() };
}

/* --------------------------------------------------------------- manifest */

/* Chrome's rule: one to four dot-separated integers, each 0–65535, no leading
 * zeros. Checked here as well because the version ends up in the file name. */
function isChromeVersion(version) {
  if (typeof version !== 'string') return false;
  if (!/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(version)) return false;
  return version.split('.').every(part => Number(part) <= 65535);
}

function isFilledString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/* Chrome itself loads an extension without a description or icons, so a local
 * test never complains; the store rejects the upload. Hence the checks here,
 * where they cost nothing, rather than on the dashboard. */
function checkManifestFields(manifest) {
  const problems = [];
  if (manifest.manifest_version !== 3) {
    problems.push('manifest.json: manifest_version must be 3 (the store no longer accepts Manifest V2)');
  }
  if (!isChromeVersion(manifest.version)) {
    problems.push(`manifest.json: version ${JSON.stringify(manifest.version)} is not 1-4 dot-separated integers (0-65535, no leading zeros)`);
  }
  if (!isFilledString(manifest.name)) {
    problems.push('manifest.json: name is missing');
  } else if ([...manifest.name].length > MAX_NAME) {
    problems.push(`manifest.json: name is ${[...manifest.name].length} characters; the limit is ${MAX_NAME}`);
  }
  if (!isFilledString(manifest.description)) {
    problems.push('manifest.json: description is missing; the store requires one');
  } else if ([...manifest.description].length > MAX_DESCRIPTION) {
    problems.push(`manifest.json: description is ${[...manifest.description].length} characters; the store rejects more than ${MAX_DESCRIPTION}`);
  }
  if (!isFilledString(manifest.icons?.['128'])) {
    problems.push('manifest.json: icons has no "128" entry; the store requires a 128x128 icon');
  }
  return problems;
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

/* Every path manifest.json names. Manifest paths are relative to the
 * extension root. A reference is { ref, bases, from, hint? }: the path as
 * written, the folders it may be relative to, where it was found, and an
 * optional note to add if it doesn't resolve (the last two for messages). */
function manifestReferences(manifest) {
  const refs = [];
  const add = (value, field) => {
    if (typeof value === 'string') refs.push({ ref: value, bases: [''], from: `manifest.json ${field}` });
  };
  const addList = (list, field) => {
    listOf(list).forEach((value, i) => add(value, `${field}[${i}]`));
  };
  const addIcons = (icons, field) => {
    if (typeof icons === 'string') add(icons, field);
    else if (icons && typeof icons === 'object') {
      for (const [size, path] of Object.entries(icons)) add(path, `${field}.${size}`);
    }
  };

  add(manifest.background?.service_worker, 'background.service_worker');
  listOf(manifest.content_scripts).forEach((script, i) => {
    addList(script?.js, `content_scripts[${i}].js`);
    addList(script?.css, `content_scripts[${i}].css`);
  });
  add(manifest.action?.default_popup, 'action.default_popup');
  addIcons(manifest.action?.default_icon, 'action.default_icon');
  addIcons(manifest.icons, 'icons');
  add(manifest.options_ui?.page, 'options_ui.page');
  add(manifest.options_page, 'options_page');
  add(manifest.side_panel?.default_path, 'side_panel.default_path');
  add(manifest.devtools_page, 'devtools_page');
  for (const [page, path] of Object.entries(manifest.chrome_url_overrides || {})) {
    add(path, `chrome_url_overrides.${page}`);
  }
  addList(manifest.sandbox?.pages, 'sandbox.pages');
  listOf(manifest.web_accessible_resources).forEach((entry, i) => {
    addList(entry?.resources, `web_accessible_resources[${i}].resources`);
  });
  listOf(manifest.declarative_net_request?.rule_resources).forEach((ruleset, i) => {
    add(ruleset?.path, `declarative_net_request.rule_resources[${i}].path`);
  });
  add(manifest.storage?.managed_schema, 'storage.managed_schema');
  // Not on the allowlist today, so declaring a locale fails loudly until a
  // _locales rule is added, rather than shipping a build Chrome won't load.
  if (typeof manifest.default_locale === 'string') {
    add(`_locales/${manifest.default_locale}/messages.json`, 'default_locale');
  }

  return refs;
}

/* ------------------------------------------------------ references in files */

/* Blanks out a match without moving anything, so line numbers still match. */
function blank(text) {
  return text.replace(/[^\n]/g, ' ');
}

function blankOut(text, pattern) {
  return text.replace(pattern, blank);
}

function isUrl(value) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
}

/* Browsers drop tabs and newlines anywhere in a URL and control characters
 * and spaces around it, so "java\nscript:" still runs. */
function isJavascriptUrl(value) {
  return /^javascript:/i.test(value.replace(/[\t\n\r]/g, '').replace(/^[\0- ]+/, ''));
}

/* --- CSS */

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const CSS_LOADS = [/url\(\s*(['"]?)([^'")]+?)\1\s*\)/gi, /@import\s+(['"])([^'"]+)\1/gi];

/* url(...) and @import in CSS whose comments are already blanked out,
 * relative to base. locate(index) says where a match is, for messages. Shared
 * by stylesheets, <style> blocks and style attributes. */
function cssUrls(css, base, locate) {
  const refs = [];
  for (const pattern of CSS_LOADS) {
    for (const match of css.matchAll(pattern)) {
      const value = match[2].trim();
      if (!value || value.startsWith('#') || isUrl(value)) continue;
      refs.push({ ref: value, bases: [base], from: `${locate(match.index)} url()` });
    }
  }
  return refs;
}

function cssReferences(file) {
  const css = blankOut(file.data.toString('utf8'), CSS_COMMENT);
  const refs = cssUrls(css, posix.dirname(file.name), index => `${file.name}:${lineAt(css, index)}`);
  return { refs, problems: [] };
}

/* --- HTML */

/* The attributes that make a page load or open a file, by element (SVG's
 * <image> and <use> included). */
const URL_ATTRIBUTES = {
  a: ['href'], area: ['href'], link: ['href'],
  script: ['src'], img: ['src', 'srcset'], source: ['src', 'srcset'],
  iframe: ['src'], frame: ['src'], embed: ['src'], object: ['data'],
  audio: ['src'], video: ['src', 'poster'], track: ['src'],
  input: ['src', 'formaction'], button: ['formaction'], form: ['action'],
  image: ['href', 'xlink:href'], use: ['href', 'xlink:href']
};

/* A tag, with quoted attribute values allowed to contain ">". */
const TAG = /<([a-z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/* Elements whose content is text, not markup: "<img src=x.png>" inside a
 * <textarea> or a <script> is not an image. */
const RAW_TEXT = /<(script|style|textarea|title)(?=[\s/>])((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>/gi;

/* An element's attributes as a Map from lower-cased name to value. The first
 * of a repeated name wins, as in the browser. Parsed as a whole rather than
 * searched for, so "src=" inside another attribute's value isn't a src. */
function parseAttributes(source) {
  const attrs = new Map();
  for (const match of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

/* A <script type="application/json"> (or any non-JS type) is a data block
 * the browser never runs, so the CSP has nothing to say about it. */
function isExecutable(attrs) {
  const type = (attrs.get('type') || '').trim().toLowerCase();
  return ['', 'module', 'text/javascript', 'application/javascript'].includes(type);
}

/* srcset is "url [descriptors], url [descriptors], …". A URL runs to the next
 * whitespace and may itself contain commas (data: URLs do); a comma at its end
 * closes the candidate, otherwise its descriptors run to the next comma. */
function srcsetUrls(srcset) {
  const urls = [];
  let rest = srcset;
  while ((rest = rest.replace(/^[\s,]+/, ''))) {
    const url = rest.match(/^\S+/)[0];
    rest = rest.slice(url.length);
    if (url.endsWith(',')) {
      urls.push(url.replace(/,+$/, ''));
    } else {
      urls.push(url);
      rest = rest.replace(/^[^,]*/, '');
    }
  }
  return urls;
}

/* Files the page loads or links to (URL_ATTRIBUTES, plus url() in <style>
 * and style attributes), relative to the page. Also what would break the page
 * under Manifest V3's content security policy, and what a reviewer flags as
 * remote code: a <script> loaded from the web, inline <script>, inline event
 * handlers (onclick=...) and javascript: URLs. Remote stylesheets and images
 * aren't code, so those are left alone; inline <style> is allowed. */
function htmlReferences(file) {
  const html = blankOut(file.data.toString('utf8'), /<!--[\s\S]*?-->/g);
  const base = posix.dirname(file.name);
  const where = index => `${file.name}:${lineAt(html, index)}`;
  const refs = [];
  const problems = [];

  // Raw-text elements first: check what's inside, then blank it out of the
  // copy the tag scan reads.
  let markup = html;
  for (const element of html.matchAll(RAW_TEXT)) {
    const [, name, attrSource, content] = element;
    const tag = name.toLowerCase();
    const attrs = parseAttributes(attrSource);
    const start = element.index + name.length + attrSource.length + 2;   // after "<name attrs>"
    if (tag === 'script' && !attrs.has('src') && isExecutable(attrs) && content.trim()) {
      problems.push(`${where(element.index)}: inline <script> is blocked by Manifest V3's content security policy`);
    }
    if (tag === 'style') {
      refs.push(...cssUrls(blankOut(content, CSS_COMMENT), base, index => `${where(start + index)} <style>`));
    }
    markup = markup.slice(0, start) + blank(content) + markup.slice(start + content.length);
  }

  for (const tag of markup.matchAll(TAG)) {
    const name = tag[1].toLowerCase();
    const attrs = parseAttributes(tag[2]);
    const at = where(tag.index);

    for (const attr of attrs.keys()) {
      if (/^on[a-z]+$/.test(attr)) {
        problems.push(`${at}: inline event handler <${name} ${attr}> is blocked by Manifest V3's content security policy`);
      }
    }
    if (attrs.has('style')) {
      refs.push(...cssUrls(blankOut(attrs.get('style'), CSS_COMMENT), base, () => `${at} <${name} style>`));
    }

    for (const attr of URL_ATTRIBUTES[name] || []) {
      if (!attrs.has(attr)) continue;
      const label = `${at} <${name} ${attr}>`;
      const values = attr === 'srcset' ? srcsetUrls(attrs.get(attr)) : [attrs.get(attr).trim()];
      for (const value of values) {
        if (isJavascriptUrl(value)) {
          problems.push(`${label}: a javascript: URL is blocked by Manifest V3's content security policy`);
        } else if (isUrl(value)) {
          if (name === 'script' && /^(https?:|\/\/)/i.test(value)) {
            problems.push(`${label}: "${value}" loads code from the web, which Manifest V3 forbids`);
          }
        } else if (value && !value.startsWith('#')) {
          refs.push({ ref: value, bases: [base], from: label });
        }
      }
    }
  }

  return { refs, problems };
}

/* --- JS */

/* String literals that are a file name and nothing else, give or take a query
 * or fragment: READER_FILES, executeScript({ files: [...] }),
 * runtime.getURL('reader/reader.html?from=popup'). Those APIs resolve against
 * the extension root, so that's tried first; the script's own folder is the
 * fallback for a page script naming a neighbour. The name can't contain spaces
 * or colons, so prose and URLs don't match (and a file name with a space in it
 * goes unchecked).
 *
 * Comments are not told apart from code: that takes a real JavaScript
 * tokenizer (is this "/" a division or the start of a regex?), and a wrong
 * guess would quietly let a missing file through. So a quoted file name in a
 * comment is checked like any other, and if the file is gone it fails the
 * build. The error says so when the line looks like a comment; drop the
 * quotes from a name that's only history. */
const FILE_LITERAL = /(['"`])([\p{L}\p{N}_./-]*[\p{L}\p{N}_-]\.(?:m?js|html?|css|json|png|jpe?g|gif|webp|avif|svg|ico|bmp|woff2?|ttf|otf|mp3|wav|ogg|mp4|webm|wasm|txt))(?:[?#][^'"`\n]*)?\1/giu;

/* Only feeds the hint in a message, so a wrong answer costs nothing. */
function looksLikeComment(text, index) {
  const before = text.slice(text.lastIndexOf('\n', index - 1) + 1, index);
  return /^\s*\*|\/\/|\/\*/.test(before);
}

function jsReferences(file) {
  const js = file.data.toString('utf8');
  const base = posix.dirname(file.name);
  const refs = [];

  for (const match of js.matchAll(FILE_LITERAL)) {
    if (match[2].startsWith('//')) continue;
    refs.push({
      ref: match[2],
      bases: ['', base],
      from: `${file.name}:${lineAt(js, match.index)}`,
      hint: looksLikeComment(js, match.index)
        ? 'if that is a comment, update it, or drop the quotes from a name that is only history'
        : null
    });
  }

  return { refs, problems: [] };
}

const SCANNERS = { '.html': htmlReferences, '.htm': htmlReferences, '.css': cssReferences, '.js': jsReferences, '.mjs': jsReferences };

function fileReferences(files) {
  const refs = [];
  const problems = [];
  for (const file of files) {
    const scan = SCANNERS[extensionOf(file.name)];
    if (!scan) continue;
    const found = scan(file);
    refs.push(...found.refs);
    problems.push(...found.problems);
  }
  return { refs, problems };
}

/* ------------------------------------------------------------- resolution */

/* The entry name a reference should match: forward slashes, no leading "/"
 * (extension URLs are rooted at the package), no "." or ".." segments, no
 * query or fragment. Null if it climbs out of the package. */
function toEntryName(ref, base) {
  const path = ref.split(/[?#]/)[0];
  const joined = path.startsWith('/') ? path.slice(1) : posix.join(base, path);
  const normal = posix.normalize(joined);
  if (normal === '..' || normal.startsWith('../') || normal.startsWith('/')) return null;
  return normal;
}

/* web_accessible_resources may use "*", which matches across folders too. */
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/* Why a referenced path isn't in the zip, most specific reason first.
 * Backslashes and case come before looking on disk, because Windows would
 * find "content\hotkey.js" and "Lib/RSVP.js" there, and so would Chrome on
 * Windows, but Chrome on Linux or ChromeOS would not. A reserved name is
 * checked before the allowlist because adding a rule wouldn't help. */
function diagnose(path, names) {
  if (path.includes('\\')) {
    return 'uses backslashes, which only Windows reads as folder separators; write it with forward slashes';
  }
  const lower = path.toLowerCase();
  const sameButCase = [...names].find(name => name.toLowerCase() === lower);
  if (sameButCase) {
    return `differs in case from the packaged ${sameButCase} (works where the file system ignores case, as on Windows; breaks on Linux and ChromeOS)`;
  }

  let stat = null;
  try { stat = statSync(join(ROOT, path)); } catch { /* not there */ }
  if (!stat) return 'does not exist';
  if (stat.isDirectory()) return 'is a folder, not a file';
  const base = posix.basename(path);
  if (isReservedName(base)) {
    return `is never packaged, because its name starts with "${base[0]}" (see isReservedName in tools/pack.mjs); rename it`;
  }
  return 'exists but is not on the allowlist (RUNTIME in tools/pack.mjs)';
}

function resolveReferences(refs, names) {
  const referenced = new Set();
  const problems = [];

  for (const { ref, bases, from, hint } of refs) {
    if (ref.includes('*')) {
      const pattern = toEntryName(ref, '');
      const regex = pattern && globToRegExp(pattern);
      const hits = regex ? [...names].filter(name => regex.test(name)) : [];
      if (!hits.length) problems.push(`${ref} matches no packaged file (referenced by ${from})`);
      hits.forEach(name => referenced.add(name));
      continue;
    }

    const candidates = bases.map(base => toEntryName(ref, base)).filter(Boolean);
    if (!candidates.length) {
      problems.push(`${ref} points outside the extension folder (referenced by ${from})`);
      continue;
    }
    const hit = candidates.find(name => names.has(name));
    if (hit) {
      referenced.add(hit);
    } else {
      const note = hint ? `; ${hint}` : '';
      problems.push(`${candidates[0]} ${diagnose(candidates[0], names)} (referenced by ${from})${note}`);
    }
  }

  return { referenced, problems };
}

/* -------------------------------------------------------------------- git */

/* The zip is built from the working tree, not from a commit, so an edited,
 * untracked or git-ignored packaged file means the upload matches nothing you
 * can point back to later. Worth knowing; not worth blocking a test build.
 * Line endings don't count, since the zip has LF either way: with
 * core.autocrlf on, git status doesn't report a CRLF-only difference, and
 * with it off it does, which then warns about a change the zip doesn't have.
 * Returns null when git isn't installed or this isn't a repository. */
function uncommittedFiles(names) {
  let output;
  try {
    output = execFileSync('git', [
      '--literal-pathspecs', 'status', '--porcelain', '-z',
      '--untracked-files=all', '--ignored', '--', ...names
    ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }

  const changed = [];
  const fields = output.split('\0');
  for (let i = 0; i < fields.length; i++) {
    if (!fields[i]) continue;
    const status = fields[i].slice(0, 2);
    const path = fields[i].slice(3);
    if (status.includes('R') || status.includes('C')) i++;   // next field is the old name
    const what = status === '??' ? 'untracked' : status === '!!' ? 'ignored by git' : 'uncommitted changes';
    changed.push(`${path} (${what})`);
  }
  return changed;
}

/* ------------------------------------------------------------- ZIP writer */

/* The subset of PKWARE's APPNOTE that every unzipper, and the store, reads:
 * for each file a local header followed by its data; then a central directory
 * listing every file again with its offset; then the end-of-central-directory
 * record pointing at that. No folder entries (the paths imply them), no extra
 * fields, no ZIP64 — an extension is nowhere near 4 GiB or 65,535 files, and
 * buildZip checks rather than assumes. All fields are little-endian. */

/* DOS timestamps count from 1980 in local time, and month and day start at 1,
 * so an all-zero date is invalid. 1980-01-01 00:00 is the obvious constant but
 * becomes 1979 when a tool east of UTC converts it, which some reject;
 * 1980-02-01 is what Gradle and Maven settled on for reproducible archives. */
const DOS_TIME = 0;                                      // 00:00:00
const DOS_DATE = ((1980 - 1980) << 9) | (2 << 5) | 1;    // 1980-02-01

/* "Made by Unix" so the external attributes are read as a file mode, giving
 * every file an explicit rw-r--r-- rather than whatever the extracting tool
 * assumes. Bit 11 of the flags declares the names UTF-8. */
const MADE_BY = (3 << 8) | 20;
const FILE_ATTRIBUTES = (0o100644 << 16) >>> 0;
const UTF8_NAMES = 0x0800;
const STORED = 0;
const DEFLATED = 8;

/* Deflate, unless that doesn't shrink the file: PNGs are compressed already,
 * and the small ones come out of deflate bigger than they went in. */
function compress(data) {
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  return deflated.length < data.length
    ? { method: DEFLATED, body: deflated }
    : { method: STORED, body: data };
}

function versionNeeded(method) {
  return method === DEFLATED ? 20 : 10;   // 2.0 for deflate, 1.0 for stored
}

function localHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(versionNeeded(entry.method), 4);
  header.writeUInt16LE(UTF8_NAMES, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.size, 22);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  header.writeUInt16LE(0, 28);                       // extra field length
  return Buffer.concat([header, entry.nameBytes]);
}

function centralHeader(entry) {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(MADE_BY, 4);
  header.writeUInt16LE(versionNeeded(entry.method), 6);
  header.writeUInt16LE(UTF8_NAMES, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.size, 24);
  header.writeUInt16LE(entry.nameBytes.length, 28);
  header.writeUInt16LE(0, 30);                       // extra field length
  header.writeUInt16LE(0, 32);                       // comment length
  header.writeUInt16LE(0, 34);                       // disk number
  header.writeUInt16LE(0, 36);                       // internal attributes
  header.writeUInt32LE(FILE_ATTRIBUTES, 38);
  header.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([header, entry.nameBytes]);
}

function endOfCentralDirectory(count, size, offset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(0x06054b50, 0);
  record.writeUInt16LE(0, 4);                        // this disk
  record.writeUInt16LE(0, 6);                        // disk with the directory
  record.writeUInt16LE(count, 8);                    // entries on this disk
  record.writeUInt16LE(count, 10);                   // entries in total
  record.writeUInt32LE(size, 12);
  record.writeUInt32LE(offset, 16);
  record.writeUInt16LE(0, 20);                       // comment length
  return record;
}

function buildZip(files) {
  const LIMIT = 0xffffffff;
  if (files.length > 0xffff) fail(`${files.length} files is more than a zip without ZIP64 can hold`);

  const parts = [];
  const entries = [];
  let offset = 0;

  for (const file of files) {
    const { method, body } = compress(file.data);
    const entry = {
      name: file.name,
      nameBytes: Buffer.from(file.name, 'utf8'),
      method,
      crc: zlib.crc32(file.data),
      size: file.data.length,
      compressedSize: body.length,
      offset
    };
    const header = localHeader(entry);
    parts.push(header, body);
    entries.push(entry);
    offset += header.length + body.length;
    if (offset > LIMIT) fail('the files add up to more than a zip without ZIP64 can hold');
  }

  const directory = Buffer.concat(entries.map(centralHeader));
  if (offset + directory.length > LIMIT) fail('the zip would be larger than a zip without ZIP64 can hold');
  parts.push(directory, endOfCentralDirectory(entries.length, directory.length, offset));

  return { zip: Buffer.concat(parts), entries };
}

/* ------------------------------------------------------------------- main */

function readManifest() {
  let text;
  try {
    text = readFileSync(join(ROOT, 'manifest.json'), 'utf8');
  } catch {
    fail(`no manifest.json in ${ROOT}`);
  }
  try {
    return JSON.parse(text.replace(/^\uFEFF/, ''));   // Chrome tolerates a BOM; JSON.parse doesn't
  } catch (err) {
    fail(`manifest.json is not valid JSON: ${err.message}`);
  }
}

function printProblems(label, list, print) {
  for (const item of list) print(`${label}: ${item}`);
}

function main() {
  if (typeof zlib.crc32 !== 'function') {
    fail(`needs zlib.crc32, which arrived in Node 20.15 / 22.2 (this is ${process.version})`);
  }

  const manifest = readManifest();
  const { files, leftOut } = collectFiles();
  const names = new Set(files.map(file => file.name));

  const inFiles = fileReferences(files);
  const resolved = resolveReferences([...manifestReferences(manifest), ...inFiles.refs], names);
  const problems = [...checkManifestFields(manifest), ...inFiles.problems, ...resolved.problems];

  const unreferenced = files
    .map(file => file.name)
    .filter(name => name !== 'manifest.json' && !resolved.referenced.has(name));
  printProblems('warning', unreferenced.map(name => `${name} is packaged but nothing references it`), console.warn);

  if (problems.length) {
    printProblems('error', problems, console.error);
    fail(`${problems.length} problem${problems.length === 1 ? '' : 's'} found; no zip written`);
  }

  const changed = uncommittedFiles([...names]);
  if (changed === null) {
    console.warn('warning: git unavailable or not a repository; skipped the uncommitted-changes check');
  } else if (changed.length) {
    printProblems('warning', changed.map(item => `${item}: the zip will not match what is committed`), console.warn);
  }

  const { zip, entries } = buildZip(files);
  const zipPath = join(DIST, `${ZIP_PREFIX}-${manifest.version}.zip`);
  mkdirSync(DIST, { recursive: true });
  writeFileSync(zipPath, zip);

  const width = Math.max(...entries.map(entry => entry.name.length));
  console.log(`${manifest.name} ${manifest.version}`);
  for (const entry of entries) {
    const how = entry.method === DEFLATED ? `-> ${formatSize(entry.compressedSize)}` : '(stored)';
    console.log(`  ${entry.name.padEnd(width)}  ${formatSize(entry.size).padStart(9)}  ${how}`);
  }
  if (leftOut.length) console.log(`left out (not on the allowlist): ${leftOut.join(', ')}`);

  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const sha256 = createHash('sha256').update(zip).digest('hex');
  console.log(`packed ${entries.length} files, ${formatSize(total)} (${total} bytes)`);
  console.log(`wrote ${zipPath}, ${formatSize(zip.length)} (${zip.length} bytes)`);
  console.log(`sha256 ${sha256}`);
}

main();
