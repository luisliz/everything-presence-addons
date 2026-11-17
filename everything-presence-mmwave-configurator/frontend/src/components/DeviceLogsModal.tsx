import {
  mdiArrowDown,
  mdiContentCopy,
  mdiDeleteSweepOutline,
  mdiDownload,
  mdiLockOutline,
  mdiPause,
  mdiPlay,
  mdiRefresh,
} from '@mdi/js';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEVICE_LOG_LEVELS,
  type DeviceIdentity,
  type DeviceLogLevel,
  type DeviceLogServerMessage,
  deviceLogsWsUrl,
  fetchDeviceApiConnection,
  updateDeviceApiConnection,
} from '../api/deviceLogs';
import {
  Badge,
  Button,
  Icon,
  InfoTrigger,
  Sheet,
  type Tone,
} from './primitives';

/**
 * Live device log viewer. The device connection exists only while this sheet
 * is open: opening it starts a session, closing it (or the tab) ends it.
 * Lines live only in this component's memory, capped at MAX_LINES.
 */

const MAX_LINES = 5000;

interface LogLine {
  id: number;
  ts: string;
  level: string;
  tag: string | null;
  msg: string;
}

type ConnState =
  | { kind: 'idle' }
  | { kind: 'resolving' }
  | { kind: 'connecting'; host: string; encrypted: boolean }
  | {
      kind: 'connected';
      host: string;
      hostSource: 'ha' | 'manual' | null;
      encrypted: boolean;
      device: DeviceIdentity;
    }
  | { kind: 'closed'; message: string }
  | {
      kind: 'error';
      code: string;
      message: string;
      needs?: 'host' | 'key' | 'remove_key';
    };

const LEVEL_CLASSES: Record<string, string> = {
  ERROR: 'text-danger-ink',
  WARN: 'text-warning-ink',
  INFO: 'text-success-ink',
  CONFIG: 'text-accent-ink',
  DEBUG: 'text-fg-muted',
  VERBOSE: 'text-fg-subtle',
  VERY_VERBOSE: 'text-fg-subtle',
  STATE: 'text-accent-ink',
};

const LEVEL_LETTER: Record<string, string> = {
  ERROR: 'E',
  WARN: 'W',
  INFO: 'I',
  CONFIG: 'C',
  DEBUG: 'D',
  VERBOSE: 'V',
  VERY_VERBOSE: 'VV',
  STATE: 'S',
};

const STATUS_TONE: Record<ConnState['kind'], Tone> = {
  idle: 'neutral',
  resolving: 'accent',
  connecting: 'accent',
  connected: 'success',
  closed: 'neutral',
  error: 'danger',
};

const STATUS_LABEL: Record<ConnState['kind'], string> = {
  idle: 'Idle',
  resolving: 'Finding device…',
  connecting: 'Connecting…',
  connected: 'Live',
  closed: 'Disconnected',
  error: 'Not connected',
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleTimeString([], { hour12: false })}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

const formatLine = (l: LogLine) =>
  `${formatTime(l.ts)} [${LEVEL_LETTER[l.level] ?? l.level}]${l.tag ? `[${l.tag}]` : ''}: ${l.msg}`;

interface DeviceLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string;
  deviceLabel: string;
}

