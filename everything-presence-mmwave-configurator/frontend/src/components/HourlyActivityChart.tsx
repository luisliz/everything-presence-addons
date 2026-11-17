import { mdiChartBar, mdiTriangleSmallDown, mdiTriangleSmallUp } from '@mdi/js';
import { useMemo } from 'react';
import type { HourlyBreakdown } from '../api/types';
import { Icon, Tooltip } from './primitives';

interface HourlyActivityChartProps {
  data: HourlyBreakdown[] | undefined;
  visible: boolean;
}

const formatHour = (hour: number): string => {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
};

const barClass = (t: number): string => {
  if (t < 0.33) return 'bg-success';
  if (t < 0.66) return 'bg-warning';
  return 'bg-danger';
};

export const HourlyActivityChart = ({
  data,
  visible,
}: HourlyActivityChartProps) => {
  const maxPercentage = useMemo(
    () => Math.max(...(data ?? []).map((d) => d.percentage), 1),
    [data],
  );

  if (!visible || !data || data.length === 0) return null;

  const sortedByActivity = [...data].sort(
    (a, b) => b.percentage - a.percentage,
  );
  const peakHour = sortedByActivity[0];
  const quietHour = sortedByActivity[sortedByActivity.length - 1];

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Icon path={mdiChartBar} size={16} />
        <span>Hourly activity</span>
      </div>

      <div className="mb-2 flex h-20 items-end justify-between gap-0.5">
        {data.map((hourData) => {
          const height =
            maxPercentage > 0 ? (hourData.percentage / maxPercentage) * 100 : 0;
          const isPeak =
            hourData.hour === peakHour.hour && hourData.percentage > 0;

          return (
            <Tooltip
              key={hourData.hour}
              content={
                <div>
                  <div className="font-semibold">
                    {formatHour(hourData.hour)}
                  </div>
                  <div>{hourData.percentage.toFixed(1)}%</div>
                  <div className="text-fg-subtle">
                    {hourData.count.toLocaleString()} samples
                  </div>
                </div>
              }
            >
              <div className="flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className={`w-full rounded-t transition-all duration-300 ${barClass(hourData.percentage / maxPercentage)} ${isPeak ? 'ring-1 ring-fg/40' : ''}`}
                  style={{
                    height: `${Math.max(height, 2)}%`,
                    minHeight: hourData.count > 0 ? '2px' : '0',
                  }}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>

      <div className="flex justify-between px-0.5 text-[9px] text-fg-subtle">
        {[0, 3, 6, 9, 12, 15, 18, 21].map((hour) => (
          <span key={hour} className="w-6 text-center">
            {formatHour(hour)}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[10px]">
        <div className="flex items-center gap-1 text-fg-muted">
          <Icon
            path={mdiTriangleSmallUp}
            size={16}
            className="text-warning-ink"
          />
          Peak: {formatHour(peakHour.hour)} ({peakHour.percentage.toFixed(1)}%)
        </div>
        <div className="flex items-center gap-1 text-fg-muted">
          <Icon
            path={mdiTriangleSmallDown}
            size={16}
            className="text-accent-ink"
          />
          Quiet: {formatHour(quietHour.hour)} ({quietHour.percentage.toFixed(1)}
          %)
        </div>
      </div>
    </div>
  );
};
