import {
  mdiLightbulbOutline,
  mdiMoleculeCo2,
  mdiThermometer,
  mdiWaterPercent,
} from '@mdi/js';
import type { EP1EnvironmentalData } from '../api/types';
import { getLightLevel, TONE_INK } from './ep1/ep1Utils';
import { Icon } from './primitives';

interface EP1EnvironmentalPanelProps {
  environmental: EP1EnvironmentalData;
  co2?: number | null;
  entityUnits?: Record<string, string>;
}

export const EP1EnvironmentalPanel = ({
  environmental,
  co2,
  entityUnits,
}: EP1EnvironmentalPanelProps) => {
  const { temperature, humidity, illuminance } = environmental;

  const tempUnit = entityUnits?.temperature || '°C';
  const humidityUnit = entityUnits?.humidity || '%';
  const illuminanceUnit = entityUnits?.illuminance || 'lx';
  const co2Unit = entityUnits?.co2 || 'ppm';

  const tempDisplay =
    temperature !== null ? `${temperature.toFixed(1)}${tempUnit}` : '--';
  const humidityDisplay =
    humidity !== null ? `${humidity.toFixed(1)}${humidityUnit}` : '--';
  const illuminanceDisplay =
    illuminance !== null
      ? `${Math.round(illuminance)} ${illuminanceUnit}`
      : '--';

  const lightLevel = illuminance !== null ? getLightLevel(illuminance) : null;
  const hasCO2 = co2 !== null && co2 !== undefined;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon path={mdiThermometer} size={20} className="text-warning-ink" />
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Temperature
          </div>
        </div>
        <div className="text-2xl font-bold text-fg">{tempDisplay}</div>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon path={mdiWaterPercent} size={20} className="text-accent-ink" />
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Humidity
          </div>
        </div>
        <div className="text-2xl font-bold text-fg">{humidityDisplay}</div>
      </div>

      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Icon
            path={lightLevel?.icon ?? mdiLightbulbOutline}
            size={20}
            className={lightLevel ? TONE_INK[lightLevel.tone] : 'text-fg-muted'}
          />
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            Light
          </div>
        </div>
        <div className="text-2xl font-bold text-fg">{illuminanceDisplay}</div>
        {lightLevel && (
          <div className="mt-2 border-t border-line pt-2">
            <div className={`text-xs font-medium ${TONE_INK[lightLevel.tone]}`}>
              {lightLevel.label}
            </div>
            <div className="mt-0.5 text-[10px] leading-tight text-fg-subtle">
              {lightLevel.recommendation}
            </div>
          </div>
        )}
      </div>

      {hasCO2 && (
        <div className="rounded-lg border border-line bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Icon
              path={mdiMoleculeCo2}
              size={20}
              className="text-success-ink"
            />
            <div className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              CO2
            </div>
          </div>
          <div className="text-2xl font-bold text-fg">
            {Math.round(co2 as number)}{' '}
            <span className="text-base">{co2Unit}</span>
          </div>
        </div>
      )}
    </div>
  );
};
