import { mdiFloorPlan } from '@mdi/js';
import type { Point, RoomConfig } from '../../api/types';
import { cx, Icon } from '../../components/primitives';
import { deviceToRoom, rectCorners } from '../../utils/zoneDrawing';

export interface RoomThumbnailProps {
  room: Pick<RoomConfig, 'roomShell' | 'zones' | 'devicePlacement'>;
  dimmed?: boolean;
  className?: string;
}

const ZONE_CLASS = {
  regular: 'fill-zone-regular/25 stroke-zone-regular',
  exclusion: 'fill-zone-exclusion/25 stroke-zone-exclusion',
  entry: 'fill-zone-entry/25 stroke-zone-entry',
};

const toPath = (points: Point[]) =>
  `${points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')}Z`;

/** Room outline, zones and device in room coordinates (mm), y down as on the canvas. */
export const RoomThumbnail = ({
  room,
  dimmed = false,
  className,
}: RoomThumbnailProps) => {
  const placement = room.devicePlacement;
  const frame = placement
    ? {
        x: placement.x,
        y: placement.y,
        rotationDeg: placement.rotationDeg ?? 0,
      }
    : null;
  const outline = room.roomShell?.points ?? [];
  const zones = (room.zones ?? [])
    .filter((zone) => zone.enabled !== false)
    .map((zone) => ({
      id: zone.id,
      type: zone.type,
      points: rectCorners(zone).map((p) => deviceToRoom(p, frame)),
    }));
  const all = [
    ...outline,
    ...zones.flatMap((zone) => zone.points),
    ...(frame ? [frame] : []),
  ];

  const box = cx(
    'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-cv-bg',
    dimmed && 'opacity-50 grayscale',
    className,
  );
  if (all.length < 2)
    return (
      <div className={box}>
        <Icon path={mdiFloorPlan} size={24} className="text-fg-subtle" />
      </div>
    );

  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const pad = span * 0.08;
  const stroke = span / 60;
  const viewBox = `${minX - pad} ${minY - pad} ${Math.max(...xs) - minX + pad * 2} ${Math.max(...ys) - minY + pad * 2}`;
  const heading = frame ? deviceToRoom({ x: 0, y: span * 0.12 }, frame) : null;

  return (
    <div className={box} aria-hidden="true">
      <svg
        aria-hidden="true"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
      >
        {outline.length > 2 && (
          <path
            d={toPath(outline)}
            strokeWidth={stroke}
            strokeLinejoin="round"
            className="fill-cv-room stroke-cv-wall"
          />
        )}
        {zones.map((zone) => (
          <path
            key={zone.id}
            d={toPath(zone.points)}
            strokeWidth={stroke * 0.6}
            className={ZONE_CLASS[zone.type]}
          />
        ))}
        {frame && heading && (
          <>
            <line
              x1={frame.x}
              y1={frame.y}
              x2={heading.x}
              y2={heading.y}
              strokeWidth={stroke}
              strokeLinecap="round"
              className="stroke-accent"
            />
            <circle
              cx={frame.x}
              cy={frame.y}
              r={stroke * 1.8}
              className="fill-accent"
            />
          </>
        )}
      </svg>
    </div>
  );
};
