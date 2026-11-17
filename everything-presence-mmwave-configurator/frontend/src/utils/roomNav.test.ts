import assert from 'node:assert/strict';
import test from 'node:test';
import {
  modeForRoom,
  roomDeviceStatus,
  shortModelLabel,
  sortRoomsForNav,
} from './roomNav.ts';

test('model badges drop the product family name', () => {
  assert.equal(shortModelLabel({ label: 'Everything Presence Lite' }), 'Lite');
  assert.equal(shortModelLabel({ label: 'Everything Presence One' }), 'One');
  assert.equal(shortModelLabel({ label: 'Custom sensor' }), 'Custom sensor');
  assert.equal(shortModelLabel(undefined), undefined);
});

test('rooms list the default room first, then alphabetically', () => {
  const rooms = [
    { id: 'b', name: 'Office' },
    { id: 'a', name: 'Bedroom' },
    { id: 'c', name: 'Living' },
  ];
  assert.deepEqual(
    sortRoomsForNav(rooms, 'c').map((room) => room.id),
    ['c', 'a', 'b'],
  );
  assert.deepEqual(
    sortRoomsForNav(rooms, null).map((room) => room.id),
    ['a', 'c', 'b'],
  );
});

test('switching to a room keeps the mode unless the room has no zones', () => {
  assert.equal(modeForRoom('zones', false), 'live');
  assert.equal(modeForRoom('zones', true), 'zones');
  assert.equal(modeForRoom('build', false), 'build');
});

test('device status comes from whether Home Assistant still lists the device', () => {
  assert.equal(roomDeviceStatus({}, [{ id: 'x' }]), 'none');
  assert.equal(roomDeviceStatus({ deviceId: 'x' }, [{ id: 'x' }]), 'online');
  assert.equal(roomDeviceStatus({ deviceId: 'y' }, [{ id: 'x' }]), 'offline');
});
