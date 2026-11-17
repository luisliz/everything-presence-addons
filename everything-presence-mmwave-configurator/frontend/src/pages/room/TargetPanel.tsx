import type { ZonePolygon, ZoneRect } from '../../api/types';
import { Panel } from '../../components/primitives';
import type { RoomFrame } from './types';
import type { LiveRoom } from './useLiveRoom';

type Point = { x: number; y: number };

export const TARGET_SWATCH = ['bg-target-1', 'bg-target-2', 'bg-target-3'];
export const targetSwatch = (id: number) =>
  TARGET_SWATCH[(id - 1) % TARGET_SWATCH.length];

const inPolygon = (p: Point, vertices: Point[]) => {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i];
    const b = vertices[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
};

const inZone = (p: Point, zone: ZoneRect | ZonePolygon) =>
  'vertices' in zone
    ? inPolygon(p, zone.vertices)
    : p.x >= Math.min(zone.x, zone.x + zone.width) &&
      p.x <= Math.max(zone.x, zone.x + zone.width) &&
      p.y >= Math.min(zone.y, zone.y + zone.height) &&
      p.y <= Math.max(zone.y, zone.y + zone.height);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm">
    <dt className="text-fg-muted">{label}</dt>
    <dd className="tabular-nums text-fg">{value}</dd>
  </div>
);

const metres = (mm: number | null | undefined) =>
  typeof mm === 'number' ? `${(mm / 1000).toFixed(2)} m` : 'n/a';

export interface TargetPanelProps {
  frame: RoomFrame;
  live: LiveRoom;
  targetId: number;
}

export const TargetPanel = ({ frame, live, targetId }: TargetPanelProps) => {
  const raw = frame.liveState?.targets?.find((t) => t.id === targetId);
  const position = frame.targetPositions.find((t) => t.id === targetId);
  if (!raw || !position || raw.x === null || raw.y === null)
    return (
      <p className="pt-2 text-sm text-fg-muted">
        Target {targetId} is not detected right now.
      </p>
    );
  const devicePoint = { x: raw.x, y: raw.y };
  const zones: Array<ZoneRect | ZonePolygon> = live.polygonMode
    ? live.displayPolygonZones
    : live.rectZones;
  const zone = zones.find(
    (z) =>
      z.enabled !== false && z.type !== 'exclusion' && inZone(devicePoint, z),
  );
  const zoneLabel =
    zone && (live.zones.find((z) => z.id === zone.id)?.label ?? zone.id);
  return (
    <Panel variant="section" className="border-t-0">
      <dl className="divide-y divide-line">
        <Row
          label="Zone"
          value={zoneLabel ? `In ${zoneLabel}` : 'Not in a zone'}
        />
        <Row
          label="Distance"
          value={metres(raw.distance ?? Math.hypot(raw.x, raw.y))}
        />
        <Row
          label="Speed"
          value={
            typeof raw.speed === 'number'
              ? `${raw.speed.toFixed(2)} m/s`
              : 'n/a'
          }
        />
        <Row
          label="Angle"
          value={
            typeof raw.angle === 'number' ? `${raw.angle.toFixed(0)}°` : 'n/a'
          }
        />
        <Row
          label="Position in room"
          value={`X ${metres(position.x)}, Y ${metres(position.y)}`}
        />
        {typeof raw.resolution === 'number' && (
          <Row label="Resolution" value={`${raw.resolution.toFixed(0)} mm`} />
        )}
      </dl>
    </Panel>
  );
};
