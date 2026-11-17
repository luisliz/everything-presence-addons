import { mdiRestart } from '@mdi/js';
import { useEffect, useRef, useState } from 'react';
import { IconButton, Panel } from '../primitives';
import {
  createEmptyStats,
  type DailyStats,
  getStatsKey,
  getTodayDateString,
} from './ep1Utils';

interface EP1StatsPanelProps {
  deviceId: string;
  presence: boolean;
  temperature: number | null;
  entityUnits?: Record<string, string>;
}

export const EP1StatsPanel = ({
  deviceId,
  presence,
  temperature,
  entityUnits,
}: EP1StatsPanelProps) => {
  const tempUnit = entityUnits?.temperature || '°C';
  const [stats, setStats] = useState<DailyStats | null>(null);
  const lastUpdateTime = useRef<number>(Date.now());
  const wasPresent = useRef<boolean>(presence);

  useEffect(() => {
    const today = getTodayDateString();
    const key = getStatsKey(deviceId, today);
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DailyStats;
        setStats(
          parsed.date === today ? parsed : createEmptyStats(deviceId, today),
        );
      } catch {
        setStats(createEmptyStats(deviceId, today));
      }
    } else {
      setStats(createEmptyStats(deviceId, today));
    }
  }, [deviceId]);

  useEffect(() => {
    if (!stats) return;

    const now = Date.now();
    const elapsed = (now - lastUpdateTime.current) / 1000;
    if (elapsed < 1) return;

    const today = getTodayDateString();

    if (stats.date !== today) {
      const newStats = createEmptyStats(deviceId, today);
      setStats(newStats);
      localStorage.setItem(
        getStatsKey(deviceId, today),
        JSON.stringify(newStats),
      );
      lastUpdateTime.current = now;
      return;
    }

    const newStats = { ...stats };
    newStats.totalSeconds += elapsed;

    if (presence) newStats.occupancySeconds += elapsed;

    if (presence !== wasPresent.current) {
      if (presence) newStats.detectionEvents += 1;
      wasPresent.current = presence;
    }

    if (temperature !== null) {
      newStats.tempSum += temperature;
      newStats.tempCount += 1;
      if (newStats.tempMin === null || temperature < newStats.tempMin)
        newStats.tempMin = temperature;
      if (newStats.tempMax === null || temperature > newStats.tempMax)
        newStats.tempMax = temperature;
    }

    newStats.lastUpdate = now;
    lastUpdateTime.current = now;

    setStats(newStats);

    if (Math.floor(newStats.totalSeconds) % 10 === 0) {
      localStorage.setItem(
        getStatsKey(deviceId, today),
        JSON.stringify(newStats),
      );
    }
  }, [deviceId, presence, temperature, stats]);

  useEffect(() => {
    return () => {
      if (stats)
        localStorage.setItem(
          getStatsKey(deviceId, stats.date),
          JSON.stringify(stats),
        );
    };
  }, [deviceId, stats]);

  const reset = () => {
    const today = getTodayDateString();
    const newStats = createEmptyStats(deviceId, today);
    setStats(newStats);
    localStorage.setItem(
      getStatsKey(deviceId, today),
      JSON.stringify(newStats),
    );
  };

  if (!stats) {
    return (
      <Panel variant="section" title="Today's statistics">
        <div className="text-xs text-fg-subtle">Loading stats…</div>
      </Panel>
    );
  }

  const occupancyPercent =
    stats.totalSeconds > 0
      ? Math.round((stats.occupancySeconds / stats.totalSeconds) * 100)
      : 0;
  const avgTemp =
    stats.tempCount > 0 ? (stats.tempSum / stats.tempCount).toFixed(1) : '--';
  const trackingDuration = formatTrackingDuration(stats.totalSeconds);

  return (
    <Panel
      variant="section"
      title="Today's statistics"
      collapsible
      defaultOpen
      actions={
        <IconButton
          icon={mdiRestart}
          label="Reset today's stats"
          size="sm"
          onClick={reset}
        />
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface-2 p-3">
          <div className="mb-1 text-[10px] text-fg-subtle">Occupancy</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-success-ink">
              {occupancyPercent}
            </span>
            <span className="text-sm text-fg-subtle">%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-success transition-all duration-500"
              style={{ width: `${occupancyPercent}%` }}
            />
          </div>
        </div>

        <div className="rounded-lg bg-surface-2 p-3">
          <div className="mb-1 text-[10px] text-fg-subtle">
            Detection events
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-accent-ink">
              {stats.detectionEvents}
            </span>
            <span className="text-xs text-fg-subtle">times</span>
          </div>
          <div className="mt-2 text-[10px] text-fg-subtle">
            Presence triggered today
          </div>
        </div>

        <div className="rounded-lg bg-surface-2 p-3">
          <div className="mb-1 text-[10px] text-fg-subtle">Avg temperature</div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-warning-ink">
              {avgTemp}
            </span>
            <span className="text-sm text-fg-subtle">{tempUnit}</span>
          </div>
          <div className="mt-2 text-[10px] text-fg-subtle">
            {stats.tempMin !== null && stats.tempMax !== null
              ? `${stats.tempMin.toFixed(1)}° - ${stats.tempMax.toFixed(1)}${tempUnit}`
              : 'Min - Max'}
          </div>
        </div>

        <div className="rounded-lg bg-surface-2 p-3">
          <div className="mb-1 text-[10px] text-fg-subtle">Tracking time</div>
          <div className="text-lg font-bold text-fg">{trackingDuration}</div>
          <div className="mt-2 text-[10px] text-fg-subtle">
            Since page loaded
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-2 text-center text-[10px] text-fg-subtle">
        Stats for {new Date().toLocaleDateString()} • Stored locally
      </div>
    </Panel>
  );
};

function formatTrackingDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
