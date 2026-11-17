import assert from 'node:assert/strict';
import test from 'node:test';
import {
  homeRoute,
  parseHash,
  type RedirectContext,
  type Route,
  resolveRedirect,
  toHash,
} from './router.ts';

test('parses room, settings and wizard hashes', () => {
  assert.deepEqual(parseHash('#/room/abc/zones'), {
    name: 'room',
    roomId: 'abc',
    mode: 'zones',
  });
  assert.deepEqual(parseHash('#/room/abc/build'), {
    name: 'room',
    roomId: 'abc',
    mode: 'build',
  });
  assert.deepEqual(parseHash('#/room/abc'), {
    name: 'room',
    roomId: 'abc',
    mode: 'live',
  });
  assert.deepEqual(parseHash('#/room/abc/bogus'), {
    name: 'room',
    roomId: 'abc',
    mode: 'live',
  });
  assert.deepEqual(parseHash('#/settings/firmware'), {
    name: 'settings',
    section: 'firmware',
  });
  assert.deepEqual(parseHash('#/settings'), {
    name: 'settings',
    section: 'appearance',
  });
  assert.deepEqual(parseHash('#/wizard'), { name: 'wizard' });
  assert.deepEqual(parseHash('#/rooms'), { name: 'rooms' });
});

test('old settings/rooms bookmarks and unknown hashes land on the room list', () => {
  assert.deepEqual(parseHash('#/settings/rooms'), { name: 'rooms' });
  assert.deepEqual(parseHash('#/nope'), { name: 'rooms' });
  assert.deepEqual(parseHash(''), { name: 'rooms' });
  assert.deepEqual(parseHash('#/room'), { name: 'rooms' });
});

test('toHash and parseHash round-trip, encoding room ids', () => {
  const routes: Route[] = [
    { name: 'rooms' },
    { name: 'wizard' },
    { name: 'settings', section: 'backups' },
    { name: 'room', roomId: 'a b/c', mode: 'zones' },
    { name: 'room', roomId: '9f1c', mode: 'live' },
  ];
  for (const route of routes) assert.deepEqual(parseHash(toHash(route)), route);
  assert.equal(
    toHash({ name: 'room', roomId: 'a b/c', mode: 'build' }),
    '#/room/a%20b%2Fc/build',
  );
  assert.deepEqual(parseHash('room/x/live'), {
    name: 'room',
    roomId: 'x',
    mode: 'live',
  });
});

const context: RedirectContext = {
  roomIds: ['office', 'living', 'hall'],
  defaultRoomId: 'living',
  wizardCompleted: true,
  canEditZones: (roomId) => roomId !== 'hall',
};

test('the root lands on the default room, else the first room, else setup or the room list', () => {
  assert.deepEqual(homeRoute(context), {
    name: 'room',
    roomId: 'living',
    mode: 'live',
  });
  assert.deepEqual(homeRoute({ ...context, defaultRoomId: 'gone' }), {
    name: 'room',
    roomId: 'office',
    mode: 'live',
  });
  assert.deepEqual(homeRoute({ roomIds: [], wizardCompleted: false }), {
    name: 'wizard',
  });
  assert.deepEqual(homeRoute({ roomIds: [], wizardCompleted: true }), {
    name: 'rooms',
  });
  for (const hash of ['', '#', '#/'])
    assert.deepEqual(resolveRedirect(hash, context), {
      route: homeRoute(context),
    });
});

test('redirects unknown rooms and zone-less rooms with a notice, and canonicalises the rest', () => {
  assert.deepEqual(resolveRedirect('#/room/gone/live', context), {
    route: { name: 'rooms' },
    notice: 'missing-room',
  });
  assert.deepEqual(resolveRedirect('#/room/hall/zones', context), {
    route: { name: 'room', roomId: 'hall', mode: 'live' },
    notice: 'no-zones',
  });
  assert.deepEqual(resolveRedirect('#/settings/rooms', context), {
    route: { name: 'rooms' },
  });
  assert.deepEqual(resolveRedirect('#/room/office', context), {
    route: { name: 'room', roomId: 'office', mode: 'live' },
  });
  assert.equal(resolveRedirect('#/room/office/zones', context), null);
  assert.equal(resolveRedirect('#/settings/assets', context), null);
});
