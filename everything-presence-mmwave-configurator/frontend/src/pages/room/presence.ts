import { useEffect, useRef, useState } from 'react';

export const useNow = (intervalMs = 15000): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
};

/**
 * When each boolean last changed, as seen by this screen. `null` until a change is observed,
 * because a state that was already true or false on open has an unknown start.
 */
export const useStateSince = (
  states: Record<string, boolean | undefined>,
): Record<string, number | null> => {
  const seen = useRef(
    new Map<string, { value?: boolean; since: number | null }>(),
  );
  const result: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(states)) {
    const previous = seen.current.get(key);
    if (!previous || previous.value === undefined)
      seen.current.set(key, { value, since: null });
    else if (previous.value !== value)
      seen.current.set(key, { value, since: Date.now() });
    result[key] = seen.current.get(key)?.since ?? null;
  }
  return result;
};

export const formatDuration = (ms: number): string => {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
};

export const stateLabel = (
  active: boolean,
  since: number | null,
  now: number,
  words: [string, string] = ['Occupied', 'Clear'],
): string => {
  const word = active ? words[0] : words[1];
  return since === null ? word : `${word} for ${formatDuration(now - since)}`;
};
