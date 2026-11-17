import type { LiveState, RoomConfig } from '../api/types';
import { EP1EnvironmentalPanel } from './EP1EnvironmentalPanel';
import {
  EP1ActivityLog,
  EP1CO2Panel,
  EP1MiniCharts,
  EP1SensorComparisonPanel,
  EP1StatsPanel,
} from './ep1';
import { Panel } from './primitives';

interface EP1DashboardProps {
  room: RoomConfig;
  liveState: LiveState | null;
  entityUnits?: Record<string, string>;
}

export const EP1Dashboard = ({
  room,
  liveState,
  entityUnits,
}: EP1DashboardProps) => {
  if (!liveState) {
    return <div className="text-sm text-fg-subtle">Waiting for live data</div>;
  }

  const environmental = {
    temperature: liveState.temperature ?? null,
    humidity: liveState.humidity ?? null,
    illuminance: liveState.illuminance ?? null,
  };

  return (
    <div className="space-y-4">
      <EP1SensorComparisonPanel
        presence={liveState.presence ?? false}
        mmwave={liveState.mmwave ?? false}
        pir={liveState.pir ?? false}
      />

      <EP1MiniCharts
        temperature={liveState.temperature ?? null}
        presence={liveState.presence ?? false}
        distance={liveState.distance ?? null}
        entityUnits={entityUnits}
      />

      <Panel variant="section" title="Environment" collapsible defaultOpen>
        <div className="space-y-3">
          <EP1EnvironmentalPanel
            environmental={environmental}
            co2={liveState.co2}
            entityUnits={entityUnits}
          />
          {typeof liveState.co2 === 'number' && (
            <EP1CO2Panel co2={liveState.co2} entityUnits={entityUnits} />
          )}
        </div>
      </Panel>

      <EP1ActivityLog
        presence={liveState.presence ?? false}
        mmwave={liveState.mmwave ?? false}
        pir={liveState.pir ?? false}
      />

      <EP1StatsPanel
        deviceId={room.deviceId ?? room.id}
        presence={liveState.presence ?? false}
        temperature={liveState.temperature ?? null}
        entityUnits={entityUnits}
      />
    </div>
  );
};
