/* Renders the Chrome Web Store images: five 1280×800 screenshots and the
 * 440×280 small promo tile. Zero dependencies — drives the Chrome you already
 * have over the DevTools protocol.
 *
 *   node store/render.mjs                          all of them
 *   node store/render.mjs screenshot-2-paused      just the ones named
 *   CHROME_PATH=/path/to/chrome node store/render.mjs
 *
 * Needs Node 22+ (global WebSocket).
 *
 * You never need to run this to use the extension; the PNGs are committed.
 * It exists so the images are reproducible: when the UI changes, re-render
 * rather than re-shoot by hand, and the sizes are always exactly what the
 * store asks for (https://developer.chrome.com/docs/webstore/images).
 *
 * Every screenshot is the real UI. The pages are the extension's own popup,
 * options page and reader scripts, loaded unmodified from this repo. The
 * chrome.* APIs are stood in for (src/chrome-stub.js), because the pages run
 * in an ordinary tab rather than inside an installed extension — branded
 * Chrome has ignored --load-extension since v137. Beyond that, src/shot-kit.js
 * only holds a reader still on a chosen word (its timers frozen, the reader
 * instance captured as it is created) and removes the focus ring; the popup
 * and the options page are shown enlarged (120% and 125%) so their small type
 * survives the store scaling the image down. The shots themselves are listed
 * in src/shots.mjs.
 *
 * Chrome runs headless in a throwaway profile that is deleted afterwards,
 * whether or not the run succeeded. */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { constants as osConstants, tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SHOTS } from './src/shots.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);             // the extension itself
const STEP_TIMEOUT_MS = 20000;          // how long each step may take before
                                        // the run gives up: Chrome starting, a
                                        // protocol call, a page load, a shot's
                                        // setup

/* Prepended to every page, in every frame, before the page's own scripts. */
const INIT_SCRIPTS = ['src/chrome-stub.js', 'src/shot-kit.js']
  .map((file) => readFileSync(join(HERE, file), 'utf8'));

/* A page with no setup script of its own still waits for fonts and a frame. */
const DEFAULT_SETUP = 'window.__shotKit.run(async function () {});';

/* ----------------------------------------------------------------- Chrome */

