import type { DevicePlacement, DeviceProfile } from '../api/types';

export interface CoverageFov {
  horizontalFovDeg: number;
  verticalFovDeg: number;
  maxRangeMeters: number;
  presetId?: string;
  label?: string;
  source: 'override' | 'preset';
}

export const resolveCoverageFov = (
  profile: DeviceProfile | null | undefined,
  placement?: DevicePlacement | null,
): CoverageFov | null => {
  const presetIdFromPlacement =
    typeof placement?.coveragePresetId === 'string' &&
    placement.coveragePresetId.trim()
      ? placement.coveragePresetId.trim()
      : undefined;
  const overrideH = placement?.horizontalFovDeg;
  const overrideV = placement?.verticalFovDeg;
  if (
    (presetIdFromPlacement === 'custom' ||
      (!presetIdFromPlacement &&
        Number.isFinite(overrideH) &&
        Number.isFinite(overrideV))) &&
    Number.isFinite(overrideH) &&
    Number.isFinite(overrideV)
  ) {
    const maxRangeMeters = profile?.limits?.maxRangeMeters;
    return {
      horizontalFovDeg: Number(overrideH),
      verticalFovDeg: Number(overrideV),
      maxRangeMeters: Number.isFinite(maxRangeMeters)
        ? Number(maxRangeMeters)
        : 6,
      presetId: 'custom',
      source: 'override',
    };
  }

  const presets = profile?.coverage?.presets;
  if (!presets || Object.keys(presets).length === 0) return null;

  const defaultId = profile?.coverage?.defaultPresetId;
  const presetId =
    presetIdFromPlacement &&
    presetIdFromPlacement !== 'custom' &&
    presets[presetIdFromPlacement]
      ? presetIdFromPlacement
      : defaultId && presets[defaultId]
        ? defaultId
        : Object.keys(presets)[0];
  const preset = presets[presetId];
  if (!preset) return null;

  return {
    horizontalFovDeg: preset.horizontalFovDeg,
    verticalFovDeg: preset.verticalFovDeg,
    maxRangeMeters: preset.maxRangeMeters,
    presetId,
    label: preset.label,
    source: 'preset',
  };
};

export const resolveTrackingCoverageFov = (
  profile: DeviceProfile | null | undefined,
): CoverageFov | null => {
  const presets = profile?.coverage?.presets;
  if (!presets || Object.keys(presets).length === 0) return null;

  const defaultId = profile?.coverage?.defaultPresetId;
  const presetId =
    defaultId && presets[defaultId] ? defaultId : Object.keys(presets)[0];
  const preset = presets[presetId];
  if (!preset) return null;

  return {
    horizontalFovDeg: preset.horizontalFovDeg,
    verticalFovDeg: preset.verticalFovDeg,
    maxRangeMeters: preset.maxRangeMeters,
    presetId,
    label: preset.label,
    source: 'preset',
  };
};

export interface CanvasCoverage {
  fovDeg: number;
  rangeMm: number;
  rotationDeg: number;
}

export type SensorCoverageConfig = Partial<{
  installationAngle: number;
  maxDistance: number;
  mmwaveDistanceMax: number;
}>;

type Point = { x: number; y: number };

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export const resolveCanvasCoverage = (
  profile: DeviceProfile | null | undefined,
  placement: DevicePlacement | null | undefined,
  sensorConfig: SensorCoverageConfig = {},
  fallback: { fovDeg?: number; maxRangeMeters?: number } = {},
): CanvasCoverage => {
  const fov = profile ? resolveCoverageFov(profile, placement) : null;
  const fovDeg =
    fov?.horizontalFovDeg ??
    profile?.limits?.fieldOfViewDegrees ??
    (finite(fallback.fovDeg) ? fallback.fovDeg : 120);
  const baseRangeMm =
    (fov?.maxRangeMeters ??
      profile?.limits?.maxRangeMeters ??
      (finite(fallback.maxRangeMeters) ? fallback.maxRangeMeters : 6)) * 1000;
  const configCm = [
    sensorConfig.maxDistance,
    sensorConfig.mmwaveDistanceMax,
  ].find((v) => finite(v) && v > 0);
  return {
    fovDeg,
    rangeMm:
      configCm === undefined
        ? baseRangeMm
        : Math.min(baseRangeMm, configCm * 10),
    rotationDeg:
      (finite(placement?.rotationDeg) ? placement.rotationDeg : 0) +
      (finite(sensorConfig.installationAngle)
        ? sensorConfig.installationAngle
        : 0),
  };
};

export const segmentIntersection = (
  p1: Point,
  p2: Point,
  p3: Point,
  p4: Point,
): Point | null => {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 1e-10) return null;
  const t =
    ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
  const u =
    -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
};

// Rotation 0 points down the plan (+Y), matching deviceToRoom.
export const coverageHeadingRad = (rotationDeg: number) =>
  ((rotationDeg + 90) * Math.PI) / 180;

export const conePolygon = (
  origin: Point,
  coverage: CanvasCoverage,
  opts: { steps?: number; clipTo?: Point[] } = {},
): Point[] => {
  const { fovDeg, rangeMm } = coverage;
  const steps = Math.max(1, opts.steps ?? 32);
  const start =
    coverageHeadingRad(coverage.rotationDeg) - (fovDeg * Math.PI) / 360;
  const walls = opts.clipTo && opts.clipTo.length >= 3 ? opts.clipTo : null;
  const points: Point[] = [origin];
  for (let i = 0; i <= steps; i++) {
    const angle = start + (i / steps) * ((fovDeg * Math.PI) / 180);
    let end = {
      x: origin.x + Math.cos(angle) * rangeMm,
      y: origin.y + Math.sin(angle) * rangeMm,
    };
    if (walls) {
      let nearest = Infinity;
      const rayEnd = end;
      walls.forEach((wallStart, j) => {
        const hit = segmentIntersection(
          origin,
          rayEnd,
          wallStart,
          walls[(j + 1) % walls.length],
        );
        if (!hit) return;
        const dist = Math.hypot(hit.x - origin.x, hit.y - origin.y);
        if (dist > 10 && dist < nearest) {
          nearest = dist;
          end = hit;
        }
      });
    }
    points.push(end);
  }
  return points;
};
