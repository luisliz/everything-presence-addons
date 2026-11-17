// Layout mode end to end: draw tool, corner drag resizes the room, door tool places a door, device placement edits the cone, Save writes the room.
// Usage: node dev/checks/layout.mjs
// Requires a running stack (dev/run-local.sh) with the seeded Bedroom room, and `chromium` on PATH. Restores the room afterwards.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const WebSocket = createRequire(import.meta.url)('ws');

const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const haUrl = process.env.FAKE_HA_URL ?? 'http://127.0.0.1:8124';
const port = 9333 + Math.floor(Math.random() * 500);

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
const waitFor = async (expression, timeoutMs = 8000) => {
  for (let t = 0; t < timeoutMs; t += 200) {
    const value = await evaluate(expression);
    if (value) return value;
    await sleep(200);
  }
  return null;
};
const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const mouse = (type, [x, y]) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
const click = async (point) => { await mouse('mousePressed', point); await mouse('mouseReleased', point); await sleep(300); };
const centerOf = (selector) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
const pickTool = (label) => evaluate(`(() => { const i = document.querySelector('[role=radiogroup][aria-label="Tool"] input[aria-label="${label}"]'); if (!i) return false; i.click(); return true; })()`);
const inspector = () => evaluate(`document.querySelector('aside[aria-label="Inspector"]')?.textContent ?? ''`);
const ha = (path, init = {}) =>
  fetch(`${haUrl}${path}`, { ...init, headers: { Authorization: 'Bearer fake', 'Content-Type': 'application/json' } });

const rooms = (await (await fetch(`${base}api/rooms`)).json()).rooms;
const original = rooms.find((room) => room.name === 'Bedroom');
check(Boolean(original), 'Bedroom room exists');
if (!original) process.exit(1);
const angleEntity = `number.${original.entityNamePrefix}_installation_angle`;
const angleBefore = (await (await ha(`/api/states/${angleEntity}`)).json()).state;
await ha(`/api/states/${angleEntity}`, { method: 'POST', body: JSON.stringify({ state: '0' }) });

try {
  await send('Page.enable');
  await send('Page.navigate', { url: `${base}#/room/${original.id}/build` });
  check(Boolean(await waitFor(`Boolean(document.querySelector('[data-canvas-layer="handles"] circle'))`)), 'the Layout canvas shows corner handles');
  await sleep(800);

  check(await pickTool('Walls'), 'the Walls tool is selectable');
  await sleep(300);
  check(/Drawing walls/.test(await inspector()), 'the inspector switches to the wall drawing help');
  await pickTool('Select');
  await sleep(300);

  const sizeBefore = await evaluate(`document.querySelector('output[aria-label="Room size"]')?.textContent`);
  const corner = await centerOf('[data-canvas-layer="handles"] > g circle');
  const centroidX = await evaluate(`(() => { const xs = [...document.querySelectorAll('[data-canvas-layer="handles"] > g circle:first-child')].map((c) => { const r = c.getBoundingClientRect(); return r.x + r.width / 2; }); return xs.reduce((s, x) => s + x, 0) / xs.length; })()`);
  const outward = corner[0] < centroidX ? -30 : 30;
  await mouse('mousePressed', corner);
  for (let step = 1; step <= 10; step++) await mouse('mouseMoved', [corner[0] + step * outward, corner[1]]);
  await mouse('mouseReleased', [corner[0] + 10 * outward, corner[1]]);
  await sleep(400);
  const sizeAfter = await evaluate(`document.querySelector('output[aria-label="Room size"]')?.textContent`);
  check(Boolean(sizeBefore && sizeAfter && sizeBefore !== sizeAfter), `dragging a corner 300 px changes the room size (${sizeBefore} -> ${sizeAfter})`);

  check(await pickTool('Door'), 'the Door tool is selectable');
  await sleep(300);
  const [a, b] = await evaluate(`[...document.querySelectorAll('[data-canvas-layer="handles"] > g')].slice(1, 3).map((g) => { const r = g.querySelector('circle').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })`);
  await click([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  check(Boolean(await waitFor(`/Position along wall/.test(document.querySelector('aside[aria-label="Inspector"]')?.textContent ?? '')`)), 'placing a door on a wall opens the door panel');

  await click(await centerOf('circle[aria-label="Device marker"]'));
  check(Boolean(await waitFor(`Boolean(document.querySelector('input[aria-label="Device X"]') && document.querySelector('input[aria-label="Device Y"]'))`)), 'clicking the device marker shows Placement X and Y');

  await evaluate(`(() => {
    const el = document.querySelector('input[aria-label="Device rotation"]');
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '15');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur();
  })()`);
  const rotation = await waitFor(`(() => { const v = document.querySelector('[data-coverage-rotation]')?.getAttribute('data-coverage-rotation'); return v === '15' ? v : null; })()`);
  check(rotation === '15', `the cone rotation follows the Rotation field (${await evaluate(`document.querySelector('[data-coverage-rotation]')?.getAttribute('data-coverage-rotation')`)})`);

  check(await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((el) => el.offsetParent && el.textContent.trim() === 'Save layout' && !el.disabled); if (!b) return false; b.click(); return true; })()`), 'Save layout is enabled and clickable');
  check(Boolean(await waitFor(`[...document.querySelectorAll('output')].some((o) => /All changes saved/.test(o.textContent))`)), 'the toolbar reports all changes saved');

  const savedRoom = (await (await fetch(`${base}api/rooms`)).json()).rooms.find((room) => room.id === original.id);
  check(savedRoom?.devicePlacement?.rotationDeg === 15, `the saved device rotation is 15 (${savedRoom?.devicePlacement?.rotationDeg})`);
  check(savedRoom?.doors?.length === 1, `the saved room has one door (${savedRoom?.doors?.length})`);
} finally {
  const { id: roomId, ...body } = original;
  const restored = await fetch(`${base}api/rooms/${roomId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  check(restored.ok, 'the original Bedroom is restored');
  await ha(`/api/states/${angleEntity}`, { method: 'POST', body: JSON.stringify({ state: angleBefore }) });
  ws.close();
  cleanup();
}
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all layout checks passed');