function findChrome() {
  if (process.env.CHROME_PATH) {
    if (!existsSync(process.env.CHROME_PATH)) {
      throw new Error(`CHROME_PATH points at nothing: ${process.env.CHROME_PATH}`);
    }
    return process.env.CHROME_PATH;
  }

  const env = process.env;
  const candidates = {
    win32: [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA]
      .filter(Boolean)
      .map((base) => join(base, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    darwin: [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      join(env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
    ],
    linux: [
      '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'
    ]
  }[process.platform] || [];

  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Chrome not found. Set CHROME_PATH to its executable.');
  return found;
}

const CHROME_FLAGS = [
  '--headless=new',
  '--remote-debugging-port=0',          // any free port; read back from stderr
  '--no-first-run',
  '--no-default-browser-check',
  // Nothing from the network: no update checks, sync or field trials that
  // could change how a page renders from one run to the next.
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-extensions',
  // New tabs open in the background; don't let that slow their timers and
  // frames, which the shot setup scripts wait on.
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  // Pixels as authored: sRGB, no scrollbars eating into the 1280 px.
  '--force-color-profile=srgb',
  '--hide-scrollbars',
  // Greyscale text antialiasing, never ClearType's coloured subpixel kind.
  // Subpixel AA is tuned to one monitor's stripe layout; baked into a PNG
  // that the store then rescales (and doubles on HiDPI screens), its
  // fringes turn into colour noise. It would also differ from shot to
  // shot, since text on composited layers such as the overlay gets
  // greyscale AA anyway.
  '--disable-lcd-text',
  // The popup shot reaches into a file:// iframe to size it to its content.
  '--allow-file-access-from-files',
  '--mute-audio',
  '--window-size=1280,800'
];

/* Starts Chrome; resolves once its DevTools endpoint is known. dispose() is
 * safe to call at any point, including before the endpoint arrives. */
function launchChrome(executable) {
  const profile = mkdtempSync(join(tmpdir(), 'speedreader-store-'));
  const child = spawn(executable, [...CHROME_FLAGS, `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));

  const endpoint = new Promise((resolve, reject) => {
    let log = '';
    const timer = setTimeout(() => {
      reject(new Error(`Chrome didn't report a DevTools endpoint.\n${log.slice(-2000)}`));
    }, STEP_TIMEOUT_MS);
    // Keep draining stderr even after the endpoint shows up, or a chatty
    // Chrome could fill the pipe and stall.
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (text) => {
      log += text;
      const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    child.once('error', (err) => { clearTimeout(timer); reject(err); });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Chrome exited (${code}) before it was ready.\n${log.slice(-2000)}`));
    });
  });

  async function dispose() {
    // No pid: it never started, and there's no exit to wait for.
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000).unref())]);
    }
    // Chrome's helper processes can hold the profile open for a moment after
    // the browser process is gone, which on Windows makes deleting it fail.
    rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
  }

  return { endpoint, dispose };
}

/* --------------------------------------------------- DevTools protocol */

/* One WebSocket to the browser; pages are reached through flat sessions. */
class Cdp {
  static connect(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => resolve(new Cdp(ws)), { once: true });
      ws.addEventListener('error', () => reject(new Error(`couldn't connect to ${url}`)), { once: true });
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    ws.addEventListener('message', (event) => this.receive(JSON.parse(event.data)));
    ws.addEventListener('close', () => {
      for (const id of [...this.pending.keys()]) this.settle(id, 'connection closed');
    });
  }

  /* Ends call `id`: rejects with `failure` if given, else resolves with
   * `result`. A call that has already ended is ignored. */
  settle(id, failure, result) {
    const call = this.pending.get(id);
    if (!call) return;
    this.pending.delete(id);
    clearTimeout(call.timer);
    if (failure) call.reject(new Error(`${call.method}: ${failure}`));
    else call.resolve(result);
  }

  receive(message) {
    if (message.id !== undefined) {
      this.settle(message.id, message.error && message.error.message, message.result);
      return;
    }
    for (const listener of this.listeners) listener(message);
  }

  /* Every call gets an answer within STEP_TIMEOUT_MS or fails. A renderer
   * stuck in a setup script's endless loop never replies to Runtime.evaluate,
   * and without this the run would hang rather than fail and clean up. */
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      // A closed socket drops what it's sent; fail now rather than time out.
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`${method}: connection closed`));
        return;
      }
      const timer = setTimeout(() => this.settle(id, `no reply after ${STEP_TIMEOUT_MS / 1000}s`),
        STEP_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  }

  /* Calls fn(method, params) for every event on `sessionId`. Returns an off(). */
  on(sessionId, fn) {
    const listener = (message) => {
      if (message.sessionId === sessionId) fn(message.method, message.params);
    };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* Resolves with the params of the next `method` event on `sessionId`.
   * Start waiting before sending the command that causes the event, so a
   * quick one isn't missed. If that command fails, the wait is abandoned
   * unawaited: the caller marks it handled, and the timer is unref'd so it
   * can't hold the process open after the run has given up. While the run
   * is still going, the open socket keeps the process alive anyway. */
  once(sessionId, method, what) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`timed out waiting for ${what}`)); },
        STEP_TIMEOUT_MS);
      timer.unref();
      const off = this.on(sessionId, (name, params) => {
        if (name !== method) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  close() {
    this.ws.close();
  }
}

/* ---------------------------------------------------------------- a shot */

function initScript(shot) {
  const config = {
    settings: shot.settings || {},
    params: shot.params || {},
    extensionRoot: pathToFileURL(ROOT + sep).href
  };
  return [`window.__SHOT__ = ${JSON.stringify(config)};`, ...INIT_SCRIPTS].join('\n');
}

function describeException(details) {
  const ex = details.exception;
  return (ex && (ex.description || ex.value)) || details.text;
}

async function waitForReady(page, shot) {
  const deadline = Date.now() + STEP_TIMEOUT_MS;
  for (;;) {
    const { result } = await page('Runtime.evaluate', {
      expression: 'window.__shotError || window.__shotReady === true',
      returnByValue: true
    });
    if (typeof result.value === 'string') throw new Error(`setup failed:\n${result.value}`);
    if (result.value === true) return;
    if (Date.now() > deadline) throw new Error(`never became ready (${shot.setup || 'no setup'})`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/* Each shot gets a fresh tab, so no init script or state carries over. */
async function renderShot(cdp, shot) {
  const [width, height] = shot.size;
  let targetId = null;
  let off = () => {};

  try {
    ({ targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' }));
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = (method, params) => cdp.send(method, params, sessionId);

    // Anything the page complains about means the shot can't be trusted.
    const problems = [];
    off = cdp.on(sessionId, (method, params) => {
      if (method === 'Runtime.exceptionThrown') problems.push(describeException(params.exceptionDetails));
      if (method === 'Log.entryAdded' && params.entry.level === 'error') {
        problems.push(`${params.entry.text}${params.entry.url ? ` (${params.entry.url})` : ''}`);
      }
    });

    await page('Page.enable');
    await page('Runtime.enable');
    await page('Log.enable');
    await page('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height
    });
    await page('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: shot.colorScheme || 'light' }]
    });
    // A focused page draws its selection in the active colour, not grey.
    await page('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page('Page.addScriptToEvaluateOnNewDocument', { source: initScript(shot) });

    const url = pathToFileURL(join(HERE, shot.page)).href;
    const loaded = cdp.once(sessionId, 'Page.loadEventFired', `${shot.page} to load`);
    // If navigating fails, nothing awaits `loaded`; without this its timeout
    // would surface 20 s later as a second, unhandled error.
    loaded.catch(() => {});
    const navigation = await page('Page.navigate', { url });
    if (navigation.errorText) throw new Error(`couldn't open ${url}: ${navigation.errorText}`);
    await loaded;

    const setup = shot.setup ? readFileSync(join(HERE, shot.setup), 'utf8') : DEFAULT_SETUP;
    const run = await page('Runtime.evaluate', { expression: setup });
    if (run.exceptionDetails) throw new Error(`setup threw: ${describeException(run.exceptionDetails)}`);
    await waitForReady(page, shot);

    if (problems.length) throw new Error(`the page reported errors:\n  ${problems.join('\n  ')}`);

    const { data } = await page('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(join(HERE, shot.file), Buffer.from(data, 'base64'));
  } catch (err) {
    err.message = `${shot.file}: ${err.message}`;
    throw err;
  } finally {
    off();
    if (targetId) await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

/* ------------------------------------------------------------- checking */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/* From the IHDR chunk, which a PNG must lead with: size, bit depth and
 * colour type (2 is truecolour RGB, 6 is RGB with alpha). */
function pngHeader(file) {
  const head = readFileSync(file).subarray(0, 26);
  if (head.length < 26 || !head.subarray(0, 8).equals(PNG_SIGNATURE) ||
      head.toString('latin1', 12, 16) !== 'IHDR') {
    throw new Error(`${file} is not a PNG`);
  }
  return {
    width: head.readUInt32BE(16),
    height: head.readUInt32BE(20),
    bitDepth: head[24],
    colourType: head[25]
  };
}

/* The store wants screenshots and promo tiles at an exact size, as 24-bit
 * PNG with no alpha: 8-bit RGB, colour type 2. */
function verify(shots) {
  let ok = true;
  for (const shot of shots) {
    const png = pngHeader(join(HERE, shot.file));
    const faults = [];
    if (png.width !== shot.size[0] || png.height !== shot.size[1]) {
      faults.push(`want ${shot.size[0]}×${shot.size[1]}`);
    }
    if (png.colourType !== 2 || png.bitDepth !== 8) {
      faults.push(`want 24-bit RGB, got colour type ${png.colourType} at ${png.bitDepth}-bit`);
    }
    if (faults.length) ok = false;
    console.log(`${faults.length ? 'BAD ' : 'ok  '} ${shot.file}  ${png.width}×${png.height}` +
      (faults.length ? `  (${faults.join('; ')})` : ''));
  }
  if (!ok) throw new Error('some images are not what the store accepts');
}

/* ----------------------------------------------------------------- main */

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/* Shots are named by file, with or without the .png. */
function selectShots(names) {
  if (!names.length) return SHOTS;
  const key = (name) => name.replace(/\.png$/, '');
  const known = SHOTS.map((shot) => key(shot.file));
  const unknown = names.filter((name) => !known.includes(key(name)));
  if (unknown.length) {
    throw new Error(`no such shot: ${unknown.join(', ')}\nAvailable: ${known.join(', ')}`);
  }
  const wanted = names.map(key);
  return SHOTS.filter((shot) => wanted.includes(key(shot.file)));
}

async function main() {
  const shots = selectShots(process.argv.slice(2));
  const chrome = launchChrome(findChrome());

  // Ctrl+C, a kill or a closed terminal still takes Chrome and its profile
  // down with it. (Windows raises SIGHUP when the console window closes; an
  // outright TerminateProcess can't be caught anywhere.)
  const interrupt = (signal) => {
    chrome.dispose().finally(() => process.exit(128 + (osConstants.signals[signal] || 0)));
  };
  for (const signal of SIGNALS) process.once(signal, interrupt);

  try {
    const cdp = await Cdp.connect(await chrome.endpoint);
    try {
      for (const shot of shots) {
        await renderShot(cdp, shot);
        console.log(`wrote store/${shot.file}`);
      }
      await cdp.send('Browser.close').catch(() => {});
    } finally {
      cdp.close();
    }
  } finally {
    for (const signal of SIGNALS) process.removeListener(signal, interrupt);
    await chrome.dispose();
  }

  verify(shots);
}

// The message is the useful part; a setup failure carries the page's own stack.
main().catch((err) => {
  console.error(`render failed: ${err && err.message ? err.message : err}`);
  process.exitCode = 1;
});
