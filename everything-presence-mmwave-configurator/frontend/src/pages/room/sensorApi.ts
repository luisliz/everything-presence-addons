import { useCallback, useEffect, useMemo, useState } from 'react';
import { ingressAware } from '../../api/client';
import type { SettingEntity, SettingsGroup } from '../../api/deviceMappings';
import type { RoomConfig } from '../../api/types';
import {
  useDeviceMapping,
  useDeviceSettings,
} from '../../contexts/DeviceMappingsContext';

export type SettingValue = string | number | boolean | null;

export interface SettingState {
  value: SettingValue;
  entityId: string;
  status: 'enabled' | 'disabled' | 'unavailable' | 'unknown';
}

const HIDDEN_KEYS = new Set(['polygonZonesEnabled']);
const FIRMWARE_GROUP = /^firmware/i;

export const CANVAS_KEYS = new Set([
  'installationAngle',
  'maxDistance',
  'mmwaveDistanceMin',
  'mmwaveDistanceMax',
  'mmwaveTriggerDistance',
  'staticPresenceMinRange',
  'staticPresenceMaxRange',
  'staticPresenceTriggerRange',
]);

/** Groups the Sensor section shows: canvas-affecting groups first, firmware groups last, zone-shape controls removed. */
export const visibleGroups = (groups: SettingsGroup[]): SettingsGroup[] =>
  groups
    .map((group) => ({
      ...group,
      settings: group.settings.filter((s) => !HIDDEN_KEYS.has(s.key)),
    }))
    .filter((group) => group.settings.length > 0)
    .map((group, index) => ({
      group,
      rank: group.settings.some((s) => CANVAS_KEYS.has(s.key))
        ? 0
        : FIRMWARE_GROUP.test(group.group)
          ? 2
          : 1,
      index,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ group }) => group);

/** The button entity that commits a group's numbers on the device (Pro static presence groups). */
export const groupApplyButton = (
  group: SettingsGroup,
): SettingEntity | undefined =>
  group.settings.find(
    (s) => s.controlType === 'button' && /^apply/i.test(s.key),
  );

const parseState = (
  setting: SettingEntity,
  raw: unknown,
): Pick<SettingState, 'value' | 'status'> => {
  const text = typeof raw === 'string' ? raw : String(raw ?? '');
  if (/^(unavailable|unknown)$/i.test(text))
    return { value: null, status: 'unavailable' };
  if (setting.controlType === 'number') {
    const value = Number.parseFloat(text);
    return { value: Number.isFinite(value) ? value : null, status: 'enabled' };
  }
  if (setting.controlType === 'switch' || setting.controlType === 'light')
    return { value: text === 'on', status: 'enabled' };
  return { value: text, status: 'enabled' };
};

export async function fetchSettingStates(
  groups: SettingsGroup[],
): Promise<Record<string, SettingState>> {
  const settings = groups.flatMap((group) => group.settings);
  const entries = await Promise.all(
    settings.map(async (setting): Promise<[string, SettingState]> => {
      const base: SettingState = {
        value: null,
        entityId: setting.entityId,
        status: setting.status ?? 'unknown',
      };
      if (
        !setting.entityId ||
        setting.status === 'disabled' ||
        setting.controlType === 'button'
      )
        return [setting.key, base];
      try {
        const response = await fetch(
          ingressAware(`api/live/ha/states/${setting.entityId}`),
        );
        if (!response.ok) return [setting.key, base];
        const data = (await response.json()) as { state?: unknown };
        return [setting.key, { ...base, ...parseState(setting, data.state) }];
      } catch {
        return [setting.key, base];
      }
    }),
  );
  return Object.fromEntries(entries);
}

export async function writeSetting(
  deviceId: string,
  entityId: string,
  value: string | number | boolean,
): Promise<void> {
  const response = await fetch(ingressAware(`api/live/${deviceId}/entity`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId, value }),
  });
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  throw new Error(
    typeof body?.error === 'string'
      ? body.error
      : `Home Assistant rejected the value (${response.status})`,
  );
}

export interface SensorSettings {
  groups: SettingsGroup[];
  states: Record<string, SettingState>;
  loading: boolean;
  error: string | null;
  profileMismatch: { roomProfile: string; mappingProfile: string } | null;
  retry: () => void;
  write: (key: string, value: string | number | boolean) => Promise<void>;
}

export function useSensorSettings(room: RoomConfig | null): SensorSettings {
  const deviceId = room?.deviceId;
  const {
    mapping,
    loading: mappingLoading,
    refresh,
  } = useDeviceMapping(deviceId);
  const {
    settings,
    loading: settingsLoading,
    error: settingsError,
  } = useDeviceSettings(deviceId);
  const [states, setStates] = useState<Record<string, SettingState>>({});
  const [fetching, setFetching] = useState(false);
  const [nonce, setNonce] = useState(0);

  const roomProfile = room?.profileId;
  const mappingProfile = mapping?.profileId;
  const profileMismatch = useMemo(
    () =>
      roomProfile && mappingProfile && roomProfile !== mappingProfile
        ? { roomProfile, mappingProfile }
        : null,
    [roomProfile, mappingProfile],
  );
  const groups = useMemo(() => visibleGroups(settings), [settings]);

  useEffect(() => {
    if (nonce < 0 || settingsLoading || profileMismatch || !groups.length) {
      setStates({});
      return;
    }
    let cancelled = false;
    setFetching(true);
    fetchSettingStates(groups).then((next) => {
      if (cancelled) return;
      setStates(next);
      setFetching(false);
    });
    return () => {
      cancelled = true;
    };
  }, [groups, settingsLoading, profileMismatch, nonce]);

  const write = useCallback(
    async (key: string, value: string | number | boolean) => {
      const entityId = states[key]?.entityId;
      if (!deviceId || !entityId) throw new Error('This setting has no entity');
      await writeSetting(deviceId, entityId, value);
      setStates((current) => {
        const prev = current[key];
        if (!prev) return current;
        // A button press is a boolean write to an entity with no value.
        const next =
          prev.value === null && typeof value === 'boolean' ? null : value;
        return { ...current, [key]: { ...prev, value: next } };
      });
    },
    [deviceId, states],
  );

  const retry = useCallback(() => {
    void refresh();
    setNonce((n) => n + 1);
  }, [refresh]);

  return {
    groups,
    states,
    loading: mappingLoading || settingsLoading || fetching,
    error: settingsError,
    profileMismatch,
    retry,
    write,
  };
}
