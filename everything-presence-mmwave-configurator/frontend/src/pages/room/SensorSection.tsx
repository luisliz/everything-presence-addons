import {
  mdiAlertCircleOutline,
  mdiCancel,
  mdiCheck,
  mdiChevronRight,
  mdiCloudOffOutline,
  mdiEyeOffOutline,
  mdiLoading,
  mdiSync,
} from '@mdi/js';
import { type ReactNode, useState } from 'react';
import type { SettingEntity, SettingsGroup } from '../../api/deviceMappings';
import {
  ApplyBar,
  Button,
  cx,
  Field,
  Icon,
  InfoTrigger,
  Note,
  NumberField,
  Panel,
  Toggle,
  Tooltip,
} from '../../components/primitives';
import {
  CANVAS_KEYS,
  groupApplyButton,
  type SensorSettings,
  type SettingState,
} from './sensorApi';
import type { DraftStatus, SensorDraftApi } from './useSensorDraft';

export const SENSOR_SECTION_ID = 'sensor-section';

const UNIT: Record<string, string> = { deg: '°' };

const RowMark = ({
  status,
  error,
}: {
  status?: DraftStatus;
  error?: string;
}) => {
  if (status === 'writing')
    return (
      <Icon
        path={mdiLoading}
        size={16}
        className="animate-spin text-fg-muted"
        label="Writing"
      />
    );
  if (status === 'ok')
    return (
      <Icon
        path={mdiCheck}
        size={16}
        className="text-success-ink"
        label="Written to the device"
      />
    );
  if (status === 'error')
    return (
      <Tooltip content={error ?? 'Write failed'}>
        <span className="inline-flex text-danger-ink">
          <Icon path={mdiAlertCircleOutline} size={16} label="Write failed" />
        </span>
      </Tooltip>
    );
  return <span aria-hidden="true" className="w-4" />;
};

const unusable = (setting: SettingEntity, state: SettingState | undefined) => {
  if (state?.status === 'disabled' || setting.status === 'disabled')
    return {
      icon: mdiCancel,
      text: `Disabled in Home Assistant${setting.disabledBy ? ` by ${setting.disabledBy}` : ''}`,
    };
  if (state?.status === 'unavailable')
    return { icon: mdiCloudOffOutline, text: 'The entity is unavailable' };
  if (setting.controlType !== 'button' && state?.value === null)
    return { icon: mdiCloudOffOutline, text: 'Status unknown' };
  return null;
};

interface RowProps {
  setting: SettingEntity;
  state?: SettingState;
  draft: SensorDraftApi;
  disabled: boolean;
}

