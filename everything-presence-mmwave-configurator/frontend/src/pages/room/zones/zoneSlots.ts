import type {
  Point,
  ZoneAvailability,
  ZonePolygon,
  ZoneRect,
} from '../../../api/types';

export type ZoneKind = ZoneRect['type'];
export type EditableZone = ZoneRect | ZonePolygon;

export const ZONE_KINDS: readonly ZoneKind[] = [
  'regular',
  'exclusion',
  'entry',
];

export const KIND_PREFIX: Record<ZoneKind, string> = {
  regular: 'Zone',
  exclusion: 'Exclusion',
  entry: 'Entry',
};

export interface ZoneLimits {
  maxZones: number;
  maxExclusionZones: number;
  maxEntryZones: number;
}

export const slotLimit = (limits: ZoneLimits, kind: ZoneKind): number =>
  kind === 'regular'
    ? limits.maxZones
    : kind === 'exclusion'
      ? limits.maxExclusionZones
      : limits.maxEntryZones;

export const slotNumber = (id: string): number | null => {
  const match = id.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
};

export const slotId = (kind: ZoneKind, n: number) =>
  `${KIND_PREFIX[kind]} ${n}`;

/** Rectangle availability is keyed `zone3`; polygon availability by the zone id. */
export const availabilityKey = (
  id: string,
  kind: ZoneKind,
  polygonMode: boolean,
): string =>
  polygonMode
    ? id
    : `${kind === 'regular' ? 'zone' : kind}${slotNumber(id) ?? 1}`;

export const isSlotUnavailable = (
  availability: ZoneAvailability,
  id: string,
  kind: ZoneKind,
  polygonMode: boolean,
): boolean => {
  const status = availability[availabilityKey(id, kind, polygonMode)]?.status;
  return status === 'disabled' || status === 'unavailable';
};

export interface KindSlots {
  kind: ZoneKind;
  total: number;
  used: number;
  /** Lowest free slot whose entities exist; null when the kind is full. */
  next: string | null;
}

export function kindSlots(
  zones: readonly EditableZone[],
  kind: ZoneKind,
  limits: ZoneLimits,
  unavailable: (id: string) => boolean = () => false,
): KindSlots {
  const total = slotLimit(limits, kind);
  const taken = new Set(
    zones.filter((zone) => zone.type === kind).map((zone) => zone.id),
  );
  let next: string | null = null;
  for (let n = 1; n <= total && next === null; n += 1) {
    const id = slotId(kind, n);
    if (!taken.has(id) && !unavailable(id)) next = id;
  }
  return { kind, total, used: taken.size, next };
}

/** Polygon slots are positional on the device, so ids follow list order per kind. */
export function renumberPolygons(zones: readonly ZonePolygon[]): ZonePolygon[] {
  const counters: Record<ZoneKind, number> = {
    regular: 0,
    exclusion: 0,
    entry: 0,
  };
  return zones.map((zone) => {
    counters[zone.type] += 1;
    return { ...zone, id: slotId(zone.type, counters[zone.type]) };
  });
}

export const rectToPolygon = (zone: ZoneRect): ZonePolygon => ({
  id: zone.id,
  type: zone.type,
  vertices: [
    { x: zone.x, y: zone.y },
    { x: zone.x + zone.width, y: zone.y },
    { x: zone.x + zone.width, y: zone.y + zone.height },
    { x: zone.x, y: zone.y + zone.height },
  ],
  enabled: zone.enabled,
  label: zone.label,
});

export const zonePoints = (zone: EditableZone): Point[] =>
  'vertices' in zone ? zone.vertices : rectToPolygon(zone).vertices;

/** Zones with a point farther from the device than `maxRangeMm`, as "Zone 2". */
export const outOfRangeZones = (
  zones: readonly EditableZone[],
  maxRangeMm: number,
): string[] =>
  zones
    .filter((zone) =>
      zonePoints(zone).some((p) => Math.hypot(p.x, p.y) > maxRangeMm),
    )
    .map((zone) => zone.id);

const fingerprint = (zone: EditableZone) =>
  JSON.stringify({
    type: zone.type,
    label: zone.label || undefined,
    points: zonePoints(zone).map((p) => [Math.round(p.x), Math.round(p.y)]),
  });

export type ZoneFingerprints = Record<string, string>;

export const fingerprints = (
  zones: readonly EditableZone[],
): ZoneFingerprints =>
  Object.fromEntries(zones.map((zone) => [zone.id, fingerprint(zone)]));

/** Zone ids added, removed or changed since `baseline`. */
export function changedZoneCount(
  baseline: ZoneFingerprints,
  zones: readonly EditableZone[],
): number {
  const current = fingerprints(zones);
  const ids = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...ids].filter((id) => baseline[id] !== current[id]).length;
}

export const withLabels = <T extends EditableZone>(
  zones: readonly T[],
  labels: Record<string, string>,
): T[] =>
  zones.map((zone) => ({ ...zone, label: labels[zone.id] ?? zone.label }));

export const labelsOf = (zones: readonly EditableZone[]) =>
  Object.fromEntries(
    zones.flatMap((zone) => (zone.label ? [[zone.id, zone.label]] : [])),
  ) as Record<string, string>;
