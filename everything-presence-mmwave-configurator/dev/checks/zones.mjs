// Zones mode end to end: draw a polygon in Office with undo/redo and save it to HA, then draw and save a rectangle in Living Room.
// Usage: node dev/checks/zones.mjs
// Requires a running stack (dev/run-local.sh) with the seeded rooms, and `chromium` on PATH. Restores the fake HA values it changed.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const WebSocket = createRequire(import.meta.url)('ws');

const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const haUrl = process.env.FAKE_HA_URL ?? 'http://127.0.0.1:8124';
const polygonEntity = 'text.office_office_ep1_polygon_zone_2';
const proPrefix = 'number.everything_presence_pro_225500';
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
const ha = (path, init = {}) =>
  fetch(`${haUrl}${path}`, { ...init, headers: { Authorization: 'Bearer fake', 'Content-Type': 'application/json' } });
const haState = async (entity) => (await (await ha(`/api/states/${entity}`)).json()).state;
const setHa = (entity, state) => ha(`/api/states/${entity}`, { method: 'POST', body: JSON.stringify({ state }) });

const mouse = (type, [x, y], extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const click = async (point) => {
  await mouse('mouseMoved', point, { button: 'none' });
  await mouse('mousePressed', point, { buttons: 1 });
  await mouse('mouseReleased', point);
  await sleep(250);
};
const key = (key, code, keyCode, modifiers) =>
  ['keyDown', 'keyUp'].reduce((p, type) => p.then(() =>
    send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, modifiers })), Promise.resolve());
const pickRadio = (group, value) =>
  evaluate(`(() => { const i = document.querySelector('[aria-label="${group}"] input[value="${value}"]'); if (!i || i.disabled) return false; i.click(); return true; })()`);