const SettingRow = ({ setting, state, draft, disabled }: RowProps) => {
  const label = setting.label || setting.key;
  const status = draft.draft.status[setting.key];
  const error = draft.draft.error[setting.key];
  const blocked = unusable(setting, state);
  const hidden = setting.hiddenBy ? (
    <Tooltip content={`Hidden in Home Assistant by ${setting.hiddenBy}`}>
      <span className="inline-flex text-fg-subtle">
        <Icon path={mdiEyeOffOutline} size={16} label="Hidden" />
      </span>
    </Tooltip>
  ) : null;
  const row = (control: ReactNode) => (
    <div
      data-setting-key={setting.key}
      className="flex items-center gap-2 py-1"
    >
      <div className="min-w-0 flex-1">{control}</div>
      {hidden}
      <RowMark status={status} error={error} />
    </div>
  );

  if (blocked)
    return row(
      <Field label={label} layout="row" help={setting.description}>
        <span className="flex items-center gap-1.5 text-sm text-fg-subtle">
          <Tooltip content={blocked.text}>
            <span className="inline-flex">
              <Icon path={blocked.icon} size={16} label={blocked.text} />
            </span>
          </Tooltip>
          n/a
        </span>
      </Field>,
    );

  switch (setting.controlType) {
    case 'number': {
      const device = typeof state?.value === 'number' ? state.value : 0;
      const dirty = setting.key in draft.draft.values;
      const id = `sensor-${setting.key}`;
      return row(
        <Field
          label={label}
          layout="row"
          help={setting.description}
          htmlFor={id}
        >
          <NumberField
            id={id}
            value={dirty ? draft.draft.values[setting.key] : device}
            onChange={(value) => draft.set(setting.key, value)}
            min={setting.min}
            max={setting.max}
            step={setting.step}
            unit={
              setting.unit ? (UNIT[setting.unit] ?? setting.unit) : undefined
            }
            dirty={dirty}
            deviceValue={device}
            disabled={disabled}
          />
        </Field>,
      );
    }
    case 'switch':
    case 'light':
      return row(
        <Toggle
          label={label}
          description={
            setting.key === 'upsideDownMounting'
              ? 'No effect on the plan; the device flips its own readings.'
              : setting.description
          }
          checked={state?.value === true}
          busy={status === 'writing'}
          disabled={disabled}
          onChange={(checked) => void draft.writeNow(setting.key, checked)}
          className="-mx-2"
        />,
      );
    case 'select':
      return row(
        <Field
          label={label}
          layout="row"
          help={setting.description}
          htmlFor={`sensor-${setting.key}`}
        >
          <select
            id={`sensor-${setting.key}`}
            value={String(state?.value ?? '')}
            disabled={disabled || status === 'writing'}
            onChange={(event) =>
              void draft.writeNow(setting.key, event.target.value)
            }
            className="h-9 max-w-[10rem] rounded-lg border border-line bg-surface px-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 [@media(pointer:coarse)]:h-11"
          >
            {(setting.options ?? []).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>,
      );
    case 'button':
      return row(
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1 text-sm text-fg-muted">
            {label}
            {setting.description && (
              <InfoTrigger
                content={setting.description}
                label={`About ${label}`}
              />
            )}
          </span>
          <Button
            size="sm"
            busy={status === 'writing'}
            disabled={disabled}
            onClick={() => void draft.writeNow(setting.key, true)}
          >
            Press
          </Button>
        </div>,
      );
    default:
      return null;
  }
};

const GroupBlock = ({
  group,
  states,
  draft,
  disabled,
}: {
  group: SettingsGroup;
  states: Record<string, SettingState>;
  draft: SensorDraftApi;
  disabled: boolean;
}) => {
  const [open, setOpen] = useState(() =>
    group.settings.some((s) => CANVAS_KEYS.has(s.key)),
  );
  const applyButton = groupApplyButton(group)?.key;
  const dirty = group.settings.filter(
    (s) => s.key in draft.draft.values,
  ).length;
  const settings = group.settings.filter((s) => s.key !== applyButton);
  return (
    <div className="border-t border-line first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-10 w-full items-center gap-1.5 text-left text-sm font-medium text-fg hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:min-h-11"
      >
        <Icon
          path={mdiChevronRight}
          size={16}
          className={cx(
            'text-fg-subtle transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="flex-1">{group.group}</span>
        {dirty > 0 && (
          <span
            role="img"
            className="h-1.5 w-1.5 rounded-full bg-accent"
            aria-label={`${dirty} unapplied`}
          />
        )}
      </button>
      {open && (
        <div className="pb-2 pl-1">
          {settings.map((setting) => (
            <SettingRow
              key={setting.key}
              setting={setting}
              state={states[setting.key]}
              draft={draft}
              disabled={disabled}
            />
          ))}
          {applyButton && (
            <p className="pt-1 text-xs text-fg-muted">
              Apply writes this group and commits it on the device.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export interface SensorSectionProps {
  sensor: SensorSettings;
  draft: SensorDraftApi;
  offline: boolean;
  hasDevice: boolean;
  defaultOpen?: boolean;
  onResync: () => void;
}

export const SensorSection = ({
  sensor,
  draft,
  offline,
  hasDevice,
  defaultOpen = false,
  onResync,
}: SensorSectionProps) => {
  const body = () => {
    if (!hasDevice)
      return (
        <p className="text-sm text-fg-muted">
          Link a device to change its settings.
        </p>
      );
    if (sensor.profileMismatch)
      return (
        <Note
          tone="warning"
          title="Device mapping needs re-sync"
          actions={
            <Button size="sm" icon={mdiSync} onClick={onResync}>
              Re-sync
            </Button>
          }
        >
          The room profile is {sensor.profileMismatch.roomProfile}, but the
          saved device mapping is {sensor.profileMismatch.mappingProfile}.
        </Note>
      );
    if (sensor.error)
      return (
        <Note
          tone="danger"
          title="Could not load the settings"
          actions={
            <Button size="sm" onClick={sensor.retry}>
              Retry
            </Button>
          }
        >
          {sensor.error}
        </Note>
      );
    if (sensor.loading && Object.keys(sensor.states).length === 0)
      return (
        <output aria-label="Loading settings" className="block space-y-2">
          {['a', 'b', 'c', 'd'].map((key) => (
            <span
              key={key}
              className="block h-9 animate-pulse rounded-lg bg-surface-2"
            />
          ))}
        </output>
      );
    if (sensor.groups.length === 0)
      return (
        <p className="text-sm text-fg-muted">
          This device exposes no settings to Home Assistant.
        </p>
      );
    return (
      <>
        {offline && (
          <Note tone="warning" className="mb-2">
            Offline. Changes can be applied when it reconnects.
          </Note>
        )}
        {sensor.groups.map((group) => (
          <GroupBlock
            key={group.group}
            group={group}
            states={sensor.states}
            draft={draft}
            disabled={offline}
          />
        ))}
        <ApplyBar
          dirtyCount={draft.dirtyCount}
          onApply={() => void draft.apply()}
          onDiscard={draft.discard}
          busy={draft.applying}
          lastError={draft.lastError}
        />
      </>
    );
  };

  return (
    <Panel
      id={SENSOR_SECTION_ID}
      variant="section"
      title="Sensor"
      collapsible
      defaultOpen={defaultOpen}
      actions={
        draft.dirtyCount > 0 ? (
          <span className="text-xs text-accent-ink">
            {draft.dirtyCount} unapplied
          </span>
        ) : undefined
      }
    >
      {body()}
    </Panel>
  );
};
