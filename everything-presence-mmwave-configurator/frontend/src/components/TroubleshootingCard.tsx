import {
  mdiDownload,
  mdiPlay,
  mdiRecordCircleOutline,
  mdiStop,
  mdiTextBoxSearchOutline,
} from '@mdi/js';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import {
  type DebugStatus,
  downloadDebugBundle,
  fetchDebugStatus,
  fetchMappingDiagnostics,
  type MappingDiagnosticsResponse,
} from '../api/debug';
import {
  getDebugCaptureState,
  startDebugCapture,
  stopDebugCapture,
  subscribeDebugCapture,
} from '../debug/debugCapture';
import { formatRemaining } from '../utils/debugCaptureUtils';
import { Badge, Button, Note, Panel, Toggle } from './primitives';

const STATUS_LABELS: Record<string, string> = {
  renamed: 'renamed',
  missing: 'missing',
  wrong_device: 'on another device',
  disabled: 'disabled',
  unavailable: 'unavailable',
};

const stopReasonText = (status: DebugStatus): string => {
  switch (status.stopReason) {
    case 'timeout':
      return 'stopped automatically after 30 minutes';
    case 'restart':
      return 'stopped because the add-on restarted';
    case 'user':
      return 'stopped';
    default:
      return '';
  }
};

/** Start/stop a debug session, check mappings and export a debug bundle. */
export const TroubleshootingCard = () => {
  const capture = useSyncExternalStore(
    subscribeDebugCapture,
    getDebugCaptureState,
  );
  const [status, setStatus] = useState<DebugStatus | null>(null);
  const [busy, setBusy] = useState<
    'start' | 'stop' | 'download' | 'diagnostics' | null
  >(null);
  const [includeNetworkDetails, setIncludeNetworkDetails] = useState(false);
  const [diagnostics, setDiagnostics] =
    useState<MappingDiagnosticsResponse | null>(null);
  const [message, setMessage] = useState<{
    kind: 'error' | 'success';
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchDebugStatus());
    } catch (err) {
      setMessage({
        kind: 'error',
        text:
          err instanceof Error ? err.message : 'Failed to load debug status',
      });
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refetch when a capture starts or stops.
  useEffect(() => {
    void refresh();
  }, [refresh, capture.active]);

  useEffect(() => {
    if (!capture.active) return undefined;
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [capture.active, refresh]);

  const run = async (
    kind: NonNullable<typeof busy>,
    action: () => Promise<void>,
  ) => {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setMessage({
        kind: 'error',
        text: err instanceof Error ? err.message : 'Request failed',
      });
    } finally {
      setBusy(null);
    }
  };

  const handleStart = () =>
    run('start', async () => {
      setStatus(await startDebugCapture());
    });

  const handleStop = () =>
    run('stop', async () => {
      setStatus(await stopDebugCapture());
      setMessage({
        kind: 'success',
        text: 'Debug session stopped. Download the debug bundle to share it.',
      });
    });

  const handleDownload = () =>
    run('download', async () => {
      const filename = await downloadDebugBundle(includeNetworkDetails);
      setMessage({ kind: 'success', text: `Saved ${filename}` });
    });

  const handleDiagnostics = () =>
    run('diagnostics', async () => {
      setDiagnostics(await fetchMappingDiagnostics());
    });

  const active = capture.active || Boolean(status?.active);
  const remainingMs = status?.expiresAt
    ? Date.parse(status.expiresAt) - Date.now()
    : 0;
  const problemDevices = diagnostics?.diagnostics.devices.filter(
    (d) =>
      d.entities.some((e) => e.status !== 'ok') ||
      d.missingRequiredKeys.length > 0 ||
      d.deviceFound === false,
  );

  return (
    <Panel
      title="Debug mode"
      actions={
        active ? (
          <Button
            size="sm"
            icon={mdiStop}
            busy={busy === 'stop'}
            disabled={busy !== null}
            onClick={handleStop}
          >
            Stop recording
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            icon={mdiPlay}
            busy={busy === 'start'}
            disabled={busy !== null}
            onClick={handleStart}
          >
            Start debug session
          </Button>
        )
      }
    >
      <p className="text-sm text-fg-muted">
        Record server and browser logs while you reproduce a problem, then
        download one file to attach to a GitHub issue, Discord post or email.
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-fg">
        <li>
          Start a debug session (it stops automatically after 30 minutes).
        </li>
        <li>Reproduce the problem in this browser.</li>
        <li>Stop the session and download the debug bundle.</li>
      </ol>

      <div className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-xs text-fg">
        {status ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
            <span className="flex items-center gap-1.5">
              <span className="text-fg-muted">State</span>
              {active ? (
                <Badge tone="danger" icon={mdiRecordCircleOutline}>
                  Recording
                  {remainingMs > 0
                    ? `, ${formatRemaining(remainingMs)} left`
                    : ''}
                </Badge>
              ) : (
                <span>
                  Not recording
                  {status.stoppedAt ? ` (${stopReasonText(status)})` : ''}
                </span>
              )}
            </span>
            <span>
              <span className="text-fg-muted">Server log entries </span>
              {status.server.entries}
              {status.server.dropped > 0
                ? ` (${status.server.dropped} oldest dropped)`
                : ''}
            </span>
            <span>
              <span className="text-fg-muted">Browser log entries </span>
              {status.client.entries}
              {status.client.dropped > 0
                ? ` (${status.client.dropped} dropped)`
                : ''}
            </span>
            {status.restarts > 0 && (
              <span className="text-warning-ink">
                Resumed after {status.restarts} add-on restart(s); earlier logs
                were lost.
              </span>
            )}
          </div>
        ) : (
          <span className="text-fg-muted">Loading debug status...</span>
        )}
      </div>

      <Toggle
        className="mt-3"
        checked={includeNetworkDetails}
        onChange={setIncludeNetworkDetails}
        label="Include IP addresses"
        description="For private sharing only. Tokens, passwords, Wi-Fi names and MAC addresses are always removed. IP addresses are replaced with placeholders unless this is on. The bundle includes your rooms, settings and entity mappings."
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          icon={mdiTextBoxSearchOutline}
          busy={busy === 'diagnostics'}
          disabled={busy !== null}
          onClick={handleDiagnostics}
        >
          Check entity mappings
        </Button>
        <Button
          icon={mdiDownload}
          busy={busy === 'download'}
          disabled={busy !== null}
          onClick={handleDownload}
        >
          Download debug bundle
        </Button>
      </div>

      {message && (
        <Note
          tone={message.kind === 'error' ? 'danger' : 'info'}
          className="mt-3"
        >
          {message.text}
        </Note>
      )}

      {diagnostics && (
        <div className="mt-4 flex flex-col gap-2 text-sm">
          {!diagnostics.diagnostics.registryAvailable ? (
            <Note tone="warning">
              Could not read the Home Assistant entity registry, so mappings
              were not checked.
            </Note>
          ) : problemDevices && problemDevices.length > 0 ? (
            problemDevices.map((device) => (
              <Note
                key={device.deviceId}
                tone="warning"
                title={device.deviceName || device.deviceId}
              >
                {device.deviceFound === false && (
                  <div className="text-xs">
                    Device no longer exists in Home Assistant.
                  </div>
                )}
                {device.missingRequiredKeys.length > 0 && (
                  <div className="text-xs">
                    Required but unmapped:{' '}
                    {device.missingRequiredKeys.join(', ')}
                  </div>
                )}
                <ul className="mt-1 space-y-0.5 text-xs">
                  {device.entities
                    .filter((e) => e.status !== 'ok')
                    .map((e) => (
                      <li key={e.key}>
                        <span className="text-fg-muted">{e.key}</span>:{' '}
                        {e.entityId} is {STATUS_LABELS[e.status] ?? e.status}
                        {e.currentEntityId ? ` (now ${e.currentEntityId})` : ''}
                      </li>
                    ))}
                </ul>
              </Note>
            ))
          ) : (
            <Note tone="info">
              All {diagnostics.diagnostics.deviceCount} mapped device(s) look
              healthy.
            </Note>
          )}
          {diagnostics.errors.length > 0 && (
            <p className="text-xs text-fg-muted">
              Some checks were skipped:{' '}
              {diagnostics.errors.map((e) => e.section).join(', ')}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
};
