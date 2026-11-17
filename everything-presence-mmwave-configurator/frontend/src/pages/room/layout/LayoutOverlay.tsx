import type {
  DevicePlacement,
  DeviceProfile,
  LiveState,
  RoomConfig,
} from '../../../api/types';
import type { RoomCanvasOverlayContext } from '../../../components/RoomCanvas';
import {
  getCeilingSliceLineDepth,
  getCeilingSlicePosition,
  normalizeCeilingSliceConfig,
} from '../../../utils/ceilingSlices';
import type { CoverageFov } from '../../../utils/coverage';
import type { TargetPosition } from '../types';

const TARGET_FILL = ['fill-target-1', 'fill-target-2', 'fill-target-3'];
const TARGET_TINT = [
  'fill-target-1/20',
  'fill-target-2/20',
  'fill-target-3/20',
];
const TARGET_STROKE = ['stroke-target-1', 'stroke-target-2', 'stroke-target-3'];
const tone = (list: string[], id: number) => list[(id - 1) % list.length];

export type HeightCoverage = {
  enabled: boolean;
  heightMm: number;
  pitchDeg: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  maxRangeMeters?: number;
};

export const heightCoverageFor = (
  placement: DevicePlacement | undefined,
  fov: CoverageFov | null,
): HeightCoverage | undefined => {
  if (
    placement?.mountType !== 'ceiling' ||
    !fov ||
    !Number.isFinite(placement.heightMm)
  )
    return undefined;
  return {
    enabled: true,
    heightMm: Number(placement.heightMm),
    pitchDeg: Number.isFinite(placement.pitchDeg)
      ? Number(placement.pitchDeg)
      : 90,
    horizontalFovDeg: fov.horizontalFovDeg,
    verticalFovDeg: fov.verticalFovDeg,
    maxRangeMeters: fov.maxRangeMeters,
  };
};

export interface LayoutOverlayProps {
  ctx: RoomCanvasOverlayContext;
  room: RoomConfig;
  profile: DeviceProfile | null;
  liveState: LiveState | null;
  targets: TargetPosition[];
  showTargets: boolean;
  targetScale: number;
  heightCoverage?: HeightCoverage;
  deviceSelected: boolean;
}

/** Live targets and the device selection ring over the Layout canvas; the root carries the resolved cone for checks. */
export const LayoutOverlay = ({
  ctx,
  room,
  profile,
  liveState,
  targets,
  showTargets,
  targetScale,
  heightCoverage,
  deviceSelected,
}: LayoutOverlayProps) => {
  const px = ctx.pxToSvg;
  const placement = room.devicePlacement;
  const toRoom = (x: number, y: number) => {
    if (!placement) return { x, y };
    const rad = (ctx.coverage.rotationDeg * Math.PI) / 180;
    return {
      x: x * Math.cos(rad) - y * Math.sin(rad) + placement.x,
      y: x * Math.sin(rad) + y * Math.cos(rad) + placement.y,
    };
  };
  const ceilingSlices =
    profile?.id === 'everything_presence_pro' &&
    placement?.mountType === 'ceiling';
  const maxRangeMm = (profile?.limits?.maxRangeMeters ?? 6) * 1000;
  const sliceConfig = normalizeCeilingSliceConfig(
    room.metadata?.ceilingSliceConfig,
    maxRangeMm,
    true,
  );

  const sliceTargets = () =>
    (liveState?.targets ?? []).map((target) => {
      if (target.x === null || target.y === null) return null;
      if (target.x === 0 && target.y === 0 && target.active !== true)
        return null;
      const lateral = getCeilingSlicePosition(target, sliceConfig);
      if (lateral === null) return null;
      const depth = getCeilingSliceLineDepth(
        lateral,
        sliceConfig,
        heightCoverage ?? null,
        maxRangeMm,
      );
      if (!depth) return null;
      const along = sliceConfig.axis === 'x';
      const [a, b] = (
        along
          ? [toRoom(lateral, depth.min), toRoom(lateral, depth.max)]
          : [toRoom(depth.min, lateral), toRoom(depth.max, lateral)]
      ).map(ctx.toCanvas);
      const mid = ctx.toCanvas(
        toRoom(along ? lateral : 0, along ? 0 : lateral),
      );
      return (
        <g key={target.id} className={tone(TARGET_STROKE, target.id)}>
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className="stroke-cv-halo"
            strokeWidth={6 * px}
            strokeLinecap="round"
          />
          <line
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            strokeWidth={3 * px}
            strokeLinecap="round"
            strokeDasharray={`${8 * px} ${6 * px}`}
          />
          <circle
            cx={mid.x}
            cy={mid.y}
            r={7 * px}
            className={`${tone(TARGET_FILL, target.id)} stroke-cv-halo`}
            strokeWidth={2 * px}
          />
        </g>
      );
    });

  const device = placement ? ctx.toCanvas(placement) : null;
  return (
    <g
      data-coverage-rotation={ctx.coverage.rotationDeg}
      data-coverage-range={ctx.coverage.rangeMm}
    >
      {showTargets && (
        <g data-layer="targets" style={{ pointerEvents: 'none' }}>
          {ceilingSlices
            ? sliceTargets()
            : targets.map((target) => {
                const p = ctx.toCanvas(target);
                return (
                  <g key={target.id}>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={18 * px * targetScale}
                      className={`${tone(TARGET_TINT, target.id)} ${tone(TARGET_STROKE, target.id)}`}
                      strokeWidth={1.5 * px}
                    />
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={7 * px * targetScale}
                      className={`${tone(TARGET_FILL, target.id)} stroke-cv-halo`}
                      strokeWidth={2 * px}
                    />
                    <text
                      x={p.x}
                      y={p.y - 24 * px * targetScale}
                      textAnchor="middle"
                      fontSize={11 * px * targetScale}
                      fontWeight={700}
                      className="fill-fg stroke-cv-halo"
                      strokeWidth={3 * px}
                      paintOrder="stroke"
                    >
                      T{target.id}
                    </text>
                  </g>
                );
              })}
        </g>
      )}
      {deviceSelected && device && (
        <circle
          data-device-selected=""
          cx={device.x}
          cy={device.y}
          r={24 * px}
          className="fill-none stroke-accent"
          strokeWidth={2 * px}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  );
};
