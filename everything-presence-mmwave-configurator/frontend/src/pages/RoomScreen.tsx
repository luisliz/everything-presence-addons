import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceMapping } from '../api/deviceMappings';
import { updateRoom } from '../api/rooms';
import type { EntityMappings, LiveState } from '../api/types';
import { DeviceLogsModal } from '../components/DeviceLogsModal';
import { EntityDiscovery } from '../components/EntityDiscovery';
import { Kbd, Sheet, type SheetSnap, useToast } from '../components/primitives';
import { useAppData } from '../contexts/AppDataContext';
import { useDeviceMappings } from '../contexts/DeviceMappingsContext';
import { useViewportStorage } from '../hooks/useViewportStorage';
import { navigate, type RoomMode, roomRoute, useLeaveGuard } from '../router';
import { resolveCanvasCoverage } from '../utils/coverage';
import {
  coverageBounds,
  fitViewport,
  type Viewport,
} from '../utils/fitViewport';
import {
  NO_ZONES_MESSAGE,
  roomDeviceStatus,
  shortModelLabel,
} from '../utils/roomNav';
import { roomSupportsZoneEditing } from '../utils/zoneCapabilities';
import { BuildEntry } from './room/BuildEntry';
import { LIVE_RANGE_MM, LiveMode } from './room/LiveMode';
import { useStateSince } from './room/presence';
import { RoomHeader } from './room/RoomHeader';
import { useSensorSettings } from './room/sensorApi';
import {
  NO_SELECTION,
  type RoomFrame,
  type Selection,
  type TargetPosition,
} from './room/types';
import { SHORTCUTS, useRoomKeys } from './room/useRoomKeys';
import { sensorConfigFrom, useSensorDraft } from './room/useSensorDraft';
import { ZonesEntry } from './room/ZonesEntry';
import { clampZoom, ZOOM_STEP } from './room/ZoomCluster';
import { StepStrip } from './wizard/StepStrip';
import { type CanvasStep, STEP_TITLE } from './wizard/steps';

const OFFLINE_AFTER_MS = 10000;
const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panOffsetMm: { x: 0, y: 0 } };

export interface RoomScreenWizard {
  step: CanvasStep;
  instruction: string;
  canNext: boolean;
  nextHint?: string | null;
  onNext: () => void;
  onBack: () => void;
}

export interface RoomScreenProps {
  roomId: string;
  mode: RoomMode;
  liveState: LiveState | null;
  targetPositions: TargetPosition[];
  onWizardZonesReady?: () => void;
  onWizardProgress?: (progress: {
    outlineDone?: boolean;
    placementDone?: boolean;
  }) => void;
  /** Setup wizard step: a step strip replaces the room header and the mode switch. */
  wizard?: RoomScreenWizard;
}

const noop = () => {};

