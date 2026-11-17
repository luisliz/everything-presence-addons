import { useEffect, useRef, useState } from 'react';
import { Badge, Icon, Panel } from '../primitives';
import {
  type ActivityEvent,
  type ActivityEventType,
  formatDuration,
  formatTimeAgo,
  getActivityEventDetails,
  TONE_INK,
} from './ep1Utils';

interface EP1ActivityLogProps {
  presence: boolean;
  mmwave: boolean;
  pir: boolean;
  maxEvents?: number;
}

export const EP1ActivityLog = ({
  presence,
  mmwave,
  pir,
  maxEvents = 15,
}: EP1ActivityLogProps) => {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [currentSessionStart, setCurrentSessionStart] = useState<number | null>(
    null,
  );
  const [lastPresenceChange, setLastPresenceChange] = useState<number | null>(
    null,
  );

  const prevValues = useRef({ presence, mmwave, pir });

  useEffect(() => {
    const now = Date.now();
    const newEvents: ActivityEvent[] = [];

    if (presence !== prevValues.current.presence) {
      const type: ActivityEventType = presence ? 'presence_on' : 'presence_off';
      const details = getActivityEventDetails(type);
      newEvents.push({
        id: `${type}-${now}`,
        type,
        timestamp: now,
        label: details.label,
        tone: details.tone,
      });

      if (presence) setCurrentSessionStart(now);
      else setCurrentSessionStart(null);
      setLastPresenceChange(now);
    }

    if (mmwave !== prevValues.current.mmwave) {
      const type: ActivityEventType = mmwave ? 'mmwave_on' : 'mmwave_off';
      const details = getActivityEventDetails(type);
      newEvents.push({
        id: `${type}-${now}`,
        type,
        timestamp: now,
        label: details.label,
        tone: details.tone,
      });
    }

    if (pir !== prevValues.current.pir) {
      const type: ActivityEventType = pir ? 'pir_on' : 'pir_off';
      const details = getActivityEventDetails(type);
      newEvents.push({
        id: `${type}-${now}`,
        type,
        timestamp: now,
        label: details.label,
        tone: details.tone,
      });
    }

    if (newEvents.length > 0) {
      setEvents((prev) => [...newEvents, ...prev].slice(0, maxEvents));
    }

    prevValues.current = { presence, mmwave, pir };
  }, [presence, mmwave, pir, maxEvents]);

  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const sessionDuration = currentSessionStart
    ? (Date.now() - currentSessionStart) / 1000
    : null;

  return (
    <Panel
      variant="section"
      title="Activity log"
      collapsible
      defaultOpen={false}
      actions={
        events.length > 0 ? (
          <button
            type="button"
            onClick={() => setEvents([])}
            className="text-[10px] font-normal text-fg-subtle transition-colors hover:text-fg-muted"
          >
            Clear
          </button>
        ) : undefined
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 text-[10px] text-fg-subtle">Last change</div>
          <div className="text-sm font-medium text-fg">
            {lastPresenceChange ? formatTimeAgo(lastPresenceChange) : '--'}
          </div>
        </div>

        <div className="rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 text-[10px] text-fg-subtle">
            {presence ? 'Session duration' : 'Time since clear'}
          </div>
          <div
            className={`text-sm font-medium ${presence ? TONE_INK.success : 'text-fg-muted'}`}
          >
            {sessionDuration !== null
              ? formatDuration(sessionDuration)
              : lastPresenceChange
                ? formatDuration((Date.now() - lastPresenceChange) / 1000)
                : '--'}
          </div>
        </div>
      </div>

      <div className="max-h-48 space-y-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="py-4 text-center text-xs text-fg-subtle">
            No events recorded yet.
            <br />
            Events will appear as presence changes.
          </div>
        ) : (
          events.map((event) => {
            const details = getActivityEventDetails(event.type);
            return (
              <div
                key={event.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                <Icon
                  path={details.icon}
                  size={16}
                  className={TONE_INK[event.tone]}
                />
                <div className="min-w-0 flex-1">
                  <span
                    className={`text-xs font-medium ${TONE_INK[event.tone]}`}
                  >
                    {event.label}
                  </span>
                </div>
                <span className="whitespace-nowrap text-[10px] text-fg-subtle">
                  {formatTimeAgo(event.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {events.length > 0 && (
        <Badge tone="neutral" className="mt-2">
          Showing {events.length} of last {maxEvents}
        </Badge>
      )}
    </Panel>
  );
};
