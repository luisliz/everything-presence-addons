import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createZoneBackup,
  fetchZoneAvailability,
  fetchZoneBackups,
  restoreZoneBackup,
} from '../../../api/client';
import { getZoneLabels, saveZoneLabels } from '../../../api/deviceMappings';
import { updateRoom } from '../../../api/rooms';
import type {
  EntityMappings,
  ZoneAvailability,
  ZoneBackup,
  ZonePolygon,
  ZoneRect,
} from '../../../api/types';
import { validateZones } from '../../../api/validate';
import {
  fetchPolygonModeStatus,
  fetchPolygonZonesFromDevice,
  fetchZonesFromDevice,
  type PolygonModeStatus,
  pushPolygonZonesToDevice,
  pushZonesToDevice,
  setPolygonMode,
} from '../../../api/zones';
import { useToast } from '../../../components/primitives';
import type { NewZone } from '../../../components/ZoneCanvas';
import { useAppData } from '../../../contexts/AppDataContext';
import {
  useDeviceMapping,
  useDeviceMappings,
} from '../../../contexts/DeviceMappingsContext';
import { useZoneHistory } from '../../../hooks/useZoneHistory';
import {
  buildCeilingExclusionZones,
  buildCeilingSliceZones,
  type CeilingSliceConfig,
  getCeilingSliceBands,
  normalizeCeilingSliceConfig,
} from '../../../utils/ceilingSlices';
import {
  resolveCoverageFov,
  resolveTrackingCoverageFov,
} from '../../../utils/coverage';
import { resolveEntityPrefix } from '../../../utils/entityUtils';
import { usesPolygonOnlyZones } from '../../../utils/firmware';
import {
  canDeleteVertex,
  deleteVertex,
  MIN_POLYGON_VERTICES,
} from '../../../utils/polygonVertices';
import { resolveZoneLimits } from '../../../utils/zoneCapabilities';
import type { RoomFrame } from '../types';
import {
  changedZoneCount,
  type EditableZone,
  fingerprints,
  isSlotUnavailable,
  type KindSlots,
  kindSlots,
  labelsOf,
  outOfRangeZones,
  rectToPolygon,
  renumberPolygons,
  slotLimit,
  withLabels,
  ZONE_KINDS,
  type ZoneFingerprints,
  type ZoneKind,
} from './zoneSlots';

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

interface Availability {
  zones: ZoneAvailability;
  polygons: ZoneAvailability;
  polygonZonesAvailable: boolean | null;
  entryZonesAvailable: boolean | null;
}
const NO_AVAILABILITY: Availability = {
  zones: {},
  polygons: {},
  polygonZonesAvailable: null,
  entryZonesAvailable: null,
};

interface RestoreContext {
  deviceId: string;
  profileId: string;
  entityNamePrefix?: string;
  entityMappings?: EntityMappings;
}

type WriteWarning = { entityId?: string; description: string };

const messageOf = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

const failedWrites = (warnings: WriteWarning[]) => {
  const sample = warnings
    .map((w) => w.entityId ?? w.description)
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  return `Saved, but ${warnings.length} entity update(s) failed${sample ? ` (${sample})` : ''}.`;
};

const ceilingDeviceZones = (
  config: CeilingSliceConfig,
  labels: Record<string, string>,
) => [
  ...buildCeilingSliceZones(config, labels, 'device'),
  ...buildCeilingExclusionZones(config, labels, 'device'),
];

const lateralRange = (zone: ZonePolygon, axis: 'x' | 'y') => {
  const values = zone.vertices
    .map((v) => v[axis])
    .filter((value) => Number.isFinite(value));
  if (!values.length) return null;
  const [min, max] = [Math.min(...values), Math.max(...values)];
  return { min: Math.min(min, max - 100), max: Math.max(max, min + 100) };
};

