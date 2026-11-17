// Setup wizard end to end: bind "EP1 Living Room" to a new room "Hallway", draw it, place it, draw a zone, finish.
// Usage: node dev/checks/wizard.mjs   (SHOTS=<dir> also writes a PNG per step)
// Requires a running stack (dev/run-local.sh) with the seeded rooms, and `chromium` on PATH. Deletes the room and restores the fake HA values it changed.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const WebSocket = createRequire(import.meta.url)('ws');

const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const haUrl = process.env.FAKE_HA_URL ?? 'http://127.0.0.1:8124';
const shots = process.env.SHOTS;
const devicePrefix = 'living_room_ep1_living_room';
const port = 9333 + Math.floor(Math.random() * 500);
if (shots) mkdirSync(shots, { recursive: true });

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
const shot = async (name) => {
  if (!shots) return;
  await sleep(500);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(shots, `${name}.png`), Buffer.from(data, 'base64'));
};

const failures = [];
const check = (ok, message) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
  if (!ok) failures.push(message);
};
const ha = (p, init = {}) =>
  fetch(`${haUrl}${p}`, { ...init, headers: { Authorization: 'Bearer fake', 'Content-Type': 'application/json' } });
const deviceStates = async () =>
  (await (await ha('/api/states')).json()).filter((s) => /^(text|number)\./.test(s.entity_id) && s.entity_id.includes(devicePrefix));
const api = (p, init) => evaluate(`fetch('api/${p}', ${JSON.stringify(init ?? {})}).then((r) => r.json())`);

const mouse = (type, [x, y], extra = {}) =>
  send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
const pickRadio = (group, value) =>
  evaluate(`(() => { const i = document.querySelector('[aria-label="${group}"] input[value="${value}"]'); if (!i || i.disabled) return false; i.click(); return true; })()`);
const enabledButton = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find((el) => el.offsetParent !== null && el.textContent.trim().startsWith(${JSON.stringify(text)}) && !el.disabled)`;
const clickButton = async (text, scope) => {
  const ok = await waitFor(`Boolean(${enabledButton(text, scope)})`);
  if (ok) await evaluate(`${enabledButton(text, scope)}.click()`);
  return Boolean(ok);
};
const strip = `document.querySelector('section[aria-label="Setup step"]')`;
const onStep = (title) => waitFor(`${strip}?.querySelector('h2')?.textContent === ${JSON.stringify(title)}`, 10000);
const next = () => clickButton('Next', strip);

await send('Page.enable');
await send('Page.navigate', { url: base });
await sleep(1500);
const devices = (await api('devices')).devices;
const ep1 = devices.find((d) => d.name === 'EP1 Living Room');
const pro = devices.find((d) => d.name === 'Everything Presence Pro 225500');
await api('settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wizardStep: 'device', wizardDeviceId: null, wizardProfileId: null }) });
const before = await deviceStates();
await evaluate(`location.hash = '#/wizard'`);
await send('Page.reload');

check(Boolean(await waitFor(`Boolean(document.querySelector('[aria-label="Device"]'))`)), 'the device step lists devices');
check(await evaluate(`(() => { const i = document.querySelector('[aria-label="Device"] input[value="${pro.id}"]'); return Boolean(i?.disabled && /In Living Room/.test(i.closest('label').textContent)); })()`), 'the Pro row is disabled with the In Living Room badge');
await shot('01-device');
check(await pickRadio('Device', ep1.id), 'EP1 Living Room is selectable');
check(await clickButton('Continue'), 'Continue leaves the device step');

check(await clickButton('Continue', `document.querySelector('main')`) && Boolean(await waitFor(`Boolean(document.querySelector('[aria-label="Room"]'))`, 15000)), 'entity discovery completes');
await shot('02-room-choice');
check(await pickRadio('Room', 'new'), 'New room is selectable');
check(await clickButton('Continue'), 'Continue leaves the room choice');
check(Boolean(await waitFor(`Boolean(document.querySelector('main input:not([type=radio])'))`)), 'the room name field shows');
await evaluate(`document.querySelector('main input:not([type=radio])').focus()`);
await send('Input.insertText', { text: 'Hallway' });
check(await clickButton('Create room'), 'Create room is clickable');

check(Boolean(await onStep('Draw walls')), 'the outline step renders the room screen with the step strip');
check(await evaluate(`${enabledButton('Next', strip)} === undefined`), 'Next is disabled before the outline is saved');
await shot('03-outline');
await evaluate(`document.querySelector('button[aria-label="Start from a shape"]').click()`);
check(await clickButton('Rectangle'), 'the Rectangle shape applies');
check(await clickButton('Save layout'), 'Save layout is clickable');
check(await next(), 'Next unlocks after saving the outline');
check(Boolean(await onStep('Place device')), 'placement step');
await send('Page.reload');
check(Boolean(await onStep('Place device')), 'a reload resumes on the placement step');
check(await next(), 'Next on placement');
check(Boolean(await onStep('Add doors')), 'doors step');
check(await next(), 'Next skips doors');
check(Boolean(await onStep('Add furniture')), 'furniture step');
check(await next(), 'Next skips furniture');

check(Boolean(await onStep('Draw zones')), 'zones step');
check(Boolean(await waitFor(`[...document.querySelectorAll('aside span')].some((s) => /^\\d+ of \\d+ used$/.test(s.textContent.trim())) && !document.querySelector('[aria-label="Loading zones"]')`, 15000)), 'zones mode loads');
check(await pickRadio('Tool', 'rectangle'), 'the Rectangle tool is selectable');
await pickRadio('Zone kind', 'regular');
const box = await evaluate(`(() => { const r = document.querySelector('[role=application] [data-canvas-layer="shell"] > path').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
const [from, to] = [[box[0] + box[2] * 0.3, box[1] + box[3] * 0.3], [box[0] + box[2] * 0.7, box[1] + box[3] * 0.7]];
await mouse('mouseMoved', from, { button: 'none' });
await mouse('mousePressed', from, { buttons: 1 });
for (let i = 1; i <= 8; i++)
  await mouse('mouseMoved', [from[0] + ((to[0] - from[0]) * i) / 8, from[1] + ((to[1] - from[1]) * i) / 8], { buttons: 1 });
await mouse('mouseReleased', to);
check(await clickButton('Save zones'), 'Save zones is clickable');
await shot('04-zones');
check(await next(), 'Next unlocks after saving zones');

check(Boolean(await waitFor(`Boolean(document.querySelector('[data-wizard-summary] svg path'))`)), 'the finish step renders the room thumbnail');
await shot('05-finish');
check(await clickButton('Open room'), 'Open room is clickable');
const rooms = (await api('rooms')).rooms;
const hallway = rooms.find((r) => r.name === 'Hallway');
check(Boolean(await waitFor(`location.hash === '#/room/${hallway?.id}/live'`)), `Open room lands on #/room/${hallway?.id}/live`);
check(hallway?.deviceId === ep1.id, 'Hallway is bound to EP1 Living Room');
check(hallway?.roomShell?.points?.length === 4, `Hallway has a 4 point outline (${hallway?.roomShell?.points?.length})`);

if (hallway) await api(`rooms/${hallway.id}`, { method: 'DELETE' });
const after = await deviceStates();
for (const state of after) {
  const old = before.find((s) => s.entity_id === state.entity_id);
  if (old && old.state !== state.state)
    await ha(`/api/states/${state.entity_id}`, { method: 'POST', body: JSON.stringify({ state: old.state }) });
}
ws.close();
cleanup();
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all wizard checks passed');
