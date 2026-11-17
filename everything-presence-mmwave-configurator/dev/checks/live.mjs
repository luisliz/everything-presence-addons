// Live mode end to end: targets move, the device marker opens Sensor, a draft angle previews on the cone, Apply writes HA.
// Usage: node dev/checks/live.mjs
// Requires a running stack (dev/run-local.sh) with the seeded Office room, and `chromium` on PATH.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const WebSocket = createRequire(import.meta.url)('ws');

const base = process.env.APP_URL ?? 'http://127.0.0.1:42069/';
const haUrl = process.env.FAKE_HA_URL ?? 'http://127.0.0.1:8124';
const entity = 'number.office_office_ep1_installation_angle';
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
const deviceAngle = async () => Number((await (await ha(`/api/states/${entity}`)).json()).state);

// Start from a known device value so the draft to 20 is always dirty.
await ha(`/api/states/${entity}`, { method: 'POST', body: JSON.stringify({ state: '0' }) });

await send('Page.enable');
await send('Page.navigate', { url: base });
await sleep(1500);
const officeId = await evaluate(`fetch('api/rooms').then((r) => r.json()).then((d) => d.rooms.find((room) => room.name === 'Office')?.id)`);
check(Boolean(officeId), 'Office room exists');
await evaluate(`location.hash = '#/room/${officeId}/live'`);
await sleep(2000);

const sample = `(() => { const c = document.querySelector('[data-target-id] circle'); return c ? [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))] : null; })()`;
const first = await waitFor(sample);
await sleep(1200);
const second = await evaluate(sample);
check(Boolean(first), 'a target circle is drawn');
check(Boolean(first && second && Math.hypot(first[0] - second[0], first[1] - second[1]) > 0.5), `the target moves (${first} -> ${second})`);

await evaluate(`document.querySelector('[data-device-marker]').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
await sleep(400);
check(
  await evaluate(`document.querySelector('#sensor-section header button')?.getAttribute('aria-expanded') === 'true'`),
  'clicking the device marker expands the Sensor section',
);

const input = `document.querySelector('[data-setting-key="installationAngle"] input')`;
check(Boolean(await waitFor(`Boolean(${input})`)), 'the installation angle field is shown');
const cone = `(() => { const g = document.querySelector('[data-coverage-rotation]'); const p = document.querySelector('[data-canvas-layer="device"] > path'); return { rotation: g?.getAttribute('data-coverage-rotation'), d: p?.getAttribute('d') }; })()`;
const before = await evaluate(cone);
await evaluate(`(() => {
  const el = ${input};
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '20');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.blur();
})()`);
await sleep(500);
const after = await evaluate(cone);
check(before.rotation !== after.rotation && Number(after.rotation) === Number(before.rotation) + 20, `the cone rotation previews the draft (${before.rotation} -> ${after.rotation})`);
check(Boolean(before.d && after.d && before.d !== after.d), 'the cone path moves before Apply');
check((await deviceAngle()) === 0, 'the device still holds 0 before Apply');
check(Boolean(await evaluate(`[...document.querySelectorAll('output')].some((o) => /Previewing 1 unapplied change/.test(o.textContent))`)), 'the preview chip is shown');

const clicked = await evaluate(`(() => {
  const b = [...document.querySelectorAll('aside button')].find((el) => el.textContent.trim() === 'Apply' && !el.disabled);
  if (!b) return false; b.click(); return true; })()`);
check(clicked, 'Apply is clickable in the inspector');
let state = await deviceAngle();
for (let t = 0; state !== 20 && t < 6000; t += 200) {
  await sleep(200);
  state = await deviceAngle();
}
check(state === 20, `HA holds the applied angle (state ${state})`);
check(Boolean(await waitFor(`![...document.querySelectorAll('output')].some((o) => /unapplied/.test(o.textContent))`)), 'the draft is clean after Apply');

await ha(`/api/states/${entity}`, { method: 'POST', body: JSON.stringify({ state: '0' }) });
ws.close();
cleanup();
if (failures.length) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('all live checks passed');