export function useZonesEditor(
  frame: Pick<RoomFrame, 'room' | 'profile'>,
  onSaved?: () => void,
) {
  const { room, profile } = frame;
  const { devices, updateRoom: storeRoom } = useAppData();
  const { hasValidMappings, clearCache, getMapping } = useDeviceMappings();
  const { mapping, loading: mappingLoading } = useDeviceMapping(room.deviceId);
  const toast = useToast();
  const roomRef = useRef(room);
  roomRef.current = room;

  const { deviceId, profileId } = room;
  const device = devices.find((d) => d.id === deviceId) ?? null;
  const validMappings = deviceId ? hasValidMappings(deviceId) : false;
  // Keyed by content: a stored room returned by the server carries a new mappings object, which must not reload the editor.
  const mappingsJson =
    !validMappings && room.entityMappings
      ? JSON.stringify(room.entityMappings)
      : null;
  const mappingsForApi = useMemo<EntityMappings | undefined>(
    () => (mappingsJson ? JSON.parse(mappingsJson) : undefined),
    [mappingsJson],
  );
  const prefix = resolveEntityPrefix({
    entityMappings: room.entityMappings,
    entityNamePrefix: room.entityNamePrefix,
    mappingPrefix: mapping?.esphomeNodeName,
    devicePrefix: device?.entityNamePrefix,
  });
  const polygonOnly =
    usesPolygonOnlyZones(
      device?.firmwareVersion ?? mapping?.firmwareVersion ?? null,
      device?.model ?? profile?.label ?? null,
    ) === true;
  const schema = profile?.schemaVersion;
  const needsResync = Boolean(
    deviceId &&
      !mappingLoading &&
      !(mapping && (!schema || mapping.profileSchemaVersion === schema)),
  );

  const limits = useMemo(() => resolveZoneLimits(profile), [profile]);
  const placement = room.devicePlacement;
  const isCeiling =
    profile?.id === 'everything_presence_pro' &&
    placement?.mountType === 'ceiling';
  const tracking = resolveTrackingCoverageFov(profile);
  const maxRangeMeters =
    tracking?.maxRangeMeters ?? profile?.limits?.maxRangeMeters ?? 6;
  const maxRangeMm = maxRangeMeters * 1000;
  const coverageFov = useMemo(
    () => resolveCoverageFov(profile, placement),
    [profile, placement],
  );
  const heightCoverage = useMemo(() => {
    if (!isCeiling || !placement || !coverageFov) return null;
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
  }, [coverageFov, isCeiling, placement]);
  const ceilingConfig = useMemo(
    () =>
      normalizeCeilingSliceConfig(
        room.metadata?.ceilingSliceConfig,
        maxRangeMm,
        true,
      ),
    [maxRangeMm, room.metadata?.ceilingSliceConfig],
  );

  const [rectZones, setRectZones] = useState<ZoneRect[]>([]);
  const [polygonZones, setPolygonZones] = useState<ZonePolygon[]>([]);
  const [ceilingLabels, setCeilingLabels] = useState<Record<string, string>>(
    {},
  );
  const [status, setStatus] = useState<PolygonModeStatus>(NO_POLYGON);
  const [availability, setAvailability] =
    useState<Availability>(NO_AVAILABILITY);
  const [baseline, setBaseline] = useState<{
    rect: ZoneFingerprints;
    polygon: ZoneFingerprints;
  }>({ rect: {}, polygon: {} });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [latestBackup, setLatestBackup] = useState<ZoneBackup | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const labelsRef = useRef<Record<string, string>>({});

  const polygonMode = status.enabled;
  const loaded = loadedFor === room.id;
  const history = useZoneHistory({ zones: rectZones, polygonZones });
  const { reset: resetHistory } = history;

  const ceilingDisplay = useMemo(
    () =>
      isCeiling
        ? [
            ...buildCeilingSliceZones(
              ceilingConfig,
              ceilingLabels,
              'display',
              true,
              heightCoverage,
              maxRangeMm,
            ),
            ...buildCeilingExclusionZones(
              ceilingConfig,
              ceilingLabels,
              'display',
              true,
              heightCoverage,
              maxRangeMm,
            ),
          ]
        : [],
    [ceilingConfig, ceilingLabels, heightCoverage, isCeiling, maxRangeMm],
  );
  const zones: EditableZone[] = polygonMode
    ? isCeiling
      ? ceilingDisplay
      : polygonZones
    : rectZones;
  const writeZones: EditableZone[] = useMemo(
    () =>
      polygonMode
        ? isCeiling
          ? ceilingDeviceZones(ceilingConfig, ceilingLabels)
          : polygonZones
        : rectZones,
    [
      ceilingConfig,
      ceilingLabels,
      isCeiling,
      polygonMode,
      polygonZones,
      rectZones,
    ],
  );
  const dirtyCount = loaded
    ? changedZoneCount(baseline[polygonMode ? 'polygon' : 'rect'], writeZones)
    : 0;

  const unavailable = useCallback(
    (zone: { id: string; type: ZoneKind }) =>
      isSlotUnavailable(
        polygonMode ? availability.polygons : availability.zones,
        zone.id,
        zone.type,
        polygonMode,
      ),
    [availability, polygonMode],
  );

  const slots: KindSlots[] = ZONE_KINDS.filter(
    (kind) => slotLimit(limits, kind) > 0 && !(isCeiling && kind === 'entry'),
  ).map((kind) => {
    if (isCeiling) {
      const used = zones.filter((z) => z.type === kind).length;
      const total = kind === 'regular' ? used : limits.maxExclusionZones;
      return {
        kind,
        total,
        used,
        next: used < total ? `Exclusion ${used + 1}` : null,
      };
    }
    return kindSlots(
      zones,
      kind,
      limits,
      polygonMode ? undefined : (id) => unavailable({ id, type: kind }),
    );
  });

  useEffect(() => {
    if (!deviceId || !profileId || mappingLoading) return;
    let cancelled = false;
    const roomId = room.id;
    (async () => {
      const labels = await getZoneLabels(deviceId).catch(
        () => ({}) as Record<string, string>,
      );
      let next = prefix
        ? await fetchPolygonModeStatus(
            deviceId,
            profileId,
            prefix,
            mappingsForApi,
          ).catch(() => NO_POLYGON)
        : NO_POLYGON;
      if (polygonOnly && (!next.enabled || !next.supported))
        next = POLYGON_ONLY;
      const polygons =
        next.enabled && prefix
          ? await fetchPolygonZonesFromDevice(
              deviceId,
              profileId,
              prefix,
              mappingsForApi,
            ).catch(() => [])
          : [];
      let rects = roomRef.current.zones.filter((z) => z.enabled !== false);
      if (!polygonOnly && prefix) {
        try {
          rects = await fetchZonesFromDevice(
            deviceId,
            profileId,
            prefix,
            mappingsForApi,
          );
          if (!cancelled) {
            storeRoom({ ...roomRef.current, zones: rects });
            await updateRoom(roomId, { zones: rects });
          }
        } catch {
          // The device may have no zone entities yet; stored zones stay.
        }
      }
      if (cancelled) return;
      labelsRef.current = labels;
      const labelledRects = withLabels(rects, labels);
      const labelledPolygons = withLabels(polygons, labels);
      setCeilingLabels(labels);
      setRectZones(labelledRects);
      setPolygonZones(labelledPolygons);
      setStatus(next);
      setBaseline({
        rect: fingerprints(labelledRects),
        polygon: fingerprints(labelledPolygons),
      });
      resetHistory();
      setLoadedFor(roomId);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    deviceId,
    mappingLoading,
    mappingsForApi,
    polygonOnly,
    prefix,
    profileId,
    resetHistory,
    room.id,
    storeRoom,
  ]);

  // Ceiling slices come from room config, so their baseline is what the config held when the room loaded.
  const ceilingBaselineFor = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !isCeiling || ceilingBaselineFor.current === room.id) return;
    ceilingBaselineFor.current = room.id;
    setBaseline((current) => ({
      ...current,
      polygon: fingerprints(ceilingDeviceZones(ceilingConfig, ceilingLabels)),
    }));
  }, [ceilingConfig, ceilingLabels, isCeiling, loaded, room.id]);

  useEffect(() => {
    setAvailability(NO_AVAILABILITY);
    if (!deviceId || !profileId || !prefix) return;
    let cancelled = false;
    fetchZoneAvailability(deviceId, profileId, prefix, mappingsForApi)
      .then((response) => {
        if (cancelled) return;
        setAvailability({
          zones: response.availability,
          polygons: response.polygonAvailability ?? {},
          polygonZonesAvailable: response.polygonZonesAvailable,
          entryZonesAvailable: response.entryZonesAvailable,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [deviceId, mappingsForApi, prefix, profileId]);

  const reloadBackups = useCallback(async () => {
    if (!deviceId) {
      setLatestBackup(null);
      return;
    }
    setBackupsLoading(true);
    try {
      const { backups } = await fetchZoneBackups(deviceId);
      setLatestBackup(
        [...(backups ?? [])].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0] ?? null,
      );
    } catch {
      setLatestBackup(null);
    } finally {
      setBackupsLoading(false);
    }
  }, [deviceId]);
  useEffect(() => {
    void reloadBackups();
  }, [reloadBackups]);

  const fail = useCallback(
    (message: string) => {
      setLastError(message);
      toast.show(message, { tone: 'danger' });
    },
    [toast],
  );

  const pendingCeiling = useRef<CeilingSliceConfig | null>(null);
  const ceilingSeq = useRef(0);
  const persistCeiling = useCallback(
    async (config: CeilingSliceConfig | null = pendingCeiling.current) => {
      if (!config) return;
      pendingCeiling.current = null;
      const seq = ++ceilingSeq.current;
      try {
        const result = await updateRoom(roomRef.current.id, {
          metadata: {
            ...(roomRef.current.metadata ?? {}),
            ceilingSliceConfig: config,
          },
        });
        if (seq === ceilingSeq.current) storeRoom(result.room);
      } catch (err) {
        pendingCeiling.current = config;
        fail(messageOf(err, 'Could not save the ceiling slice settings'));
      }
    },
    [fail, storeRoom],
  );
  const updateCeiling = useCallback(
    (updates: Partial<CeilingSliceConfig>, persist = true) => {
      const next = normalizeCeilingSliceConfig(
        { ...ceilingConfig, ...updates },
        maxRangeMm,
        true,
      );
      storeRoom({
        ...roomRef.current,
        metadata: {
          ...(roomRef.current.metadata ?? {}),
          ceilingSliceConfig: next,
        },
      });
      if (persist) void persistCeiling(next);
      else pendingCeiling.current = next;
    },
    [ceilingConfig, maxRangeMm, persistCeiling, storeRoom],
  );

  const applyCeilingShapes = useCallback(
    (next: ZonePolygon[]) => {
      const axis = ceilingConfig.axis;
      const ranges = getCeilingSliceBands(ceilingConfig)
        .slice(0, ceilingConfig.sliceCount)
        .map(({ min, max }) => ({ min, max }));
      const exclusions = [...(ceilingConfig.exclusionRangesMm ?? [])];
      for (const zone of next) {
        const index = Number(zone.id.match(/\d+/)?.[0] ?? '0') - 1;
        const range = lateralRange(zone, axis);
        if (index < 0 || !range) continue;
        if (zone.type === 'regular' && index < ranges.length)
          ranges[index] = range;
        if (zone.type === 'exclusion') exclusions[index] = range;
      }
      updateCeiling(
        {
          lateralMinMm: Math.min(...ranges.map((r) => r.min)),
          lateralMaxMm: Math.max(...ranges.map((r) => r.max)),
          lateralBreakpointsMm: undefined,
          lateralRangesMm: ranges,
          exclusionRangesMm: exclusions.slice(0, limits.maxExclusionZones),
        },
        false,
      );
    },
    [ceilingConfig, limits.maxExclusionZones, updateCeiling],
  );

  const apply = useCallback(
    (
      next: { zones: ZoneRect[]; polygonZones: ZonePolygon[] },
      key?: string,
    ) => {
      history.push(next, { coalesceKey: key ?? null });
      setRectZones(next.zones);
      setPolygonZones(next.polygonZones);
    },
    [history],
  );

  const setZones = useCallback(
    (next: EditableZone[], key?: string) => {
      if (polygonMode && isCeiling) {
        applyCeilingShapes(next as ZonePolygon[]);
        return;
      }
      apply(
        polygonMode
          ? { zones: rectZones, polygonZones: next as ZonePolygon[] }
          : { zones: next as ZoneRect[], polygonZones },
        key,
      );
    },
    [
      apply,
      applyCeilingShapes,
      isCeiling,
      polygonMode,
      polygonZones,
      rectZones,
    ],
  );

  const updateZone = useCallback(
    (zone: EditableZone, key?: string) =>
      setZones(
        zones.map((z) => (z.id === zone.id ? zone : z)),
        key,
      ),
    [setZones, zones],
  );

  const commit = useCallback(
    (shape: NewZone): string | null => {
      const kind = shape.type;
      const slot = slots.find((s) => s.kind === kind);
      if (!slot?.next) {
        toast.show(
          `All ${slot?.total ?? 0} ${kind === 'regular' ? 'zone' : kind} slots are used`,
          {
            tone: 'warning',
          },
        );
        return null;
      }
      if (isCeiling) {
        const range =
          kind === 'exclusion' && 'vertices' in shape
            ? lateralRange({ id: '', ...shape }, ceilingConfig.axis)
            : null;
        if (!range) return null;
        const exclusions = [...(ceilingConfig.exclusionRangesMm ?? []), range];
        updateCeiling({ exclusionRangesMm: exclusions });
        return `Exclusion ${exclusions.length}`;
      }
      if ('vertices' in shape) {
        apply({
          zones: rectZones,
          polygonZones: renumberPolygons([
            ...polygonZones,
            { ...shape, id: slot.next, enabled: true },
          ]),
        });
      } else {
        apply({
          zones: [...rectZones, { ...shape, id: slot.next, enabled: true }],
          polygonZones,
        });
      }
      return slot.next;
    },
    [
      apply,
      ceilingConfig,
      isCeiling,
      polygonZones,
      rectZones,
      slots,
      toast,
      updateCeiling,
    ],
  );

  const removeZone = useCallback(
    (id: string) => {
      if (isCeiling) {
        const zone = zones.find((z) => z.id === id);
        if (zone?.type !== 'exclusion') return;
        const index = Number(id.replace(/\D/g, '')) - 1;
        updateCeiling({
          exclusionRangesMm: (ceilingConfig.exclusionRangesMm ?? []).filter(
            (_, i) => i !== index,
          ),
        });
        return;
      }
      if (polygonMode)
        apply({
          zones: rectZones,
          polygonZones: renumberPolygons(
            polygonZones.filter((z) => z.id !== id),
          ),
        });
      else apply({ zones: rectZones.filter((z) => z.id !== id), polygonZones });
    },
    [
      apply,
      ceilingConfig,
      isCeiling,
      polygonMode,
      polygonZones,
      rectZones,
      updateCeiling,
      zones,
    ],
  );

  const rename = useCallback(
    (id: string, label: string) => {
      if (isCeiling) {
        setCeilingLabels((current) => {
          const { [id]: _, ...rest } = current;
          return label ? { ...rest, [id]: label } : rest;
        });
        return;
      }
      const zone = zones.find((z) => z.id === id);
      if (zone)
        updateZone({ ...zone, label: label || undefined }, `label:${id}`);
    },
    [isCeiling, updateZone, zones],
  );

  const removeVertex = useCallback(
    (id: string, index: number) => {
      const zone = polygonZones.find((z) => z.id === id);
      if (!zone || isCeiling) return false;
      if (!canDeleteVertex(zone.vertices, index)) {
        toast.show(`A zone needs at least ${MIN_POLYGON_VERTICES} points`, {
          tone: 'warning',
        });
        return false;
      }
      updateZone({ ...zone, vertices: deleteVertex(zone.vertices, index) });
      return true;
    },
    [isCeiling, polygonZones, toast, updateZone],
  );

  const step = useCallback(
    (direction: 'undo' | 'redo') => {
      const snapshot = direction === 'undo' ? history.undo() : history.redo();
      if (!snapshot) return;
      setRectZones(snapshot.zones);
      setPolygonZones(snapshot.polygonZones);
    },
    [history],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (isCeiling && !polygonMode) {
      fail(
        'Ceiling slice zones need polygon mode. Switch Zone shape to Polygons before saving slices.',
      );
      return false;
    }
    const rectsToWrite = rectZones.filter((zone) => !unavailable(zone));
    const far = isCeiling
      ? []
      : outOfRangeZones(polygonMode ? polygonZones : rectsToWrite, maxRangeMm);
    if (far.length > 0) {
      fail(
        `These zones reach past the ${maxRangeMeters} m detection range: ${far.join(', ')}. Move or resize them inside the coverage.`,
      );
      return false;
    }
    setSaving(true);
    setLastError(null);
    const warnings: string[] = [];
    try {
      if (deviceId && profileId && prefix) {
        if (polygonMode) {
          const result = await pushPolygonZonesToDevice(
            deviceId,
            profileId,
            writeZones as ZonePolygon[],
            prefix,
            mappingsForApi,
          );
          if (result.warnings?.length)
            warnings.push(failedWrites(result.warnings));
          const skipped = polygonZones.filter(unavailable);
          if (skipped.length > 0)
            warnings.push(
              `Some zones were not written because their entities are disabled or unavailable (${skipped
                .slice(0, 3)
                .map((z) => z.id)
                .join(', ')}).`,
            );
        } else {
          await validateZones(rectsToWrite);
          const result = await pushZonesToDevice(
            deviceId,
            profileId,
            rectsToWrite,
            prefix,
            mappingsForApi,
          );
          if (result.warnings?.length)
            warnings.push(failedWrites(result.warnings));
          const skipped = rectZones.filter(unavailable);
          if (skipped.length > 0)
            warnings.push(
              `Some zones were skipped because their entities are disabled or unavailable (${skipped
                .slice(0, 3)
                .map((z) => z.id)
                .join(', ')}).`,
            );
        }
      }
      if (!polygonMode) {
        const result = await updateRoom(room.id, { zones: rectZones });
        storeRoom(result.room);
      }
      if (deviceId) {
        const saved = await saveZoneLabels(deviceId, labelsOf(writeZones));
        if (saved) {
          labelsRef.current = saved.zoneLabels;
          clearCache(deviceId);
          const renames = saved.synchronization.warnings;
          if (renames.length > 0)
            warnings.push(
              `Zone names were saved, but ${renames.length} Home Assistant entity name update(s) failed. ${renames
                .slice(0, 3)
                .map((w) =>
                  w.entityId ? `${w.entityId}: ${w.message}` : w.message,
                )
                .join('; ')}`,
            );
        }
      }
      setBaseline((current) => ({
        ...current,
        [polygonMode ? 'polygon' : 'rect']: fingerprints(writeZones),
      }));
      toast.show(
        warnings.length ? warnings.join(' ') : 'Zones saved to the device',
        { tone: warnings.length ? 'warning' : 'success' },
      );
      onSaved?.();
      return true;
    } catch (err) {
      fail(messageOf(err, 'Could not save the zones'));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    clearCache,
    deviceId,
    fail,
    isCeiling,
    mappingsForApi,
    maxRangeMeters,
    maxRangeMm,
    onSaved,
    polygonMode,
    polygonZones,
    prefix,
    profileId,
    rectZones,
    room.id,
    storeRoom,
    toast,
    unavailable,
    writeZones,
  ]);

  const loadPolygons = useCallback(
    async (context: RestoreContext) => {
      const polygons = withLabels(
        await fetchPolygonZonesFromDevice(
          context.deviceId,
          context.profileId,
          context.entityNamePrefix ?? '',
          context.entityMappings,
        ),
        labelsRef.current,
      );
      setPolygonZones(polygons);
      setBaseline((current) => ({
        ...current,
        polygon: fingerprints(polygons),
      }));
      resetHistory();
    },
    [resetHistory],
  );

  const switchShape = useCallback(async () => {
    if (!deviceId || !profileId || !prefix) return;
    const enable = !polygonMode;
    setSwitching(true);
    try {
      await setPolygonMode(deviceId, profileId, prefix, enable, mappingsForApi);
      setStatus((current) => ({ ...current, enabled: enable }));
      if (enable)
        await loadPolygons({
          deviceId,
          profileId,
          entityNamePrefix: prefix,
          entityMappings: mappingsForApi,
        });
      else setPolygonZones([]);
    } catch (err) {
      fail(messageOf(err, 'Could not switch the zone shape'));
    } finally {
      setSwitching(false);
    }
  }, [
    deviceId,
    fail,
    loadPolygons,
    mappingsForApi,
    polygonMode,
    prefix,
    profileId,
  ]);

  /** Device, profile and prefix for a backup restore; null after telling the user what is missing. */
  const restoreContext =
    useCallback(async (): Promise<RestoreContext | null> => {
      if (!deviceId) return null;
      const fresh = await getMapping(deviceId);
      const contextProfile = profileId || fresh?.profileId || null;
      const entityNamePrefix = resolveEntityPrefix({
        entityMappings: roomRef.current.entityMappings,
        entityNamePrefix: roomRef.current.entityNamePrefix,
        mappingPrefix: fresh?.esphomeNodeName,
        devicePrefix: device?.entityNamePrefix,
      });
      if (!contextProfile) {
        fail(
          'Device profile not found. Run entity discovery to sync the device.',
        );
        return null;
      }
      if (!entityNamePrefix && !fresh) {
        fail(
          'Entity name prefix is missing. Link the device to a room or re-sync entities.',
        );
        return null;
      }
      return {
        deviceId,
        profileId: contextProfile,
        entityNamePrefix: entityNamePrefix ?? undefined,
        entityMappings: mappingsForApi,
      };
    }, [
      device?.entityNamePrefix,
      deviceId,
      fail,
      getMapping,
      mappingsForApi,
      profileId,
    ]);

  const savedRectangles = room.zones.filter((zone) => zone.enabled !== false);

  const recoverRoomZones = useCallback(async () => {
    const context = await restoreContext();
    if (!context) return;
    setRecovering(true);
    try {
      const converted = savedRectangles.map((zone) =>
        rectToPolygon({
          ...zone,
          label: labelsRef.current[zone.id] ?? zone.label,
        }),
      );
      const result = await pushPolygonZonesToDevice(
        context.deviceId,
        context.profileId,
        converted,
        context.entityNamePrefix ?? '',
        context.entityMappings,
      );
      if (!result.ok) {
        const sample = result.warnings?.[0];
        throw new Error(
          sample
            ? `Recovery partially failed: ${sample.error}`
            : 'Could not recover the polygon zones',
        );
      }
      setPolygonZones(converted);
      setBaseline((current) => ({
        ...current,
        polygon: fingerprints(converted),
      }));
      setStatus((current) => ({ ...current, supported: true, enabled: true }));
      resetHistory();
      toast.show(
        `Recovered ${converted.length} polygon zone${converted.length === 1 ? '' : 's'} from saved rectangles.`,
        { tone: 'success' },
      );
    } catch (err) {
      fail(messageOf(err, 'Could not recover the polygon zones'));
    } finally {
      setRecovering(false);
    }
  }, [fail, resetHistory, restoreContext, savedRectangles, toast]);

  /** Re-read polygons and labels after a backup restore wrote them to the device. */
  const afterRestore = useCallback(
    async (context: RestoreContext) => {
      clearCache(context.deviceId);
      labelsRef.current = await getZoneLabels(context.deviceId).catch(
        () => labelsRef.current,
      );
      setStatus((current) => ({ ...current, supported: true, enabled: true }));
      await loadPolygons(context);
    },
    [clearCache, loadPolygons],
  );

  const restoreBackup = useCallback(
    async (backup: ZoneBackup) => {
      const context = await restoreContext();
      if (!context) return false;
      setRecovering(true);
      try {
        const result = await restoreZoneBackup(backup.id, context);
        if (!result.ok)
          throw new Error(
            'Restore completed with errors. Check the warnings and try again.',
          );
        await afterRestore(context);
        toast.show(
          result.warnings?.length
            ? `Restored the backup with ${result.warnings.length} warning(s).`
            : 'Backup restored as polygon zones.',
          { tone: result.warnings?.length ? 'warning' : 'success' },
        );
        return true;
      } catch (err) {
        fail(messageOf(err, 'Could not restore the zone backup'));
        return false;
      } finally {
        setRecovering(false);
      }
    },
    [afterRestore, fail, restoreContext, toast],
  );

  const backUpNow = useCallback(async () => {
    const context = await restoreContext();
    if (!context) return;
    setBackingUp(true);
    try {
      await createZoneBackup(context);
      await reloadBackups();
      toast.show('Zone backup created.', { tone: 'success' });
    } catch (err) {
      fail(messageOf(err, 'Could not create the zone backup'));
    } finally {
      setBackingUp(false);
    }
  }, [fail, reloadBackups, restoreContext, toast]);

  return {
    loaded,
    zones,
    rectZones,
    polygonZones: polygonMode ? (zones as ZonePolygon[]) : [],
    polygonMode,
    shapeStatus: status,
    polygonZonesAvailable: availability.polygonZonesAvailable,
    unavailable,
    slots,
    limits,
    isCeiling,
    ceilingConfig,
    heightCoverage,
    updateCeiling,
    persistCeiling,
    needsResync,
    dirtyCount,
    saving,
    lastError,
    switching,
    recovering,
    backingUp,
    latestBackup,
    backupsLoading,
    reloadBackups,
    recovery: {
      rectangles: savedRectangles.length,
      backup: polygonOnly ? latestBackup : null,
    },
    setZones,
    updateZone,
    commit,
    removeZone,
    rename,
    removeVertex,
    undo: () => step('undo'),
    redo: () => step('redo'),
    canUndo: !isCeiling && history.canUndo,
    canRedo: !isCeiling && history.canRedo,
    save,
    switchShape,
    recoverRoomZones,
    restoreBackup,
    backUpNow,
  };
}

export type ZonesEditor = ReturnType<typeof useZonesEditor>;
