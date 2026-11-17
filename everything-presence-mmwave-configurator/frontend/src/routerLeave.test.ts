import assert from 'node:assert/strict';
import test from 'node:test';

type Entry = { state: unknown; hash: string };
const entries: Entry[] = [{ state: null, hash: '#/rooms' }];
let position = 0;
const handlers = new Set<() => void>();
const fire = () => {
  for (const handler of handlers) handler();
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

Object.assign(globalThis, {
  window: {
    location: {
      get hash() {
        return entries[position].hash;
      },
    },
    history: {
      get state() {
        return entries[position].state;
      },
      pushState(state: unknown, _: string, hash?: string) {
        entries.splice(position + 1);
        entries.push({ state, hash: hash ?? entries[position].hash });
        position += 1;
      },
      replaceState(state: unknown, _: string, hash?: string) {
        entries[position] = { state, hash: hash ?? entries[position].hash };
      },
      go(delta: number) {
        position += delta;
        setTimeout(fire, 0);
      },
    },
    addEventListener: (_: string, handler: () => void) => handlers.add(handler),
    removeEventListener: (_: string, handler: () => void) =>
      handlers.delete(handler),
  },
  document: { addEventListener() {}, removeEventListener() {} },
});

const router = await import('./router.ts');
router.subscribe(() => {});

const back = async () => {
  position -= 1;
  fire();
  await settle();
};

test('every dirty guard is asked in turn before the move commits', async () => {
  const discarded: string[] = [];
  const sensor = {
    current: { message: 'sensor', onDiscard: () => discarded.push('sensor') },
  };
  const zones = { current: { message: 'zones', onSave: async () => true } };
  const removeSensor = router.addLeaveGuard(sensor);
  const removeZones = router.addLeaveGuard(zones);

  router.navigate({ name: 'wizard' });
  assert.equal(router.currentLeave()?.guard.message, 'sensor');
  router.leaveDecision.discard();
  assert.deepEqual(discarded, ['sensor']);
  assert.equal(router.currentLeave()?.guard.message, 'zones');
  assert.equal(router.acceptedHash(), '#/rooms');
  await router.leaveDecision.save();
  assert.equal(router.currentLeave(), null);
  assert.equal(router.acceptedHash(), '#/wizard');
  assert.equal(entries.length, 2);

  removeSensor();
  removeZones();
});

test('a failed save keeps the prompt on that guard and does not move', async () => {
  const guard = { current: { message: 'layout', onSave: async () => false } };
  const remove = router.addLeaveGuard(guard);
  router.navigate({ name: 'settings', section: 'backups' });
  await router.leaveDecision.save();
  assert.equal(router.currentLeave()?.guard.message, 'layout');
  assert.equal(router.currentLeave()?.saving, false);
  assert.equal(router.acceptedHash(), '#/wizard');
  router.leaveDecision.stay();
  assert.equal(router.currentLeave(), null);
  remove();
});

test('guarded browser Back is undone, then replayed on Discard without rewriting history', async () => {
  const guard = { current: { message: 'layout' } };
  const remove = router.addLeaveGuard(guard);
  await back();
  assert.equal(router.currentLeave()?.hash, '#/rooms');
  assert.equal(router.currentLeave()?.delta, -1);
  assert.equal(window.location.hash, '#/wizard');
  assert.equal(router.acceptedHash(), '#/wizard');

  router.leaveDecision.discard();
  await settle();
  assert.equal(router.currentLeave(), null);
  assert.equal(router.acceptedHash(), '#/rooms');
  assert.deepEqual(
    entries.map((entry) => entry.hash),
    ['#/rooms', '#/wizard'],
  );
  assert.equal(position, 0);
  remove();
});

test('unguarded Back and Forward track the history index', async () => {
  position += 1;
  fire();
  assert.equal(router.acceptedHash(), '#/wizard');
  router.navigate({ name: 'rooms' });
  assert.equal(position, 2);
  assert.deepEqual(entries[2].state, { idx: 2 });
});
