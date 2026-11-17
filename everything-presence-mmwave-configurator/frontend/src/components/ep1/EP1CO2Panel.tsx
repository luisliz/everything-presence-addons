import { mdiMoleculeCo2 } from '@mdi/js';
import { Badge, Icon } from '../primitives';
import { getCO2Level, TONE_BAR } from './ep1Utils';

interface EP1CO2PanelProps {
  co2: number | null;
  entityUnits?: Record<string, string>;
}

export const EP1CO2Panel = ({ co2, entityUnits }: EP1CO2PanelProps) => {
  if (co2 === null) return null;

  const level = getCO2Level(co2);
  const co2Unit = entityUnits?.co2 || 'ppm';
  const gaugePercent = Math.min(100, (co2 / 3000) * 100);

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon path={mdiMoleculeCo2} size={20} className="text-fg-muted" />
        <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          CO2
        </div>
      </div>

      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-fg">{Math.round(co2)}</span>
        <span className="text-sm text-fg-muted">{co2Unit}</span>
      </div>

      <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${TONE_BAR[level.tone]}`}
          style={{ width: `${gaugePercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <Badge tone={level.tone}>{level.label}</Badge>
        <span className="text-xs text-fg-subtle">{level.description}</span>
      </div>
    </div>
  );
};
