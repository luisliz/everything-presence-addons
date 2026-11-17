import { mdiFire } from '@mdi/js';
import type { HeatmapResponse } from '../api/types';
import { HeatmapLegend } from './HeatmapLegend';
import { Icon } from './primitives';

interface ZoneStatsPanelProps {
  data: HeatmapResponse | null;
  visible: boolean;
}

export const ZoneStatsPanel = ({ data, visible }: ZoneStatsPanelProps) => {
  if (!visible || !data?.zoneStats || data.zoneStats.length === 0) {
    return null;
  }

  const { zoneStats, stats } = data;
  const sortedStats = [...zoneStats].sort(
    (a, b) => b.percentage - a.percentage,
  );

  const formatTimeRange = () => {
    const start = new Date(stats.timeRange.start);
    const end = new Date(stats.timeRange.end);
    const hours = Math.round(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60),
    );

    if (hours < 24) return `Last ${hours} hour${hours !== 1 ? 's' : ''}`;
    const days = Math.round(hours / 24);
    return `Last ${days} day${days !== 1 ? 's' : ''}`;
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-fg-muted">
          <Icon path={mdiFire} size={16} />
          <span>Zone occupancy</span>
        </div>
        <span className="text-xs text-fg-subtle">{formatTimeRange()}</span>
      </div>

      <div className="mb-3 flex justify-center">
        <HeatmapLegend visible />
      </div>

      {!stats.dataAvailable ? (
        <div className="py-2 text-center text-xs text-fg-subtle">
          No history data available
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            {sortedStats.map((stat, idx) => {
              const isNoZone = stat.zoneId === '__no_zone__';
              const barClass = isNoZone
                ? 'bg-fg-subtle'
                : stat.percentage > 50
                  ? 'bg-danger'
                  : stat.percentage > 25
                    ? 'bg-warning'
                    : 'bg-accent';

              return (
                <div key={`${stat.zoneId}-${idx}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span
                      className={`max-w-[120px] truncate ${isNoZone ? 'italic text-fg-subtle' : 'text-fg-muted'}`}
                    >
                      {stat.zoneName}
                    </span>
                    <span className="font-mono text-fg-subtle">
                      {stat.percentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                      style={{ width: `${Math.min(100, stat.percentage)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[10px] text-fg-subtle">
            <span>{stats.totalSamples.toLocaleString()} samples</span>
            <span>Peak: {stats.maxCount.toLocaleString()}</span>
          </div>
        </>
      )}
    </div>
  );
};
