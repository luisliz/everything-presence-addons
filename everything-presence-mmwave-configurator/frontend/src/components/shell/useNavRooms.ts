import { useMemo } from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import {
  type RoomDeviceStatus,
  roomDeviceStatus,
  shortModelLabel,
  sortRoomsForNav,
} from '../../utils/roomNav';
import { roomSupportsZoneEditing } from '../../utils/zoneCapabilities';

export interface NavRoom {
  id: string;
  name: string;
  model?: string;
  status: RoomDeviceStatus;
  isDefault: boolean;
  canEditZones: boolean;
}

export function useNavRooms(): {
  rooms: NavRoom[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const { rooms, devices, profiles, settings, loading, error, refresh } =
    useAppData();
  const defaultRoomId = settings?.defaultRoomId ?? null;
  const navRooms = useMemo(
    () =>
      sortRoomsForNav(rooms, defaultRoomId).map((room) => ({
        id: room.id,
        name: room.name,
        model: shortModelLabel(
          profiles.find((profile) => profile.id === room.profileId),
        ),
        status: roomDeviceStatus(room, devices),
        isDefault: room.id === defaultRoomId,
        canEditZones: roomSupportsZoneEditing(room, profiles),
      })),
    [defaultRoomId, devices, profiles, rooms],
  );
  return { rooms: navRooms, loading, error, refresh };
}
