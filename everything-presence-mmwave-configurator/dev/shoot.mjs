// Screenshots the configurator's views through headless chromium over CDP.
// Usage: node dev/shoot.mjs <outDir> [width height] [--mobile]
// Requires a running stack (dev/run-local.sh) and `chromium` on PATH.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const WebSocket = createRequire(import.meta.url)("ws");

const outDir = process.argv[2] ?? 'dev/.shots';
const mobile = process.argv.includes('--mobile');
const width = Number(process.argv[3]) || (mobile ? 390 : 1600);
const height = Number(process.argv[4]) || (mobile ? 844 : 1000);
const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const port = 9333 + Math.floor(Math.random() * 500);
mkdirSync(outDir, { recursive: true });

const chrome = spawn('chromium', [
  '--headless=new', `--remote-debugging-port=${port}`, `--window-size=${width},${height}`,
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
  await sleep(600);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`shot ${name}`);
};
// Click the first visible button whose text matches; false when absent.
const click = async (textRe) => evaluate(`(() => {
  const re = new RegExp(${JSON.stringify(textRe)}, 'i');
  const el = [...document.querySelectorAll('button, a, [role=button]')].find((b) => b.offsetParent !== null && re.test(b.textContent.trim()));
  if (!el) return false; el.click(); return true; })()`);

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
await send('Page.navigate', { url: base });
await sleep(2500);
await shot('01-live');

// Routes are hash based (#/room/<id>/<mode>, #/settings/<section>, #/rooms, #/wizard).
const go = async (hash, name, settle = 1800) => {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(settle);
  await shot(name);
};
const roomBase = (await evaluate('location.hash')).replace(/\/(live|zones|build)$/, '');
const roomIds = await evaluate(`fetch('api/rooms').then((r) => r.json()).then((d) => d.rooms.map((room) => room.id))`);
const otherRoom = roomIds.find((id) => !roomBase.endsWith(id));

if (otherRoom) await go(`#/room/${otherRoom}/live`, '02-room-switch');
await go(`${roomBase}/build`, '03-room-builder');
await go('#/settings/appearance', '04-settings');
await go('#/settings/firmware', '04b-settings-firmware', 1200);
await go('#/rooms', '05-rooms', 1200);
await go(`${roomBase}/zones`, '06-zone-editor');
if (await click('Show Zone Slots|Zone Slots')) { await sleep(600); await shot('07-zone-editor-slots'); }
await go('#/wizard', '08-wizard');

// A cold load of a deep link must land on that room and mode.
await send('Page.navigate', { url: `${base}${roomBase}/zones` });
await sleep(2500);
await shot('09-deeplink-zones');

// Phone: the top bar title opens the room switcher sheet.
if (mobile && (await evaluate(`(() => { const b = document.querySelector('header button[aria-haspopup="dialog"]'); if (!b) return false; b.click(); return true; })()`))) {
  await sleep(600);
  await shot('10-room-switcher-sheet');
}

ws.close();
cleanup();
