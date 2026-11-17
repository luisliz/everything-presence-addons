import { useCallback, useMemo, useState } from 'react';
import type { DeviceMapping } from '../../api/deviceMappings';
import { createRoom, updateRoom } from '../../api/rooms';
import type {
  AppSettings,
  DiscoveredDevice,
  RoomConfig,
} from '../../api/types';
import { useAppData } from '../../contexts/AppDataContext';
import { navigate, roomRoute, runGuarded } from '../../router';
import { resolveTrackingCoverageFov } from '../../utils/coverage';
import { supportsZoneEditing } from '../../utils/zoneCapabilities';
import {
  profileIdForModel,
  type RoomPath,
  resumeStep,
  type StepKey,
  stepsFor,
} from './steps';

const FRESH_PROGRESS: Partial<AppSettings> = {
  outlineDone: false,
  placementDone: false,
  zonesReady: false,
};

const message = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

/** Step machine over the persisted `wizardStep` / `wizardDeviceId` / `wizardProfileId` settings; room path and drafts stay local. */
export function useWizard() {
  const {
    settings,
    rooms,
    devices,
    profiles,
    updateSettings,
    addRoom,
    updateRoom: storeRoom,
  } = useAppData();
  const [roomPath, setRoomPath] = useState<RoomPath | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    (patch: Partial<AppSettings>) => {
      updateSettings(patch).catch(() =>
        setError('Could not save the setup progress'),
      );
    },
    [updateSettings],
  );

  const deviceId = settings?.wizardDeviceId ?? null;
  const device = devices.find((d) => d.id === deviceId) ?? null;
  const profileId =
    settings?.wizardProfileId ?? profileIdForModel(device?.model, profiles);
  const room = deviceId
    ? (rooms.find((r) => r.deviceId === deviceId) ?? null)
    : null;
  const profile =
    profiles.find((p) => p.id === (room?.profileId ?? profileId)) ?? null;
  const supportsZones = supportsZoneEditing(profile);
  const steps = useMemo(
    () => stepsFor(roomPath, supportsZones),
    [roomPath, supportsZones],
  );
  const step = resumeStep(settings?.wizardStep, steps);
  const index = steps.indexOf(step);
  const progress = {
    outlineDone: Boolean(settings?.outlineDone),
    placementDone: Boolean(settings?.placementDone),
    zonesReady: Boolean(settings?.zonesReady),
  };

  const goTo = useCallback(
    (key: StepKey) =>
      runGuarded(() => {
        setError(null);
        save({ wizardStep: key });
      }),
    [save],
  );
  const next = () => goTo(steps[Math.min(steps.length - 1, index + 1)]);
  const back = () => goTo(steps[Math.max(0, index - 1)]);

  const selectDevice = (picked: DiscoveredDevice) =>
    save({
      wizardDeviceId: picked.id,
      wizardProfileId: profileIdForModel(picked.model, profiles),
    });

  const completeDiscovery = (saved: DeviceMapping) => {
    setError(null);
    save({
      wizardStep: 'roomChoice',
      ...(saved.profileId ? { wizardProfileId: saved.profileId } : {}),
    });
  };

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(message(err, label));
    } finally {
      setBusy(false);
    }
  };

  const continueFromRoomChoice = () => {
    if (!roomPath) return;
    if (roomPath !== 'skip') {
      goTo('roomDetails');
      return;
    }
    void run('Failed to create the generic room', async () => {
      const created = await createRoom({
        name: 'Generic Radar',
        deviceId: deviceId ?? undefined,
        entityNamePrefix: device?.entityNamePrefix,
        profileId: profileId ?? undefined,
        units: 'metric',
        zones: [],
      });
      const rangeMeters =
        resolveTrackingCoverageFov(profile)?.maxRangeMeters ??
        profile?.limits?.maxRangeMeters ??
        6;
      const result = await updateRoom(created.room.id, {
        devicePlacement: {
          x: 0,
          y: (-rangeMeters * 1000) / 2,
          rotationDeg: 90,
        },
      });
      addRoom(result.room);
      const order = stepsFor('skip', supportsZones);
      save({
        ...FRESH_PROGRESS,
        wizardStep: order[order.indexOf('roomChoice') + 1],
      });
    });
  };

  const createNamedRoom = (name: string) =>
    run('Failed to create the room', async () => {
      const result = await createRoom({
        name,
        deviceId: deviceId ?? undefined,
        entityNamePrefix: device?.entityNamePrefix,
        profileId: profileId ?? undefined,
        units: 'metric',
        zones: [],
      });
      addRoom(result.room);
      save({ ...FRESH_PROGRESS, wizardStep: 'outline' });
    });

  const bindExistingRoom = (target: RoomConfig) =>
    run('Failed to link the device to the room', async () => {
      const result = await updateRoom(target.id, {
        deviceId: deviceId ?? undefined,
        profileId: profileId ?? target.profileId,
      });
      storeRoom(result.room);
      save({
        outlineDone: (result.room.roomShell?.points?.length ?? 0) >= 3,
        placementDone: Boolean(result.room.devicePlacement),
        zonesReady: false,
        wizardStep: 'placement',
      });
    });

  const onLayoutSaved = useCallback(
    (done: { outlineDone?: boolean; placementDone?: boolean }) =>
      save({
        ...(done.outlineDone ? { outlineDone: true } : {}),
        ...(done.placementDone ? { placementDone: true } : {}),
      }),
    [save],
  );
  const onZonesSaved = useCallback(() => save({ zonesReady: true }), [save]);

  const startOver = () => {
    setRoomPath(null);
    goTo('device');
  };

  const finish = () => {
    if (!room) return;
    save({
      wizardCompleted: true,
      wizardStep: 'device',
      wizardDeviceId: null,
      wizardProfileId: null,
    });
    navigate(roomRoute(room.id, 'live'));
  };

  return {
    steps,
    step,
    index,
    progress,
    device,
    deviceId,
    profileId,
    profile,
    room,
    roomPath,
    setRoomPath,
    busy,
    error,
    goTo,
    next,
    back,
    selectDevice,
    completeDiscovery,
    continueFromRoomChoice,
    createNamedRoom,
    bindExistingRoom,
    onLayoutSaved,
    onZonesSaved,
    startOver,
    finish,
  };
}

export type Wizard = ReturnType<typeof useWizard>;
