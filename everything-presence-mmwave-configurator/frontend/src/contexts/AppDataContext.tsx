import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  fetchDevices,
  fetchMetaConfig,
  fetchProfiles,
  fetchSettings,
  updateSettings as putSettings,
} from '../api/client';
import { fetchRooms } from '../api/rooms';
import type {
  AppSettings,
  DeviceProfile,
  DiscoveredDevice,
  RoomConfig,
} from '../api/types';
import { stableStringify } from '../utils/stableStringify';

interface AppData {
  rooms: RoomConfig[];
  devices: DiscoveredDevice[];
  profiles: DeviceProfile[];
  settings: AppSettings | null;
  appVersion: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Replace a stored room with its saved state; a no-op when nothing changed, so subscribers do not churn. */
  updateRoom: (room: RoomConfig) => void;
  addRoom: (room: RoomConfig) => void;
  removeRoom: (roomId: string) => void;
  /** Merges locally at once, then persists; rejects when the save fails. */
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
}

const AppDataContext = createContext<AppData | null>(null);

export const AppDataProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<RoomConfig[]>([]);
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [profiles, setProfiles] = useState<DeviceProfile[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettings((current) => (current ? { ...current, ...patch } : current));
    await putSettings(patch);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [deviceRes, profileRes, roomRes, settingsRes] = await Promise.all([
        fetchDevices(),
        fetchProfiles(),
        fetchRooms(),
        fetchSettings(),
      ]);
      const loaded = settingsRes.settings;
      const repairs: Partial<AppSettings> = {};
      if (
        typeof loaded.defaultRoomId === 'string' &&
        !roomRes.rooms.some((room) => room.id === loaded.defaultRoomId)
      )
        repairs.defaultRoomId = null;
      if (!loaded.wizardCompleted && roomRes.rooms.length > 0)
        repairs.wizardCompleted = true;
      setDevices(deviceRes.devices);
      setProfiles(profileRes.profiles);
      setRooms(roomRes.rooms);
      setSettings({ ...loaded, ...repairs });
      if (Object.keys(repairs).length > 0)
        putSettings(repairs).catch(() => null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    fetchMetaConfig()
      .then((meta) => setAppVersion(meta.appVersion ?? null))
      .catch(() => null);
  }, [refresh]);

  const updateRoom = useCallback((room: RoomConfig) => {
    setRooms((current) => {
      const index = current.findIndex((candidate) => candidate.id === room.id);
      if (
        index === -1 ||
        stableStringify(current[index]) === stableStringify(room)
      )
        return current;
      const next = [...current];
      next[index] = room;
      return next;
    });
  }, []);

  const addRoom = useCallback((room: RoomConfig) => {
    setRooms((current) => [
      ...current.filter((candidate) => candidate.id !== room.id),
      room,
    ]);
  }, []);

  const removeRoom = useCallback((roomId: string) => {
    setRooms((current) => current.filter((room) => room.id !== roomId));
  }, []);

  const value = useMemo<AppData>(
    () => ({
      rooms,
      devices,
      profiles,
      settings,
      appVersion,
      loading,
      error,
      refresh,
      updateRoom,
      addRoom,
      removeRoom,
      updateSettings,
    }),
    [
      rooms,
      devices,
      profiles,
      settings,
      appVersion,
      loading,
      error,
      refresh,
      updateRoom,
      addRoom,
      removeRoom,
      updateSettings,
    ],
  );

  return (
    <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
  );
};

export function useAppData(): AppData {
  const context = useContext(AppDataContext);
  if (!context)
    throw new Error('useAppData must be used within an AppDataProvider');
  return context;
}
