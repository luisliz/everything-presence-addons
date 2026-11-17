import { useCallback, useMemo, useState } from 'react';
import type { DeviceMapping } from '../../api/deviceMappings';
import { createRoom, deleteRoom, updateRoom } from '../../api/rooms';
import type { EntityMappings, RoomConfig } from '../../api/types';
import { useToast } from '../../components/primitives';
import { useAppData } from '../../contexts/AppDataContext';
import { useDeviceMappings } from '../../contexts/DeviceMappingsContext';
import {
  downloadJson,
  fileSafeName,
  fileTimestamp,
  pickJsonFile,
} from '../../utils/downloadJson';

const EXPORTED_FROM = 'Zone Configurator v1.0';

export const renameRoom = async (
  roomId: string,
  name: string,
): Promise<RoomConfig> => (await updateRoom(roomId, { name })).room;

/** Drops the device link and entity mappings; geometry, furniture and zones stay. */
export const unlinkRoomDevice = async (roomId: string): Promise<RoomConfig> =>
  (
    await updateRoom(roomId, {
      deviceId: '',
      profileId: '',
      // The backend turns empty strings into undefined; null survives JSON where undefined would be stripped.
      entityMappings: null as unknown as undefined,
      entityNamePrefix: '',
    })
  ).room;

export const saveResyncedMappings = async (
  room: RoomConfig,
  mappings: EntityMappings,
  savedMapping: DeviceMapping,
): Promise<RoomConfig> =>
  (
    await updateRoom(room.id, {
      entityMappings: mappings,
      entityNamePrefix: savedMapping.esphomeNodeName ?? room.entityNamePrefix,
      profileId: savedMapping.profileId || room.profileId,
    })
  ).room;

export const exportRoom = (room: RoomConfig): void =>
  downloadJson(`room_${fileSafeName(room.name)}_${fileTimestamp()}.json`, {
    ...room,
    exportedAt: new Date().toISOString(),
    exportedFrom: EXPORTED_FROM,
  });

export const backupAllRooms = (rooms: RoomConfig[]): void =>
  downloadJson(`backup_all_rooms_${fileTimestamp()}.json`, {
    rooms,
    exportedAt: new Date().toISOString(),
    exportedFrom: EXPORTED_FROM,
    roomCount: rooms.length,
  });

const newRoomId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export class ImportError extends Error {}

/** Creates each room of a single-room export or a "Backup all" file under a new id; resolves with the number created. */
export const importRoomsFrom = async (file: unknown): Promise<number> => {
  const data = file as RoomConfig & { rooms?: RoomConfig[] };
  const isBackup = Array.isArray(data.rooms);
  const incoming: RoomConfig[] = isBackup ? (data.rooms ?? []) : [data];
  if (incoming.some((room) => !room.name || !Array.isArray(room.zones)))
    throw new ImportError(
      'Invalid room configuration file: missing required fields',
    );

  const created: Promise<unknown>[] = [];
  for (const room of incoming) {
    const name = prompt(
      `Enter a name for the imported room:\n\nOriginal name: "${room.name}"`,
      isBackup ? room.name : `${room.name} (imported)`,
    );
    if (!name) continue;
    const copy: RoomConfig = { ...room, id: newRoomId(), name: name.trim() };
    created.push(
      createRoom(copy).catch(() => {
        throw new ImportError(`Failed to import room: ${copy.name}`);
      }),
    );
  }
  if (created.length === 0) throw new ImportError('Import cancelled');
  await Promise.all(created);
  return created.length;
};

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export type RoomBusy =
  | 'rename'
  | 'default'
  | 'unlink'
  | 'delete'
  | 'resync'
  | 'import';

/** Room management with the app store and toasts wired in; `busy` names the running action per room id ('*' for import). */
export function useRoomActions() {
  const {
    rooms,
    settings,
    refresh,
    updateRoom: storeRoom,
    removeRoom,
    updateSettings,
  } = useAppData();
  const { refreshMapping } = useDeviceMappings();
  const toast = useToast();
  const [busy, setBusy] = useState<Record<string, RoomBusy>>({});
  const defaultRoomId = settings?.defaultRoomId ?? null;

  const run = useCallback(
    async (
      key: string,
      kind: RoomBusy,
      action: () => Promise<string | null>,
      failure: string,
    ): Promise<boolean> => {
      setBusy((current) => ({ ...current, [key]: kind }));
      try {
        const success = await action();
        if (success) toast.show(success, { tone: 'success' });
        return true;
      } catch (err) {
        toast.show(messageOf(err, failure), { tone: 'danger' });
        return false;
      } finally {
        setBusy(({ [key]: _, ...rest }) => rest);
      }
    },
    [toast],
  );

  return useMemo(
    () => ({
      busy,
      defaultRoomId,
      rename: (room: RoomConfig, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) {
          toast.show('Room name cannot be empty', { tone: 'danger' });
          return Promise.resolve(false);
        }
        if (trimmed === room.name) return Promise.resolve(true);
        return run(
          room.id,
          'rename',
          async () => {
            storeRoom(await renameRoom(room.id, trimmed));
            return `Room renamed to "${trimmed}"`;
          },
          'Failed to rename room',
        );
      },
      setDefault: (room: RoomConfig) =>
        run(
          room.id,
          'default',
          async () => {
            await updateSettings({ defaultRoomId: room.id });
            return `Default room set to "${room.name}"`;
          },
          'Failed to update default room',
        ),
      clearDefault: (room: RoomConfig) =>
        run(
          room.id,
          'default',
          async () => {
            await updateSettings({ defaultRoomId: null });
            return 'Default room cleared';
          },
          'Failed to clear default room',
        ),
      unlink: (room: RoomConfig) =>
        run(
          room.id,
          'unlink',
          async () => {
            storeRoom(await unlinkRoomDevice(room.id));
            return `Device unlinked from "${room.name}". Room data preserved.`;
          },
          'Failed to unlink device',
        ),
      resync: (
        room: RoomConfig,
        mappings: EntityMappings,
        savedMapping: DeviceMapping,
      ) =>
        run(
          room.id,
          'resync',
          async () => {
            storeRoom(await saveResyncedMappings(room, mappings, savedMapping));
            if (room.deviceId) await refreshMapping(room.deviceId);
            return `Entity mappings updated for "${room.name}"`;
          },
          'Failed to update entity mappings',
        ),
      remove: (room: RoomConfig) =>
        run(
          room.id,
          'delete',
          async () => {
            await deleteRoom(room.id);
            removeRoom(room.id);
            if (defaultRoomId === room.id)
              await updateSettings({ defaultRoomId: null });
            return `Deleted "${room.name}"`;
          },
          'Failed to delete room',
        ),
      exportRoom,
      backupAll: () => {
        if (rooms.length === 0) {
          toast.show('No rooms to back up', { tone: 'danger' });
          return;
        }
        backupAllRooms(rooms);
      },
      importRooms: async () => {
        let file: unknown;
        try {
          file = await pickJsonFile();
        } catch (err) {
          toast.show(messageOf(err, 'Could not read the file'), {
            tone: 'danger',
          });
          return false;
        }
        if (file === null) return true;
        return run(
          '*',
          'import',
          async () => {
            const count = await importRoomsFrom(file);
            await refresh();
            return `Imported ${count} room${count > 1 ? 's' : ''}`;
          },
          'Failed to import rooms',
        );
      },
    }),
    [
      busy,
      defaultRoomId,
      refresh,
      refreshMapping,
      removeRoom,
      rooms,
      run,
      storeRoom,
      toast,
      updateSettings,
    ],
  );
}
