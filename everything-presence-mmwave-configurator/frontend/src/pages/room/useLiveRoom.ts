import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { updateRoom } from '../../api/rooms';
import type { ZonePolygon, ZoneRect } from '../../api/types';
import {
  fetchPolygonModeStatus,
  fetchPolygonZonesFromDevice,
  fetchZonesFromDevice,
  type PolygonModeStatus,
} from '../../api/zones';
import { useToast } from '../../components/primitives';
import { useAppData } from '../../contexts/AppDataContext';
import { useDeviceMapping } from '../../contexts/DeviceMappingsContext';
import { useHeatmap } from '../../hooks/useHeatmap';
import {
  buildCeilingExclusionZones,
  buildCeilingSliceZones,
  normalizeCeilingSliceConfig,
} from '../../utils/ceilingSlices';
import { resolveCoverageFov } from '../../utils/coverage';
import { resolveEntityPrefix } from '../../utils/entityUtils';
import { usesPolygonOnlyZones } from '../../utils/firmware';
import { smoothStep } from './smoothing';
import type { RoomFrame, TargetPosition } from './types';

export interface RecordedPoint {
  x: number;
  y: number;
  targetId: number;
  timestamp: number;
}

export interface LiveZone {
  id: string;
  label: string;
  kind: ZoneRect['type'];
  /** Firmware zone slot (1-4) for regular zones; drives occupancy and off delay. */
  slot?: number;
  occupied?: boolean;
}

const NO_POLYGON: PolygonModeStatus = {
  supported: false,
  enabled: false,
  controllable: false,
};
const POLYGON_ONLY: PolygonModeStatus = {
  supported: true,
  enabled: true,
  controllable: false,
};
const TRAIL_AGE_MS = 5000;
const TRAIL_POINTS = 20;
const RECORD_MIN_STEP_MM = 50;
const SMOOTHING = 0.15;

const slotOf = (id: string, fallback: number) => {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : fallback;
};

export interface LiveRoomOptions {
  heatmapEnabled: boolean;
  heatmapHours: number;
  showTrails: boolean;
  smoothTracking: boolean;
}

