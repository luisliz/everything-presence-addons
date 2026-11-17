import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { SettingsGroup } from '../../api/deviceMappings';
import type { EP1Config } from '../../api/types';
import type { SensorCoverageConfig } from '../../utils/coverage';
import type { SensorSettings } from './sensorApi';

export type DraftStatus = 'idle' | 'writing' | 'ok' | 'error';

export interface SensorDraft {
  values: Record<string, number>;
  status: Record<string, DraftStatus>;
  error: Record<string, string>;
}

export type DraftAction =
  | { type: 'set'; key: string; value: number; deviceValue?: number | null }
  | {
      type: 'status';
      key: string;
      status: DraftStatus;
      error?: string;
      /** With 'ok': the value that reached the device; a newer draft value stays dirty. */
      written?: string | number | boolean;
    }
  | { type: 'discard' }
  | { type: 'reset' };

export const EMPTY_DRAFT: SensorDraft = { values: {}, status: {}, error: {} };

const without = <T>(record: Record<string, T>, key: string) => {
  if (!(key in record)) return record;
  const { [key]: _, ...rest } = record;
  return rest;
};

export function sensorDraftReducer(
  draft: SensorDraft,
  action: DraftAction,
): SensorDraft {
  switch (action.type) {
    case 'set': {
      const values =
        action.value === action.deviceValue
          ? without(draft.values, action.key)
          : { ...draft.values, [action.key]: action.value };
      return {
        values,
        status: without(draft.status, action.key),
        error: without(draft.error, action.key),
      };
    }
    case 'status':
      return {
        values:
          action.status === 'ok' && draft.values[action.key] === action.written
            ? without(draft.values, action.key)
            : draft.values,
        status:
          action.status === 'idle'
            ? without(draft.status, action.key)
            : { ...draft.status, [action.key]: action.status },
        error:
          action.status === 'error'
            ? { ...draft.error, [action.key]: action.error ?? 'Write failed' }
            : without(draft.error, action.key),
      };
    case 'discard':
      return {
        values: {},
        status: Object.fromEntries(
          Object.entries(draft.status).filter(
            ([key]) => !(key in draft.values),
          ),
        ),
        error: Object.fromEntries(
          Object.entries(draft.error).filter(([key]) => !(key in draft.values)),
        ),
      };
    case 'reset':
      return EMPTY_DRAFT;
  }
}

export interface ApplyStep {
  keys: string[];
  /** Button entity pressed after the group's numbers are written. */
  button?: string;
}

/** Dirty keys in profile order, one step per group; a group with an apply button presses it after its numbers. */
export function applyPlan(
  groups: SettingsGroup[],
  values: Record<string, number>,
): ApplyStep[] {
  return groups
    .map((group) => {
      const keys = group.settings
        .filter((s) => s.controlType === 'number' && s.key in values)
        .map((s) => s.key);
      const button = group.settings.find(
        (s) => s.controlType === 'button' && /^apply/i.test(s.key),
      )?.key;
      return button ? { keys, button } : { keys };
    })
    .filter((step) => step.keys.length > 0);
}

/** Live config with the draft laid over it, in the shape the coverage resolver reads (distances in cm). */
export function sensorConfigFrom(
  config: Partial<EP1Config> | null | undefined,
  values: Record<string, number>,
): SensorCoverageConfig {
  const pick = (...candidates: Array<number | null | undefined>) =>
    candidates.find(
      (v): v is number => typeof v === 'number' && Number.isFinite(v),
    );
  return {
    installationAngle: pick(
      values.installationAngle,
      config?.installationAngle,
    ),
    maxDistance: pick(
      values.maxDistance,
      values.mmwaveDistanceMax,
      config?.distanceMax,
    ),
  };
}

const OK_VISIBLE_MS = 2000;

export interface SensorDraftApi {
  draft: SensorDraft;
  dirtyCount: number;
  applying: boolean;
  lastError: string | null;
  set: (key: string, value: number) => void;
  discard: () => void;
  apply: () => Promise<boolean>;
  /** Immediate write for switches, selects, lights and buttons, with per-row status; resolves whether it reached the device. */
  writeNow: (key: string, value: string | number | boolean) => Promise<boolean>;
}

export function useSensorDraft(
  deviceId: string | undefined,
  sensor: Pick<SensorSettings, 'groups' | 'states' | 'write'>,
): SensorDraftApi {
  const [draft, dispatch] = useReducer(sensorDraftReducer, EMPTY_DRAFT);
  const [applying, setApplying] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const timers = useRef(new Map<string, number>());

  const [draftDevice, setDraftDevice] = useState(deviceId);
  if (draftDevice !== deviceId) {
    setDraftDevice(deviceId);
    dispatch({ type: 'reset' });
    setLastError(null);
  }

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  const mark = useCallback(
    (
      key: string,
      status: DraftStatus,
      detail: { error?: string; written?: string | number | boolean } = {},
    ) => {
      dispatch({ type: 'status', key, status, ...detail });
      window.clearTimeout(timers.current.get(key));
      if (status === 'ok')
        timers.current.set(
          key,
          window.setTimeout(
            () => dispatch({ type: 'status', key, status: 'idle' }),
            OK_VISIBLE_MS,
          ),
        );
    },
    [],
  );

  const { groups, states, write } = sensor;

  const set = useCallback(
    (key: string, value: number) => {
      const device = states[key]?.value;
      dispatch({
        type: 'set',
        key,
        value,
        deviceValue: typeof device === 'number' ? device : null,
      });
    },
    [states],
  );

  const writeKey = useCallback(
    async (key: string, value: string | number | boolean) => {
      mark(key, 'writing');
      try {
        await write(key, value);
        mark(key, 'ok', { written: value });
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Write failed';
        mark(key, 'error', { error: message });
        setLastError(message);
        return false;
      }
    },
    [mark, write],
  );

  const apply = useCallback(async () => {
    setApplying(true);
    setLastError(null);
    let allOk = true;
    for (const step of applyPlan(groups, draft.values)) {
      let wrote = false;
      for (const key of step.keys) {
        const ok = await writeKey(key, draft.values[key]);
        wrote ||= ok;
        allOk &&= ok;
      }
      if (step.button && wrote)
        allOk = (await writeKey(step.button, true)) && allOk;
    }
    setApplying(false);
    return allOk;
  }, [draft.values, groups, writeKey]);

  const discard = useCallback(() => {
    dispatch({ type: 'discard' });
    setLastError(null);
  }, []);

  return {
    draft,
    dirtyCount: Object.keys(draft.values).length,
    applying,
    lastError,
    set,
    discard,
    apply,
    writeNow: writeKey,
  };
}