export const DeviceLogsModal: React.FC<DeviceLogsModalProps> = ({
  isOpen,
  onClose,
  deviceId,
  deviceLabel,
}) => {
  const [conn, setConn] = useState<ConnState>({ kind: 'idle' });
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState<DeviceLogLevel>('DEBUG');
  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [showStates, setShowStates] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [dropped, setDropped] = useState(0);
  const [session, setSession] = useState(0); // bump to reconnect

  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef<LogLine[]>([]);
  const pausedRef = useRef(paused);
  const levelRef = useRef(level);
  const showStatesRef = useRef(showStates);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  pausedRef.current = paused;
  levelRef.current = level;
  showStatesRef.current = showStates;

  // Batch incoming lines into one state update per animation frame.
  const flushScheduled = useRef(false);
  const scheduleFlush = useCallback(() => {
    if (flushScheduled.current) return;
    flushScheduled.current = true;
    requestAnimationFrame(() => {
      flushScheduled.current = false;
      if (pausedRef.current || pendingRef.current.length === 0) return;
      const batch = pendingRef.current;
      pendingRef.current = [];
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > MAX_LINES
          ? next.slice(next.length - MAX_LINES)
          : next;
      });
    });
  }, []);

  useEffect(() => {
    if (!paused) scheduleFlush();
  }, [paused, scheduleFlush]);

  // One device session per open modal (and per explicit reconnect).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `session` is bumped by Reconnect to restart this effect.
  useEffect(() => {
    if (!isOpen) return undefined;
    setConn({ kind: 'resolving' });
    setDropped(0);
    const ws = new WebSocket(deviceLogsWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'start',
          deviceId,
          level: levelRef.current,
          states: showStatesRef.current,
        }),
      );
    };
    ws.onmessage = (event) => {
      let msg: DeviceLogServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'log':
          pendingRef.current.push({
            id: nextId.current++,
            ts: msg.ts,
            level: msg.level,
            tag: msg.tag,
            msg: msg.msg,
          });
          if (pendingRef.current.length > MAX_LINES)
            pendingRef.current.splice(0, pendingRef.current.length - MAX_LINES);
          scheduleFlush();
          break;
        case 'dropped':
          setDropped((d) => d + msg.count);
          break;
        case 'error':
          setConn({
            kind: 'error',
            code: msg.code,
            message: msg.message,
            needs: msg.needs,
          });
          break;
        case 'status':
          if (msg.state === 'resolving') setConn({ kind: 'resolving' });
          else if (msg.state === 'connecting')
            setConn({
              kind: 'connecting',
              host: msg.host,
              encrypted: msg.encrypted,
            });
          else if (msg.state === 'connected')
            setConn({
              kind: 'connected',
              host: msg.host,
              hostSource: msg.hostSource,
              encrypted: msg.encrypted,
              device: msg.device,
            });
          else if (msg.state === 'closed' && msg.reason !== 'stopped')
            setConn({ kind: 'closed', message: msg.message });
          break;
        default:
      }
    };
    ws.onclose = () => {
      setConn((c) =>
        c.kind === 'connected' ||
        c.kind === 'connecting' ||
        c.kind === 'resolving'
          ? { kind: 'closed', message: 'Lost connection to the add-on.' }
          : c,
      );
    };

    return () => {
      ws.onclose = null;
      ws.onmessage = null;
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'stop' }));
      ws.close();
      wsRef.current = null;
    };
  }, [isOpen, deviceId, session, scheduleFlush]);

  // Clear everything when the modal closes; nothing is kept.
  useEffect(() => {
    if (!isOpen) {
      setLines([]);
      pendingRef.current = [];
      setConn({ kind: 'idle' });
    }
  }, [isOpen]);

  const changeLevel = (next: DeviceLogLevel) => {
    setLevel(next);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_level', level: next }));
    }
  };

  // Hiding STATE lines also stops the add-on sending them, so they don't use up
  // the line limit; lines already shown are hidden by the filter below.
  const changeShowStates = (next: boolean) => {
    setShowStates(next);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_states', show: next }));
    }
  };

  // Also drop lines queued while paused, or they would reappear on Resume.
  const clear = () => {
    pendingRef.current = [];
    setLines([]);
  };

  const reconnect = () => setSession((s) => s + 1);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q && showStates) return lines;
    return lines.filter(
      (l) =>
        (showStates || l.level !== 'STATE') &&
        (!q ||
          l.msg.toLowerCase().includes(q) ||
          (l.tag ?? '').toLowerCase().includes(q)),
    );
  }, [lines, filter, showStates]);
  const isFiltered = filter.trim() !== '' || !showStates;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll after every change to the visible lines.
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible, autoScroll]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    if (atBottom !== autoScroll) setAutoScroll(atBottom);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(visible.map(formatLine).join('\n'));
    } catch {
      // Clipboard may be unavailable inside the HA iframe; download still works.
    }
  };

  const download = () => {
    const header = [
      `# ${deviceLabel}`,
      conn.kind === 'connected' && conn.device.esphomeVersion
        ? `# ESPHome ${conn.device.esphomeVersion}`
        : null,
      conn.kind === 'connected' && conn.device.projectVersion
        ? `# Firmware ${conn.device.projectVersion}`
        : null,
      `# Saved ${new Date().toISOString()}`,
    ]
      .filter(Boolean)
      .join('\n');
    const blob = new Blob(
      [`${header}\n${visible.map(formatLine).join('\n')}\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(conn.kind === 'connected' && conn.device.name) || 'device'}-logs-${new Date()
      .toISOString()
      .replace(/\..+/, '')
      .replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const description = (
    <span className="flex items-center gap-1">
      {deviceLabel}
      {conn.kind === 'connected' && (
        <>
          {' • '}
          {conn.host}
          {conn.device.esphomeVersion &&
            ` • ESPHome ${conn.device.esphomeVersion}`}
          {conn.device.projectVersion &&
            ` • Firmware ${conn.device.projectVersion}`}
          {conn.encrypted && (
            <Icon path={mdiLockOutline} size={16} label="Encrypted" />
          )}
        </>
      )}
    </span>
  );

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      variant="side"
      title="Device logs"
      description={description}
      footer={
        <div className="flex items-center justify-between text-[11px] text-fg-subtle">
          <span>
            {lines.length} lines
            {lines.length >= MAX_LINES
              ? ` (oldest removed above ${MAX_LINES})`
              : ''}
            {isFiltered && ` • ${visible.length} shown`}
          </span>
          {!autoScroll && (
            <Button
              variant="ghost"
              size="sm"
              icon={mdiArrowDown}
              onClick={() => setAutoScroll(true)}
            >
              Jump to latest
            </Button>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone={STATUS_TONE[conn.kind]}>
            {conn.kind === 'connected' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            )}
            {STATUS_LABEL[conn.kind]}
          </Badge>

          <label className="flex items-center gap-1.5 text-fg-muted">
            Level
            <select
              value={level}
              onChange={(e) => changeLevel(e.target.value as DeviceLogLevel)}
              className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-fg focus:border-accent focus:outline-none"
            >
              {DEVICE_LOG_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>

          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter text or tag…"
            className="min-w-[10rem] flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none"
          />

          <label className="flex items-center gap-1 text-fg-muted">
            <input
              type="checkbox"
              checked={showStates}
              onChange={(e) => changeShowStates(e.target.checked)}
              className="accent-accent"
            />
            States
            <InfoTrigger
              label="About States"
              content="Entity state changes ([S] lines), as the ESPHome dashboard shows them."
            />
          </label>

          <Button
            variant="secondary"
            size="sm"
            icon={paused ? mdiPlay : mdiPause}
            onClick={() => setPaused((p) => !p)}
          >
            {paused
              ? `Resume${pendingRef.current.length ? ` (${pendingRef.current.length})` : ''}`
              : 'Pause'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={mdiDeleteSweepOutline}
            onClick={clear}
          >
            Clear
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={mdiContentCopy}
            onClick={copy}
            disabled={visible.length === 0}
          >
            Copy
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={mdiDownload}
            onClick={download}
            disabled={visible.length === 0}
          >
            Download
          </Button>
          {(conn.kind === 'closed' || conn.kind === 'error') && (
            <Button
              variant="primary"
              size="sm"
              icon={mdiRefresh}
              onClick={reconnect}
            >
              Reconnect
            </Button>
          )}
        </div>

        {conn.kind === 'error' && (
          <ConnectionProblem
            deviceId={deviceId}
            conn={conn}
            onRetry={reconnect}
          />
        )}
        {conn.kind === 'closed' && (
          <div className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-fg-muted">
            {conn.message}
          </div>
        )}
        {dropped > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning-tint px-3 py-1.5 text-xs text-warning-ink">
            {dropped} lines were skipped because the browser could not keep up.
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-[60dvh] overflow-y-auto rounded-lg bg-bg px-3 py-2 font-mono text-[12px] leading-5 md:h-[calc(100dvh-14rem)]"
        >
          {visible.length === 0 ? (
            <EmptyState
              conn={conn}
              level={level}
              hasFilter={isFiltered && lines.length > 0}
            />
          ) : (
            visible.map((l) => (
              <div key={l.id} className="whitespace-pre-wrap break-words">
                <span className="text-fg-subtle">{formatTime(l.ts)} </span>
                <span className={LEVEL_CLASSES[l.level] ?? 'text-fg-muted'}>
                  [{LEVEL_LETTER[l.level] ?? l.level}]{l.tag && `[${l.tag}]`}:
                </span>{' '}
                <span
                  className={
                    l.level === 'ERROR' || l.level === 'WARN'
                      ? LEVEL_CLASSES[l.level]
                      : 'text-fg'
                  }
                >
                  {l.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </Sheet>
  );
};

const EmptyState: React.FC<{
  conn: ConnState;
  level: DeviceLogLevel;
  hasFilter: boolean;
}> = ({ conn, level, hasFilter }) => {
  if (hasFilter)
    return <p className="text-fg-subtle">No lines match the filter.</p>;
  if (conn.kind === 'connected') {
    return (
      <div className="space-y-1 text-fg-subtle">
        <p>
          Connected. Waiting for log output at {level.replace('_', ' ')} level…
        </p>
        <p>
          If nothing appears, the device firmware may be built to log errors
          only. Lines below the level set in the firmware are not sent.
        </p>
      </div>
    );
  }
  if (conn.kind === 'resolving' || conn.kind === 'connecting')
    return <p className="text-fg-subtle">Connecting to the device…</p>;
  return null;
};

/** Inline fix-up for connection errors: manual host and/or encryption key. */
const ConnectionProblem: React.FC<{
  deviceId: string;
  conn: Extract<ConnState, { kind: 'error' }>;
  onRetry: () => void;
}> = ({ deviceId, conn, onRetry }) => {
  const [host, setHost] = useState('');
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    host: string | null;
    hostSource: string | null;
    hasKey: boolean;
  } | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read saved settings whenever the error changes.
  useEffect(() => {
    fetchDeviceApiConnection(deviceId)
      .then((v) => {
        setSaved(v);
        if (v.hostSource === 'manual' && v.host) setHost(v.host);
      })
      .catch(() => setSaved(null));
  }, [deviceId, conn.code]);

  const save = async (update: {
    manualHost?: string | null;
    encryptionKey?: string | null;
  }) => {
    setSaving(true);
    setFormError(null);
    try {
      await updateDeviceApiConnection(deviceId, update);
      setKey('');
      onRetry();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'flex-1 min-w-[12rem] rounded-lg border border-line bg-surface-2 px-2 py-1 text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none';

  return (
    <div className="space-y-2 rounded-lg border border-danger/40 bg-danger-tint px-3 py-3 text-xs">
      <p className="text-danger-ink">{conn.message}</p>

      {conn.needs === 'key' && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ encryptionKey: key });
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="API encryption key (from the device YAML: api → encryption → key)"
            className={inputCls}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save({ encryptionKey: key })}
            disabled={saving || !key.trim()}
          >
            Save key & connect
          </Button>
        </form>
      )}

      {conn.needs === 'remove_key' && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save({ encryptionKey: null })}
          disabled={saving}
        >
          Remove saved key & connect
        </Button>
      )}

      {conn.needs === 'host' && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save({ manualHost: host });
          }}
        >
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="Device IP address or hostname, e.g. 192.168.1.50"
            className={inputCls}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => void save({ manualHost: host })}
            disabled={saving || !host.trim()}
          >
            Use this address
          </Button>
          {saved?.hostSource === 'manual' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void save({ manualHost: null })}
              disabled={saving}
            >
              Use Home Assistant's address
            </Button>
          )}
        </form>
      )}

      {saved?.hasKey && conn.needs !== 'remove_key' && conn.needs !== 'key' && (
        <p className="text-fg-muted">
          An encryption key is saved for this device.
        </p>
      )}
      {formError && <p className="text-danger-ink">{formError}</p>}
    </div>
  );
};