export function useLiveRoom(
  frame: Pick<RoomFrame, 'room' | 'profile' | 'liveState' | 'targetPositions'>,
  { heatmapEnabled, heatmapHours, showTrails, smoothTracking }: LiveRoomOptions,
) {
  const { room, profile, liveState, targetPositions } = frame;
  const { devices, updateRoom: storeRoom } = useAppData();
  const toast = useToast();
  const { mapping, loading: mappingLoading } = useDeviceMapping(room.deviceId);
  const device = useMemo(
    () => devices.find((d) => d.id === room.deviceId) ?? null,
    [devices, room.deviceId],
  );
  const isEP1 = room.profileId === 'everything_presence_one';
  const capabilities = (profile?.capabilities ?? {}) as {
    tracking?: boolean;
    distanceOnlyTracking?: boolean;
  };
  const placement = room.devicePlacement;
  const isCeilingMount = placement?.mountType === 'ceiling';
  const isCeilingSliceMode =
    profile?.id === 'everything_presence_pro' && isCeilingMount;
  const maxRangeMm = (profile?.limits?.maxRangeMeters ?? 6) * 1000;

  const hasValidMappings = useMemo(() => {
    if (mappingLoading || !mapping) return false;
    const profileVersion = profile?.schemaVersion;
    return !profileVersion || mapping.profileSchemaVersion === profileVersion;
  }, [mapping, mappingLoading, profile?.schemaVersion]);
  const needsResync = Boolean(
    room.deviceId && !mappingLoading && !hasValidMappings,
  );

  const entityNamePrefix = resolveEntityPrefix({
    entityMappings: room.entityMappings,
    entityNamePrefix: room.entityNamePrefix,
    mappingPrefix: mapping?.esphomeNodeName,
    devicePrefix: device?.entityNamePrefix,
  });
  const mappingsForApi = hasValidMappings ? undefined : room.entityMappings;
  const polygonOnly =
    usesPolygonOnlyZones(
      device?.firmwareVersion ?? mapping?.firmwareVersion ?? null,
      device?.model ?? profile?.label ?? null,
    ) === true;

  const coverageFov = useMemo(
    () => resolveCoverageFov(profile, placement),
    [profile, placement],
  );
  const heightCoverage = useMemo(() => {
    if (!placement || !isCeilingMount || !coverageFov) return null;
    const pitchDeg = Number.isFinite(placement.pitchDeg)
      ? Number(placement.pitchDeg)
      : 90;
    if (!Number.isFinite(placement.heightMm)) return null;
    return {
      enabled: true,
      heightMm: Number(placement.heightMm),
      pitchDeg,
      horizontalFovDeg: coverageFov.horizontalFovDeg,
      verticalFovDeg: coverageFov.verticalFovDeg,
      maxRangeMeters: coverageFov.maxRangeMeters,
    };
  }, [coverageFov, isCeilingMount, placement]);
  const ceilingSliceConfig = useMemo(
    () =>
      normalizeCeilingSliceConfig(
        room.metadata?.ceilingSliceConfig,
        maxRangeMm,
        true,
      ),
    [maxRangeMm, room.metadata?.ceilingSliceConfig],
  );

  const [polygonStatus, setPolygonStatus] =
    useState<PolygonModeStatus>(NO_POLYGON);
  const [polygonZones, setPolygonZones] = useState<ZonePolygon[]>([]);
  const zonesFetchedFor = useRef<string | null>(null);
  const roomRef = useRef(room);
  roomRef.current = room;

  // The device is the source of truth for rectangle zones: read them once per room and store them.
  useEffect(() => {
    if (
      !room.deviceId ||
      !room.profileId ||
      mappingLoading ||
      !entityNamePrefix ||
      zonesFetchedFor.current === room.id
    )
      return;
    if (polygonOnly) return;
    const roomId = room.id;
    // Marks the read in flight; a failed read clears it so the next run retries.
    zonesFetchedFor.current = roomId;
    fetchZonesFromDevice(
      room.deviceId,
      room.profileId,
      entityNamePrefix,
      mappingsForApi,
    ).then(
      async (zones) => {
        const latest = roomRef.current;
        if (latest.id !== roomId) return;
        // A transient empty read must not wipe known-good stored zones.
        if (zones.length === 0 && latest.zones.length > 0) return;
        storeRoom({ ...latest, zones });
        await updateRoom(latest.id, { zones }).catch(() =>
          toast.show('Could not store the zones read from the device', {
            tone: 'danger',
          }),
        );
      },
      () => {
        if (zonesFetchedFor.current === roomId) zonesFetchedFor.current = null;
      },
    );
  }, [
    entityNamePrefix,
    mappingLoading,
    mappingsForApi,
    polygonOnly,
    room.deviceId,
    room.id,
    room.profileId,
    storeRoom,
    toast,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a room switch resets the status, so it must be read again for the new room
  useEffect(() => {
    if (!room.deviceId || !room.profileId || !entityNamePrefix) {
      setPolygonStatus(NO_POLYGON);
      return;
    }
    let cancelled = false;
    fetchPolygonModeStatus(
      room.deviceId,
      room.profileId,
      entityNamePrefix,
      mappingsForApi,
    )
      .then((status) => {
        if (cancelled) return;
        // Polygon-only firmware has no rectangle mode; a stale toggle must not hide every zone.
        setPolygonStatus(
          polygonOnly && (!status.enabled || !status.supported)
            ? POLYGON_ONLY
            : status,
        );
      })
      .catch(() => {
        if (!cancelled)
          setPolygonStatus(polygonOnly ? POLYGON_ONLY : NO_POLYGON);
      });
    return () => {
      cancelled = true;
    };
  }, [
    entityNamePrefix,
    mappingsForApi,
    polygonOnly,
    room.deviceId,
    room.id,
    room.profileId,
  ]);

  useEffect(() => {
    if (
      !polygonStatus.enabled ||
      !room.deviceId ||
      !room.profileId ||
      !entityNamePrefix
    ) {
      setPolygonZones([]);
      return;
    }
    let cancelled = false;
    fetchPolygonZonesFromDevice(
      room.deviceId,
      room.profileId,
      entityNamePrefix,
      mappingsForApi,
    )
      .then((zones) => {
        if (!cancelled) setPolygonZones(zones);
      })
      .catch(() => {
        if (!cancelled) setPolygonZones([]);
      });
    return () => {
      cancelled = true;
    };
  }, [
    entityNamePrefix,
    mappingsForApi,
    polygonStatus.enabled,
    room.deviceId,
    room.profileId,
  ]);

  const displayPolygonZones = useMemo(
    () =>
      isCeilingSliceMode
        ? [
            ...buildCeilingSliceZones(
              ceilingSliceConfig,
              {},
              'display',
              false,
              heightCoverage,
              maxRangeMm,
            ),
            ...buildCeilingExclusionZones(
              ceilingSliceConfig,
              {},
              'display',
              false,
              heightCoverage,
              maxRangeMm,
            ),
          ]
        : polygonZones,
    [
      ceilingSliceConfig,
      heightCoverage,
      isCeilingSliceMode,
      maxRangeMm,
      polygonZones,
    ],
  );
  const rectZones = polygonOnly ? [] : room.zones;
  const polygonMode = polygonStatus.enabled;

  const zones = useMemo<LiveZone[]>(() => {
    const source: Array<ZoneRect | ZonePolygon> = polygonMode
      ? displayPolygonZones
      : rectZones;
    const occupancy = liveState?.zoneOccupancy as
      | Record<string, boolean | undefined>
      | undefined;
    let regularIndex = 0;
    return source
      .filter((zone) => zone.enabled !== false)
      .map((zone) => {
        if (zone.type !== 'regular')
          return {
            id: zone.id,
            kind: zone.type,
            label: zone.label || zone.id,
          };
        regularIndex += 1;
        const slot = slotOf(zone.id, regularIndex);
        const mapped = isCeilingSliceMode
          ? undefined
          : (mapping?.zoneLabels?.[zone.id] ??
            mapping?.zoneLabels?.[`zone${slot}`]);
        return {
          id: zone.id,
          kind: zone.type,
          slot,
          label: mapped || zone.label || `Zone ${slot}`,
          occupied: occupancy?.[`zone${slot}`] ?? false,
        };
      });
  }, [
    displayPolygonZones,
    isCeilingSliceMode,
    liveState?.zoneOccupancy,
    mapping?.zoneLabels,
    polygonMode,
    rectZones,
  ]);

  const supportsHeatmap = capabilities.tracking === true && !isEP1;
  const heatmap = useHeatmap({
    deviceId: room.deviceId ?? null,
    profileId: room.profileId ?? null,
    entityNamePrefix: entityNamePrefix ?? null,
    entityMappings: mappingsForApi,
    hours: heatmapHours,
    enabled: heatmapEnabled && supportsHeatmap,
  });

  const [trails, setTrails] = useState<
    Map<number, Array<{ x: number; y: number; timestamp: number }>>
  >(new Map());
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<RecordedPoint[]>([]);
  const [animated, setAnimated] = useState<
    Map<number, { x: number; y: number }>
  >(new Map());

  // Another room's zones, trails and recording must not show while this room's reads are in flight.
  const [stateFor, setStateFor] = useState(room.id);
  if (stateFor !== room.id) {
    setStateFor(room.id);
    setPolygonStatus(NO_POLYGON);
    setPolygonZones([]);
    setTrails(new Map());
    setRecording(false);
    setRecorded([]);
    setAnimated(new Map());
  }

  useEffect(() => {
    if (!showTrails || targetPositions.length === 0) return;
    const now = Date.now();
    setTrails((prev) => {
      const next = new Map<
        number,
        Array<{ x: number; y: number; timestamp: number }>
      >();
      for (const target of targetPositions) {
        next.set(
          target.id,
          [
            ...(prev.get(target.id) ?? []),
            { x: target.x, y: target.y, timestamp: now },
          ]
            .filter((p) => now - p.timestamp < TRAIL_AGE_MS)
            .slice(-TRAIL_POINTS),
        );
      }
      return next;
    });
  }, [showTrails, targetPositions]);

  useEffect(() => {
    if (!recording || targetPositions.length === 0) return;
    const now = Date.now();
    setRecorded((prev) => {
      const added = targetPositions
        .filter((target) => {
          const last = [...prev]
            .reverse()
            .find((p) => p.targetId === target.id);
          return (
            !last ||
            Math.hypot(target.x - last.x, target.y - last.y) >=
              RECORD_MIN_STEP_MM
          );
        })
        .map((t) => ({ x: t.x, y: t.y, targetId: t.id, timestamp: now }));
      return added.length ? [...prev, ...added] : prev;
    });
  }, [recording, targetPositions]);

  useEffect(() => {
    if (!smoothTracking) {
      setAnimated(
        new Map(targetPositions.map((t) => [t.id, { x: t.x, y: t.y }])),
      );
      return;
    }
    if (targetPositions.length === 0) {
      setAnimated((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let frameId = 0;
    const step = () => {
      setAnimated((prev) => smoothStep(prev, targetPositions, SMOOTHING));
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [smoothTracking, targetPositions]);

  const toggleRecording = useCallback(() => {
    setRecording((on) => {
      if (!on) setRecorded([]);
      return !on;
    });
  }, []);
  const clearRecording = useCallback(() => setRecorded([]), []);

  const renderPosition = useCallback(
    (target: TargetPosition) =>
      animated.get(target.id) ?? { x: target.x, y: target.y },
    [animated],
  );

  return {
    isEP1,
    capabilities,
    supportsHeatmap,
    isCeilingMount,
    heightCoverage,
    ceilingSliceConfig,
    maxRangeMm,
    mapping,
    needsResync,
    polygonMode,
    polygonSupported: polygonStatus.supported,
    rectZones,
    displayPolygonZones,
    zones,
    zoneLabels: isCeilingSliceMode ? undefined : mapping?.zoneLabels,
    heatmap,
    trails,
    recording,
    recorded,
    toggleRecording,
    clearRecording,
    renderPosition,
  };
}

export type LiveRoom = ReturnType<typeof useLiveRoom>;
