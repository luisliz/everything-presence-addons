import { mdiCheckCircleOutline, mdiFlashOutline } from '@mdi/js';
import { useState } from 'react';
import { Icon, Panel, StatusDot } from '../primitives';

interface EP1SensorComparisonPanelProps {
  presence: boolean;
  mmwave: boolean;
  pir: boolean;
}

export const EP1SensorComparisonPanel = ({
  presence,
  mmwave,
  pir,
}: EP1SensorComparisonPanelProps) => {
  const bothActive = mmwave && pir;
  const bothInactive = !mmwave && !pir;
  const inAgreement = bothActive || bothInactive;

  const drivingSensor = presence
    ? mmwave && pir
      ? 'Both'
      : mmwave
        ? 'mmWave'
        : pir
          ? 'PIR'
          : 'Unknown'
    : 'None';

  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <Panel
      variant="section"
      title="Sensor comparison"
      collapsible
      defaultOpen={false}
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div
          className={`rounded-lg border p-3 transition-all ${
            mmwave
              ? 'border-accent/50 bg-accent-tint'
              : 'border-line bg-surface-2'
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <StatusDot state={mmwave ? 'online' : 'none'} />
            <span className="text-xs font-semibold text-fg-muted">mmWave</span>
          </div>
          <div
            className={`text-sm font-medium ${mmwave ? 'text-accent-ink' : 'text-fg-subtle'}`}
          >
            {mmwave ? 'Detecting' : 'Clear'}
          </div>
          <div className="mt-1 text-[10px] text-fg-subtle">
            Radar-based, static presence
          </div>
        </div>

        <div
          className={`rounded-lg border p-3 transition-all ${
            pir ? 'border-accent/50 bg-accent-tint' : 'border-line bg-surface-2'
          }`}
        >
          <div className="mb-1 flex items-center gap-2">
            <StatusDot state={pir ? 'online' : 'none'} />
            <span className="text-xs font-semibold text-fg-muted">PIR</span>
          </div>
          <div
            className={`text-sm font-medium ${pir ? 'text-accent-ink' : 'text-fg-subtle'}`}
          >
            {pir ? 'Motion' : 'No motion'}
          </div>
          <div className="mt-1 text-[10px] text-fg-subtle">
            Infrared, movement-based
          </div>
        </div>
      </div>

      <div
        className={`rounded-lg border p-3 ${
          inAgreement
            ? 'border-success/30 bg-success-tint'
            : 'border-warning/30 bg-warning-tint'
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon
            path={inAgreement ? mdiCheckCircleOutline : mdiFlashOutline}
            size={20}
            className={inAgreement ? 'text-success-ink' : 'text-warning-ink'}
          />
          <div>
            <div
              className={`text-sm font-medium ${inAgreement ? 'text-success-ink' : 'text-warning-ink'}`}
            >
              {inAgreement ? 'Sensors agree' : 'Sensors differ'}
            </div>
            <div className="text-[10px] text-fg-subtle">
              {inAgreement
                ? bothActive
                  ? 'Both detecting presence'
                  : 'Both showing clear'
                : mmwave && !pir
                  ? 'mmWave active, PIR inactive (static presence?)'
                  : 'PIR active, mmWave inactive (fast movement?)'}
            </div>
          </div>
        </div>
      </div>

      {presence && (
        <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="text-fg-subtle">Primary detection by:</span>
          <span
            className={`font-medium ${drivingSensor === 'None' ? 'text-fg-muted' : 'text-accent-ink'}`}
          >
            {drivingSensor}
          </span>
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setInfoOpen((v) => !v)}
          className="text-[10px] text-fg-subtle transition-colors hover:text-fg-muted"
        >
          How sensors work together
        </button>
        {infoOpen && (
          <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-fg-subtle">
            <p>
              <strong className="text-accent-ink">mmWave</strong>: detects
              stationary and moving objects using radar. Best for static
              presence (sitting, sleeping).
            </p>
            <p>
              <strong className="text-accent-ink">PIR</strong>: detects heat
              movement from people or animals. Best for detecting motion
              (walking, moving).
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
};
