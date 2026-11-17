import { Icon, Panel } from '../primitives';
import {
  calculateDewPoint,
  calculateHeatIndex,
  getComfortLevel,
  TONE_INK,
} from './ep1Utils';

interface EP1ComfortPanelProps {
  temperature: number | null;
  humidity: number | null;
  entityUnits?: Record<string, string>;
}

export const EP1ComfortPanel = ({
  temperature,
  humidity,
  entityUnits,
}: EP1ComfortPanelProps) => {
  const tempUnit = entityUnits?.temperature || '°C';
  if (temperature === null || humidity === null) {
    return (
      <Panel variant="section" title="Comfort index">
        <div className="text-xs text-fg-subtle">Waiting for sensor data…</div>
      </Panel>
    );
  }

  const comfort = getComfortLevel(temperature, humidity);
  const dewPoint = calculateDewPoint(temperature, humidity);
  const heatIndex = calculateHeatIndex(temperature, humidity);

  return (
    <Panel variant="section" title="Comfort index">
      <div className="mb-3 flex items-center gap-2">
        <Icon
          path={comfort.icon}
          size={24}
          className={TONE_INK[comfort.tone]}
        />
        <div className="text-xl font-bold text-fg">{comfort.label}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 text-xs text-fg-subtle">Dew point</div>
          <div className="font-medium text-fg">
            {dewPoint}
            {tempUnit}
          </div>
        </div>
        <div className="rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 text-xs text-fg-subtle">Feels like</div>
          <div className="font-medium text-fg">
            {heatIndex !== null
              ? `${heatIndex}${tempUnit}`
              : `${temperature}${tempUnit}`}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 text-xs text-fg-subtle">Temperature zone</div>
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
          <div className="absolute inset-0 flex">
            <div className="flex-1 bg-accent/30" />
            <div className="flex-1 bg-accent/40" />
            <div className="flex-1 bg-success/40" />
            <div className="flex-1 bg-warning/40" />
            <div className="flex-1 bg-danger/40" />
          </div>
          <div
            className="absolute top-0 h-full w-1 rounded-full bg-fg shadow-e1 transition-all duration-300"
            style={{
              left: `${Math.max(0, Math.min(100, ((temperature - 14) / 16) * 100))}%`,
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
          <span>{tempUnit === '°F' ? '57°F' : '14°C'}</span>
          <span>{tempUnit === '°F' ? '86°F' : '30°C'}</span>
        </div>
      </div>

      <div className="mt-2">
        <div className="mb-2 text-xs text-fg-subtle">Humidity zone</div>
        <div className="relative h-3 overflow-hidden rounded-full bg-surface-3">
          <div className="absolute inset-0 flex">
            <div className="w-[30%] bg-warning/40" />
            <div className="w-[10%] bg-accent/30" />
            <div className="w-[20%] bg-success/40" />
            <div className="w-[10%] bg-accent/30" />
            <div className="w-[30%] bg-accent/40" />
          </div>
          <div
            className="absolute top-0 h-full w-1 rounded-full bg-fg shadow-e1 transition-all duration-300"
            style={{ left: `${Math.max(0, Math.min(100, humidity))}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
          <span>0%</span>
          <span>100%</span>
        </div>
      </div>
    </Panel>
  );
};