export const RoomScreen = ({
  roomId,
  mode,
  liveState,
  targetPositions,
  onWizardZonesReady = noop,
  onWizardProgress = noop,
  wizard,
}: RoomScreenProps) => {
  const {
    rooms,
    profiles,
    devices,
    settings,
    updateRoom: storeRoom,
    updateSettings,
  } = useAppData();
  const { refreshMapping } = useDeviceMappings();
  const toast = useToast();
  const room = rooms.find((candidate) => candidate.id === roomId) ?? null;
  const profile =
    profiles.find((candidate) => candidate.id === room?.profileId) ?? null;
  const placement = room?.devicePlacement;
  const canEditZones = roomSupportsZoneEditing(room ?? undefined, profiles);

  const live =
    room?.deviceId && liveState?.deviceId === room.deviceId ? liveState : null;
  const [waitedForLive, setWaitedForLive] = useState(false);
  const deviceId = room?.deviceId;
  useEffect(() => {
    setWaitedForLive(false);
    if (!deviceId) return;
    const timer = window.setTimeout(
      () => setWaitedForLive(true),
      OFFLINE_AFTER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [deviceId]);
  const offline = Boolean(
    room?.deviceId &&
      (live ? live.availability?.presence === 'unavailable' : waitedForLive),
  );

  const sensor = useSensorSettings(room);
  const draft = useSensorDraft(room?.deviceId, sensor);
  const sensorConfig = useMemo(
    () => sensorConfigFrom(live?.config, draft.draft.values),
    [live?.config, draft.draft.values],
  );
  const coverage = useMemo(
    () => resolveCanvasCoverage(profile, placement, sensorConfig),
    [placement, profile, sensorConfig],
  );

  const liveAngle = live?.config?.installationAngle ?? 0;
  const previewTargets = useMemo(() => {
    if (!live || offline) return [];
    const delta =
      (((sensorConfig.installationAngle ?? 0) - liveAngle) * Math.PI) / 180;
    if (!placement || delta === 0) return targetPositions;
    const [cos, sin] = [Math.cos(delta), Math.sin(delta)];
    return targetPositions.map((t) => {
      const [dx, dy] = [t.x - placement.x, t.y - placement.y];
      return {
        ...t,
        x: placement.x + dx * cos - dy * sin,
        y: placement.y + dx * sin + dy * cos,
      };
    });
  }, [
    live,
    liveAngle,
    offline,
    placement,
    sensorConfig.installationAngle,
    targetPositions,
  ]);

  const stateSince = useStateSince({
    presence: live?.presence,
    zone1: live?.zoneOccupancy?.zone1,
    zone2: live?.zoneOccupancy?.zone2,
    zone3: live?.zoneOccupancy?.zone3,
    zone4: live?.zoneOccupancy?.zone4,
  });

  const storage = useViewportStorage(roomId);
  const [viewport, setViewportState] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [container, setContainer] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const placedFor = useRef<string | null>(null);

  const fitted = useCallback((): Viewport => {
    const rad = (coverage.rotationDeg * Math.PI) / 180;
    const toRoom = (x: number, y: number) =>
      placement
        ? {
            x: placement.x + x * Math.cos(rad) - y * Math.sin(rad),
            y: placement.y + x * Math.sin(rad) + y * Math.cos(rad),
          }
        : { x, y };
    const zonePoints = (room?.zones ?? [])
      .filter((zone) => zone.enabled !== false)
      .flatMap((z) => [
        toRoom(z.x, z.y),
        toRoom(z.x + z.width, z.y),
        toRoom(z.x, z.y + z.height),
        toRoom(z.x + z.width, z.y + z.height),
      ]);
    const furniturePoints = (room?.furniture ?? []).flatMap((f) => {
      const r = Math.max(f.width, f.depth) / 2;
      return [
        { x: f.x - r, y: f.y - r },
        { x: f.x + r, y: f.y + r },
      ];
    });
    return fitViewport(
      coverageBounds({
        room: room?.roomShell?.points ?? [],
        device: placement,
        coverage,
        points: [...zonePoints, ...furniturePoints],
      }),
      container,
      { rangeMm: LIVE_RANGE_MM },
    );
  }, [
    container,
    coverage,
    placement,
    room?.furniture,
    room?.roomShell?.points,
    room?.zones,
  ]);

  const setViewport = useCallback(
    (next: Viewport) => {
      setViewportState(next);
      storage.write(next);
    },
    [storage],
  );
  const fit = useCallback(() => setViewport(fitted()), [fitted, setViewport]);

  useEffect(() => {
    if (!room || !container || placedFor.current === room.id) return;
    placedFor.current = room.id;
    const stored = storage.read();
    if (stored) setViewportState(stored);
    else setViewport(fitted());
  }, [container, fitted, room, setViewport, storage]);

  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const setZoom = useCallback(
    (zoom: number) =>
      setViewport({ ...viewportRef.current, zoom: clampZoom(zoom) }),
    [setViewport],
  );
  const setPan = useCallback(
    (panOffsetMm: Viewport['panOffsetMm']) =>
      setViewport({ ...viewportRef.current, panOffsetMm }),
    [setViewport],
  );
  const onContainerSize = useCallback(
    (size: { width: number; height: number }) =>
      setContainer((prev) =>
        prev?.width === size.width && prev.height === size.height ? prev : size,
      ),
    [],
  );

  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [snap, setSnap] = useState<SheetSnap>('peek');
  const [selectionFor, setSelectionFor] = useState(roomId);
  if (selectionFor !== roomId) {
    setSelectionFor(roomId);
    setSelection(NO_SELECTION);
  }
  const select = useCallback((next: Selection) => {
    setSelection(next);
    if (next.kind !== 'none')
      setSnap((current) => (current === 'peek' ? 'half' : current));
  }, []);

  const [logsOpen, setLogsOpen] = useState(false);
  const [resyncOpen, setResyncOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openLogs = useCallback(() => setLogsOpen(true), []);
  const openResync = useCallback(() => setResyncOpen(true), []);

  useLeaveGuard(
    draft.dirtyCount > 0,
    'Sensor changes in the inspector are not on the device yet.',
    {
      title: 'Unapplied sensor changes',
      onSave: draft.apply,
      onDiscard: draft.discard,
    },
  );

  const setMode = useCallback(
    (next: RoomMode) => {
      if (next === mode) return;
      if (next === 'zones' && !canEditZones) {
        toast.show(NO_ZONES_MESSAGE);
        return;
      }
      navigate(roomRoute(roomId, next));
    },
    [canEditZones, mode, roomId, toast],
  );

  useRoomKeys({
    setMode: wizard ? noop : setMode,
    fit: mode === 'live' ? fit : undefined,
    zoomBy:
      mode === 'live'
        ? (delta) => setZoom(viewportRef.current.zoom + delta * ZOOM_STEP)
        : undefined,
    escape: mode === 'live' ? () => select(NO_SELECTION) : undefined,
    help: () => setShortcutsOpen(true),
  });

  if (!room) return null;

  const handleResync = async (
    mappings: EntityMappings,
    saved: DeviceMapping,
  ) => {
    try {
      const result = await updateRoom(room.id, {
        entityMappings: mappings,
        entityNamePrefix: saved.esphomeNodeName ?? room.entityNamePrefix,
        profileId: saved.profileId || room.profileId,
      });
      storeRoom(result.room);
      if (room.deviceId) await refreshMapping(room.deviceId);
      toast.show(`Entity mappings updated for ${room.name}`, {
        tone: 'success',
      });
    } catch (err) {
      toast.show(
        err instanceof Error
          ? err.message
          : 'Could not update the entity mappings',
        {
          tone: 'danger',
        },
      );
    } finally {
      setResyncOpen(false);
    }
  };

  const device = offline ? 'offline' : roomDeviceStatus(room, devices);
  const frame: RoomFrame = {
    room,
    profile,
    mode,
    liveState: live,
    targetPositions: previewTargets,
    offline,
    stateSince,
    viewport,
    setViewport,
    setZoom,
    setPan,
    fit,
    onContainerSize,
    selection,
    select,
    sensor,
    draft,
    sensorConfig,
    coverage,
    openLogs,
    openResync,
  };
  return (
    <div className="flex h-full flex-col bg-cv-bg">
      {wizard ? (
        <StepStrip
          title={STEP_TITLE[wizard.step]}
          instruction={wizard.instruction}
          canNext={wizard.canNext}
          nextHint={wizard.nextHint}
          onBack={wizard.onBack}
          onNext={wizard.onNext}
        />
      ) : (
        <RoomHeader
          name={room.name}
          model={shortModelLabel(profile ?? undefined)}
          device={device}
          mode={mode}
          canEditZones={canEditZones}
          onMode={setMode}
          presence={
            live
              ? {
                  occupied: Boolean(live.presence),
                  targets: previewTargets.length,
                  since: stateSince.presence ?? null,
                }
              : null
          }
          isDefault={settings?.defaultRoomId === room.id}
          onAllRooms={() => navigate({ name: 'rooms' })}
          onLogs={room.deviceId ? openLogs : undefined}
          onResync={room.deviceId && room.profileId ? openResync : undefined}
          onMakeDefault={() =>
            updateSettings({ defaultRoomId: room.id }).catch(() =>
              toast.show('Could not save the default room', { tone: 'danger' }),
            )
          }
        />
      )}
      {mode === 'live' && (
        <LiveMode
          frame={frame}
          snap={snap}
          onSnapChange={setSnap}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
      )}
      {mode === 'zones' && (
        <ZonesEntry
          frame={frame}
          onWizardZonesReady={onWizardZonesReady}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
      )}
      {mode === 'build' && (
        <BuildEntry
          frame={frame}
          onWizardProgress={onWizardProgress}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
      )}

      {room.deviceId && (
        <DeviceLogsModal
          isOpen={logsOpen}
          onClose={() => setLogsOpen(false)}
          deviceId={room.deviceId}
          deviceLabel={`${room.name} · ${profile?.label ?? room.profileId ?? 'Device'}`}
        />
      )}
      {room.deviceId && room.profileId && (
        <Sheet
          open={resyncOpen}
          onClose={() => setResyncOpen(false)}
          variant="side"
          title="Re-sync entities"
          description={room.name}
        >
          <EntityDiscovery
            deviceId={room.deviceId}
            profileId={room.profileId}
            deviceName={room.entityNamePrefix || room.name}
            onComplete={handleResync}
            onCancel={() => setResyncOpen(false)}
          />
        </Sheet>
      )}
      <Sheet
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        variant="side"
        title="Keyboard shortcuts"
      >
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {SHORTCUTS.map((row) => (
              <tr key={row.action}>
                <td className="py-2 pr-3 align-top">
                  <span className="flex flex-wrap gap-1">
                    {row.keys.map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </span>
                </td>
                <td className="py-2 pr-3 text-fg">{row.action}</td>
                <td className="py-2 text-xs text-fg-muted">{row.modes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sheet>
    </div>
  );
};
