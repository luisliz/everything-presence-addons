import { mdiAccountOutline, mdiRuler, mdiThermometer } from '@mdi/js';
import { useEffect, useRef, useState } from 'react';
import { Icon, Panel } from '../primitives';

interface DataPoint {
  value: number;
  timestamp: number;
}

interface EP1MiniChartsProps {
  temperature: number | null;
  presence: boolean;
  distance: number | null;
  maxPoints?: number;
  entityUnits?: Record<string, string>;
}

const Sparkline = ({
  data,
  colorVar,
  height = 32,
  showArea = true,
}: {
  data: number[];
  colorVar: string;
  height?: number;
  showArea?: boolean;
}) => {
  if (data.length < 2) {
    return (
      <div className="flex h-8 items-center justify-center text-[10px] text-fg-subtle">
        Collecting data…
      </div>
    );
  }

  const width = 200;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * (width - padding * 2);
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${padding},${height - padding} L ${pathD.slice(2)} L ${width - padding},${height - padding} Z`;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Trend sparkline"
    >
      {showArea && <path d={areaD} className={colorVar} fillOpacity="0.15" />}
      <path
        d={pathD}
        fill="none"
        className={colorVar}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width - padding}
        cy={
          height -
          padding -
          ((data[data.length - 1] - min) / range) * (height - padding * 2)
        }
        r="3"
        className={colorVar}
        fill="currentColor"
      />
    </svg>
  );
};

const PresenceTimeline = ({
  data,
  height = 24,
}: {
  data: { id: number; present: boolean }[];
  height?: number;
}) => {
  if (data.length < 2) {
    return (
      <div className="flex h-6 items-center justify-center text-[10px] text-fg-subtle">
        Collecting data…
      </div>
    );
  }

  const width = 200;
  const blockWidth = width / data.length;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Presence timeline"
    >
      {data.map(({ id, present }, index) => (
        <rect
          key={id}
          x={index * blockWidth}
          y={2}
          width={blockWidth}
          height={height - 4}
          className={present ? 'fill-success' : 'fill-surface-3'}
          rx={1}
        />
      ))}
    </svg>
  );
};

export const EP1MiniCharts = ({
  temperature,
  presence,
  distance,
  maxPoints = 60,
  entityUnits,
}: EP1MiniChartsProps) => {
  const tempUnit = entityUnits?.temperature || '°C';

  const tempHistory = useRef<DataPoint[]>([]);
  const presenceHistory = useRef<{ id: number; present: boolean }[]>([]);
  const presenceId = useRef(0);
  const distanceHistory = useRef<DataPoint[]>([]);
  const lastUpdate = useRef<number>(0);

  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdate.current < 1000) return;
    lastUpdate.current = now;

    if (temperature !== null) {
      tempHistory.current.push({ value: temperature, timestamp: now });
      if (tempHistory.current.length > maxPoints) tempHistory.current.shift();
    }

    presenceHistory.current.push({
      id: presenceId.current++,
      present: presence,
    });
    if (presenceHistory.current.length > maxPoints)
      presenceHistory.current.shift();

    if (distance !== null && distance > 0) {
      distanceHistory.current.push({ value: distance, timestamp: now });
      if (distanceHistory.current.length > maxPoints)
        distanceHistory.current.shift();
    }

    forceUpdate((n) => n + 1);
  }, [temperature, presence, distance, maxPoints]);

  const tempValues = tempHistory.current.map((p) => p.value);
  const distanceValues = distanceHistory.current.map((p) => p.value);

  const tempMin =
    tempValues.length > 0 ? Math.min(...tempValues).toFixed(1) : '--';
  const tempMax =
    tempValues.length > 0 ? Math.max(...tempValues).toFixed(1) : '--';
  const distMin =
    distanceValues.length > 0 ? Math.min(...distanceValues).toFixed(2) : '--';
  const distMax =
    distanceValues.length > 0 ? Math.max(...distanceValues).toFixed(2) : '--';

  return (
    <Panel
      variant="section"
      title="Recent trends"
      collapsible
      defaultOpen
      actions={
        <span className="text-[10px] font-normal text-fg-subtle">
          Last {maxPoints}s
        </span>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon path={mdiThermometer} size={16} className="text-fg-muted" />
              <span className="text-xs text-fg-muted">Temperature</span>
            </div>
            <div className="text-[10px] text-fg-subtle">
              {tempMin}° - {tempMax}
              {tempUnit}
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 p-2">
            <Sparkline data={tempValues} colorVar="text-warning" height={32} />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon
                path={mdiAccountOutline}
                size={16}
                className="text-fg-muted"
              />
              <span className="text-xs text-fg-muted">Presence</span>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-success" />
                <span className="text-fg-subtle">Present</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-surface-3" />
                <span className="text-fg-subtle">Clear</span>
              </span>
            </div>
          </div>
          <div className="rounded-lg bg-surface-2 p-2">
            <PresenceTimeline data={presenceHistory.current} height={24} />
          </div>
        </div>

        {distanceValues.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Icon path={mdiRuler} size={16} className="text-fg-muted" />
                <span className="text-xs text-fg-muted">Distance</span>
              </div>
              <div className="text-[10px] text-fg-subtle">
                {distMin} - {distMax}m
              </div>
            </div>
            <div className="rounded-lg bg-surface-2 p-2">
              <Sparkline
                data={distanceValues}
                colorVar="text-accent"
                height={32}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-line pt-2 text-center text-[10px] text-fg-subtle">
        {tempHistory.current.length} temperature samples •{' '}
        {presenceHistory.current.length} presence samples
      </div>
    </Panel>
  );
};
