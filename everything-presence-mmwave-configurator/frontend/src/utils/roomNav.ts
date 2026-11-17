import type { DeviceProfile, DiscoveredDevice, RoomConfig } from '../api/types';
import type { RoomMode } from '../router';

export type RoomDeviceStatus = 'online' | 'offline' | 'none';

export const NO_ZONES_MESSAGE =
  'The Everything Presence One reports distance only, so it has no zones';

/** "Everything Presence Lite" -> "Lite"; the badge next to a room name. */
export const shortModelLabel = (
  profile: Pick<DeviceProfile, 'label'> | undefined,
): string | undefined =>
  profile?.label.replace(/^Everything Presence\s+/i, '') || undefined;

/** Default room first, then by name. */
export const sortRoomsForNav = <T extends Pick<RoomConfig, 'id' | 'name'>>(
  rooms: readonly T[],
  defaultRoomId?: string | null,
): T[] =>
  [...rooms].sort(
    (a, b) =>
      Number(b.id === defaultRoomId) - Number(a.id === defaultRoomId) ||
      a.name.localeCompare(b.name),
  );

/** Switching rooms keeps the mode unless the target room cannot do it. */
export const modeForRoom = (mode: RoomMode, canEditZones: boolean): RoomMode =>
  mode === 'zones' && !canEditZones ? 'live' : mode;

/** Whether Home Assistant still knows the room's device; live availability refines this for the open room. */
export const roomDeviceStatus = (
  room: Pick<RoomConfig, 'deviceId'>,
  devices: ReadonlyArray<Pick<DiscoveredDevice, 'id'>>,
): RoomDeviceStatus => {
  if (!room.deviceId) return 'none';
  return devices.some((device) => device.id === room.deviceId)
    ? 'online'
    : 'offline';
};

export const DEVICE_STATUS_LABEL: Record<RoomDeviceStatus, string> = {
  online: 'Device found in Home Assistant',
  offline: 'Device not found in Home Assistant',
  none: 'No device linked',
};
