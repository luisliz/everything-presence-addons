// Screenshots the Rooms screen and Settings > Firmware at desktop and phone size, then asserts on both.
// Usage: node dev/checks/rooms-settings.mjs [outDir]
// Requires a running stack (dev/run-local.sh) seeded with three rooms, and `chromium` on PATH.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const WebSocket = createRequire(import.meta.url)('ws');

const outDir = process.argv[2] ?? 'dev/.shots/step5';
const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const port = 9333 + Math.floor(Math.random() * 500);
mkdirSync(outDir, { recursive: true });

const chrome = spawn('chromium', [
  '--headless=new', `--remote-debugging-port=${port}`, '--window-size=1600,1000',
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  `--user-data-dir=/tmp/claude-shoot-${port}`, 'about:blank',
], { stdio: 'ignore' });
const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} };
process.on('exit', cleanup);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (p) => (await fetch(`http://127.0.0.1:${port}${p}`)).json();

let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await fetchJson('/json'); break; } catch { await sleep(100); }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.once('open', r));
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const n = ++id;
  pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
  ws.send(JSON.stringify({ id: n, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ''}`);
  return r.result.value;
};
const shot = async (name) => {
  await sleep(500);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`shot ${name}`);
};

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};

const open = async (hash) => {
  await send('Page.navigate', { url: 'about:blank' });
  await send('Page.navigate', { url: `${base}${hash}` });
  await sleep(2500);
};

await send('Page.enable');
for (const [label, width, height, mobile] of [['desktop', 1600, 1000, false], ['phone', 390, 844, true]]) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });

  await open('#/rooms');
  await shot(`rooms-${label}`);
  const cards = await evaluate(`document.querySelectorAll('main article').length`);
  check(cards === 3, `${label}: rooms screen shows 3 room cards (found ${cards})`);
  const overflow = await evaluate(`document.documentElement.scrollWidth > window.innerWidth`);
  check(!overflow, `${label}: rooms screen has no horizontal scroll`);

  await evaluate(`document.querySelector('main article button[aria-label="Room actions"]')?.click()`);
  await shot(`rooms-menu-${label}`);
  const menuItems = await evaluate(`[...document.querySelectorAll('[role=menu] [role^=menuitem]')].map((b) => b.textContent.trim())`);
  check(menuItems.includes('Rename') && menuItems.includes('Delete'), `${label}: room actions menu lists Rename and Delete`);

  await open('#/settings/firmware');
  await shot(`settings-firmware-${label}`);
  const firmware = await evaluate(`(() => {
    const section = document.getElementById('settings-firmware');
    if (!section) return null;
    const list = section.querySelector('[role=radiogroup]');
    return {
      top: Math.round(section.getBoundingClientRect().top),
      rows: list ? list.querySelectorAll('input[type=radio]').length : 0,
      selectedPill: [...section.querySelectorAll('*')].some((el) => el.childElementCount === 0 && el.textContent.trim() === 'Selected'),
      noDeviceBadge: section.textContent.includes('No device selected'),
      hash: location.hash,
    };
  })()`);
  check(firmware !== null, `${label}: firmware section is rendered`);
  check(firmware?.rows > 0, `${label}: firmware device list is a radio list (${firmware?.rows} rows)`);
  check(firmware?.selectedPill === false, `${label}: no element reads exactly "Selected"`);
  check(firmware?.noDeviceBadge === false, `${label}: no "No device selected" badge`);
  check(firmware?.top < 200, `${label}: route scrolled the firmware section into view (top ${firmware?.top}px)`);
  check(firmware?.hash === '#/settings/firmware', `${label}: hash stays on firmware (${firmware?.hash})`);

  await evaluate(`document.querySelector('#settings-firmware input[type=radio]')?.click()`);
  await shot(`settings-firmware-selected-${label}`);
  const pickedPill = await evaluate(`[...document.querySelectorAll('#settings-firmware *')].some((el) => el.childElementCount === 0 && el.textContent.trim() === 'Selected')`);
  check(!pickedPill, `${label}: still no "Selected" pill after picking a device`);
}

ws.close();
cleanup();
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