const clickButton = (text) => evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find((el) => el.offsetParent !== null && el.textContent.trim() === ${JSON.stringify(text)} && !el.disabled);
  if (!b) return false; b.click(); return true; })()`);
const slotBadge = () => evaluate(`[...document.querySelectorAll('aside span')].map((s) => s.textContent.trim()).find((t) => /^\\d+ of \\d+ used$/.test(t)) ?? null`);

// Room mm to screen px, from the drawn outline path and the room's own outline points.
const screenMapper = async (room) => {
  const { pts, ctm } = await evaluate(`(() => {
    const path = document.querySelector('[role=application] [data-canvas-layer="shell"] > path');
    const nums = path.getAttribute('d').match(/-?[\\d.]+(e-?\\d+)?/g).map(Number);
    const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
    const m = path.getScreenCTM(); return { pts, ctm: [m.a, m.b, m.c, m.d, m.e, m.f] }; })()`);
  const outline = room.roomShell.points;
  const last = outline.length - 1;
  const sx = (pts[1][0] - pts[0][0]) / (outline[1].x - outline[0].x);
  const sy = (pts[last][1] - pts[0][1]) / (outline[last].y - outline[0].y);
  return (x, y) => {
    const cx = pts[0][0] + (x - outline[0].x) * sx;
    const cy = pts[0][1] + (y - outline[0].y) * sy;
    return [ctm[0] * cx + ctm[2] * cy + ctm[4], ctm[1] * cx + ctm[3] * cy + ctm[5]];
  };
};

const openZones = async (room) => {
  await evaluate(`location.hash = '#/room/${room.id}/zones'`);
  return waitFor(`(() => { const b = [...document.querySelectorAll('aside span')].some((s) => /^\\d+ of \\d+ used$/.test(s.textContent.trim())); return b && !document.querySelector('[aria-label="Loading zones"]'); })()`, 15000);
};

await send('Page.enable');
await send('Page.navigate', { url: base });
await sleep(1500);
const rooms = await evaluate(`fetch('api/rooms').then((r) => r.json()).then((d) => d.rooms)`);
const office = rooms.find((r) => r.name === 'Office');
const living = rooms.find((r) => r.name === 'Living Room');
check(Boolean(office && living), 'Office and Living Room exist');

const initialPolygon = await haState(polygonEntity);
check(await openZones(office), 'Office zones mode loads');
check(await slotBadge() === '1 of 8 used', `Office starts with one zone (${await slotBadge()})`);
check(await pickRadio('Tool', 'polygon'), 'the Polygon tool is selectable');
check(await pickRadio('Zone kind', 'regular'), 'the Zone kind is selectable');
const officeAt = await screenMapper(office);
const square = [[700, 1200], [1900, 1200], [1900, 2800], [700, 2800]].map(([x, y]) => officeAt(x, y));
for (const point of square) await click(point);
check(await evaluate(`document.querySelector('[data-draft-points]')?.getAttribute('data-draft-points')`) === '4', 'the drawing panel counts 4 points');
await click(square[0]);
check(Boolean(await waitFor(`document.querySelectorAll('aside table tbody tr').length === 4`)), 'the inspector shows the new zone with 4 points');
check(await evaluate(`document.activeElement?.tagName === 'INPUT' && document.activeElement.placeholder.startsWith('e.g.')`), 'Name has focus after drawing');
await evaluate(`document.querySelector('aside button[aria-label="Back to room"]')?.click()`);
check(Boolean(await waitFor(`${JSON.stringify('2 of 8 used')} === ([...document.querySelectorAll('aside span')].map((s) => s.textContent.trim()).find((t) => /^\\d+ of \\d+ used$/.test(t)))`)), 'the slot badge reads 2 of 8 used');
check(await evaluate(`/4 points/.test(document.querySelector('[data-zone-row="Zone 2"]')?.textContent ?? '')`), 'the zones list shows Zone 2 with 4 points');

await key('z', 'KeyZ', 90, 2);
check(Boolean(await waitFor(`!document.querySelector('[data-zone-row="Zone 2"]')`, 3000)), 'Ctrl+Z removes the zone');
await key('Z', 'KeyZ', 90, 10);
check(Boolean(await waitFor(`Boolean(document.querySelector('[data-zone-row="Zone 2"]'))`, 3000)), 'Ctrl+Shift+Z brings it back');

check(await clickButton('Save zones'), 'Save zones is clickable');
let text = '';
for (let t = 0; t < 8000 && !text; t += 250) { await sleep(250); text = await haState(polygonEntity); }
const pairs = text ? text.split(';').filter((p) => /^-?\d+(\.\d+)?:-?\d+(\.\d+)?$/.test(p)) : [];
check(pairs.length === 4 && pairs.length === text.split(';').length, `HA holds a 4 point polygon (${text})`);
check(Boolean(await waitFor(`[...document.querySelectorAll('output')].some((o) => /All changes saved/.test(o.textContent))`)), 'the toolbar reads All changes saved');

const rectEntities = (slot) => ['start_x', 'end_x', 'start_y', 'end_y'].map((s) => `${proPrefix}_zone_${slot}_${s}`);
check(await openZones(living), 'Living Room zones mode loads');
check(await pickRadio('Tool', 'rectangle'), 'the Rectangle tool is selectable');
check(!(await evaluate(`Boolean(document.querySelector('[aria-label="Tool"] input[value="polygon"]'))`)), 'rectangle mode offers no Polygon tool');
await pickRadio('Zone kind', 'regular');
const slot = Number((await evaluate(`document.querySelector('aside')?.textContent.match(/slot Zone (\\d)/)?.[1] ?? ''`)) || 0);
check(slot > 0, `the drawing panel names the target slot (Zone ${slot})`);
const initialRect = await Promise.all(rectEntities(slot).map(haState));
const livingAt = await screenMapper(living);
const [from, to] = [livingAt(300, 600), livingAt(1100, 2500)];
await mouse('mouseMoved', from, { button: 'none' });
await mouse('mousePressed', from, { buttons: 1 });
for (let i = 1; i <= 8; i++)
  await mouse('mouseMoved', [from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8], { buttons: 1 });
await mouse('mouseReleased', to);
check(Boolean(await waitFor(`[...document.querySelectorAll('aside label')].some((l) => l.textContent.trim() === 'Width')`)), 'the new rectangle is selected with its size fields');
check(await clickButton('Save zones'), 'Save zones is clickable in Living Room');
let startX = initialRect[0];
for (let t = 0; t < 8000 && startX === initialRect[0]; t += 250) { await sleep(250); startX = await haState(rectEntities(slot)[0]); }
check(startX !== initialRect[0], `zone_${slot}_start_x changed (${initialRect[0]} -> ${startX})`);

await setHa(polygonEntity, initialPolygon);
await Promise.all(rectEntities(slot).map((entity, i) => setHa(entity, initialRect[i])));
await evaluate(`fetch('api/rooms/${living.id}', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zones: ${JSON.stringify(living.zones)} }) })`);
ws.close();
cleanup();
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all zones checks passed');
