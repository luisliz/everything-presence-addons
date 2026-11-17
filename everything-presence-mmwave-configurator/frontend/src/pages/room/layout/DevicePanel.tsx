import { mdiAutoFix, mdiCrosshairsGps, mdiRestore } from '@mdi/js';
import { useId, useState } from 'react';
import type { DevicePlacement } from '../../../api/types';
import {
  Button,
  Field,
  Note,
  NumberField,
  Panel,
  Segmented,
  Toggle,
} from '../../../components/primitives';
import { isDevicePositionLocked } from '../../../utils/lockState';
import { getInstallationAngleSuggestion } from '../../../utils/rotationSuggestion';
import { SensorSection } from '../SensorSection';
import type { RoomFrame } from '../types';
import { fromUnits, lengthUnit, toUnits, type Units } from './units';
import type { LayoutEditor } from './useLayoutEditor';

const SELECT =
  'h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent [@media(pointer:coarse)]:h-11';

const signed = (deg: number) => `${deg > 0 ? '+' : ''}${deg}°`;

export interface DevicePanelProps {
  frame: RoomFrame;
  editor: LayoutEditor;
  units: Units;
}

export const DevicePanel = ({ frame, editor, units }: DevicePanelProps) => {
  const presetId = useId();
  const rotationId = useId();
  const { profile, sensor, draft } = frame;
  const placement: DevicePlacement = editor.room.devicePlacement ?? {
    x: 0,
    y: 0,
    rotationDeg: 0,
  };
  const update = editor.updatePlacement;
  const positionLocked = isDevicePositionLocked(placement);
  const ceiling = placement.mountType === 'ceiling';
  const unit = lengthUnit(units);

  const presets = profile?.coverage?.presets ?? null;
  const defaultPresetId = profile?.coverage?.defaultPresetId;
  const currentPreset = (() => {
    if (!presets) return 'custom';
    if (placement.coveragePresetId === 'custom') return 'custom';
    if (placement.coveragePresetId && presets[placement.coveragePresetId])
      return placement.coveragePresetId;
    const [h, v] = [placement.horizontalFovDeg, placement.verticalFovDeg];
    if (Number.isFinite(h) && Number.isFinite(v))
      return (
        Object.entries(presets).find(
          ([, p]) =>
            Math.abs(p.horizontalFovDeg - Number(h)) < 0.5 &&
            Math.abs(p.verticalFovDeg - Number(v)) < 0.5,
        )?.[0] ?? 'custom'
      );
    return 'default';
  })();
  const choosePreset = (value: string) => {
    if (!presets) return;
    if (value === 'default')
      update({
        coveragePresetId: undefined,
        horizontalFovDeg: undefined,
        verticalFovDeg: undefined,
      });
    else if (value === 'custom') {
      const fallback =
        (defaultPresetId && presets[defaultPresetId]) ||
        presets[Object.keys(presets)[0]];
      update({
        coveragePresetId: 'custom',
        horizontalFovDeg:
          placement.horizontalFovDeg ?? fallback?.horizontalFovDeg ?? 120,
        verticalFovDeg:
          placement.verticalFovDeg ?? fallback?.verticalFovDeg ?? 70,
      });
    } else if (presets[value])
      update({
        coveragePresetId: value,
        horizontalFovDeg: presets[value].horizontalFovDeg,
        verticalFovDeg: presets[value].verticalFovDeg,
      });
  };

  const caps = profile?.capabilities as
    | { tracking?: boolean; distanceOnlyTracking?: boolean }
    | undefined;
  const angleState = sensor.states.installationAngle;
  const deviceAngle =
    typeof angleState?.value === 'number' ? angleState.value : null;
  const canSuggest =
    Boolean(caps?.tracking && !caps.distanceOnlyTracking && angleState) &&
    (editor.room.roomShell?.points?.length ?? 0) >= 2;
  const [suggestion, setSuggestion] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const suggest = (rotationDeg: number) => {
    if (!canSuggest) return;
    const result = getInstallationAngleSuggestion(
      rotationDeg,
      editor.room.roomShell?.points,
    );
    if (!result) return;
    setSuggestion(result.suggestedAngle);
    draft.set('installationAngle', result.suggestedAngle);
  };
  const dismiss = () => {
    if (deviceAngle !== null) draft.set('installationAngle', deviceAngle);
    setSuggestion(null);
  };
  const apply = async () => {
    if (suggestion === null) return;
    setApplying(true);
    await draft.writeNow('installationAngle', suggestion);
    window.dispatchEvent(
      new CustomEvent('ep:refresh-live-state', {
        detail: { deviceId: editor.room.deviceId },
      }),
    );
    setApplying(false);
    setSuggestion(null);
  };
  const alreadySet = suggestion !== null && suggestion === deviceAngle;

  return (
    <>
      <Panel
        variant="section"
        title="Placement"
        actions={
          <span className="text-xs text-fg-subtle">Saved with the layout</span>
        }
      >
        <div className="space-y-3">
          <fieldset
            disabled={positionLocked}
            className="min-w-0 space-y-3 disabled:opacity-50"
          >
            {(['x', 'y'] as const).map((axis) => (
              <Field key={axis} label={axis.toUpperCase()} layout="row">
                <NumberField
                  value={toUnits(placement[axis], units)}
                  onChange={(v) => update({ [axis]: fromUnits(v, units) })}
                  step={0.01}
                  unit={unit}
                  ariaLabel={`Device ${axis.toUpperCase()}`}
                />
              </Field>
            ))}
          </fieldset>
          <Field label="Rotation" htmlFor={rotationId}>
            <div className="flex items-center gap-3">
              <input
                id={rotationId}
                type="range"
                min={-180}
                max={180}
                step={1}
                value={placement.rotationDeg ?? 0}
                onChange={(event) =>
                  update({ rotationDeg: Number(event.target.value) })
                }
                onPointerUp={(event) =>
                  suggest(Number(event.currentTarget.value))
                }
                className="w-full accent-accent"
              />
              <NumberField
                value={placement.rotationDeg ?? 0}
                onChange={(rotationDeg) => update({ rotationDeg })}
                min={-180}
                max={180}
                step={1}
                unit="°"
                ariaLabel="Device rotation"
              />
            </div>
          </Field>
          {suggestion !== null && (
            <Note
              tone="info"
              icon={mdiAutoFix}
              title={`Installation angle ${signed(suggestion)}`}
              actions={
                <>
                  <Button
                    size="sm"
                    variant="primary"
                    busy={applying}
                    disabled={alreadySet}
                    onClick={() => void apply()}
                  >
                    Apply to device
                  </Button>
                  <Button size="sm" variant="ghost" onClick={dismiss}>
                    Dismiss
                  </Button>
                </>
              }
            >
              {alreadySet
                ? 'The device already uses this angle.'
                : suggestion === 0
                  ? 'The rotation already lines up with your walls; the angle can stay at 0°.'
                  : 'Keeps zones square to your walls. The canvas previews it; Apply writes it to the device.'}
            </Note>
          )}
          {canSuggest && suggestion === null && (
            <Button
              size="sm"
              variant="ghost"
              icon={mdiAutoFix}
              onClick={() => suggest(placement.rotationDeg ?? 0)}
            >
              Suggest installation angle
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={mdiCrosshairsGps}
              disabled={positionLocked}
              onClick={() => update({ x: 0, y: 0 })}
            >
              Move to origin
            </Button>
            <Button
              size="sm"
              icon={mdiRestore}
              onClick={() => update({ rotationDeg: 0 })}
            >
              Reset rotation
            </Button>
          </div>
          <Field label="Mount" layout="row">
            <Segmented
              size="sm"
              ariaLabel="Mount"
              value={ceiling ? 'ceiling' : 'wall'}
              onChange={(mountType) =>
                update(
                  mountType === 'ceiling'
                    ? { mountType, pitchDeg: 90, heightMm: 2400 }
                    : { mountType },
                )
              }
              options={[
                { value: 'wall', label: 'Wall' },
                { value: 'ceiling', label: 'Ceiling' },
              ]}
            />
          </Field>
          <Field
            label="Height"
            layout="row"
            help="Height above the floor, used for the coverage projection."
          >
            <NumberField
              value={toUnits(placement.heightMm ?? 0, units)}
              onChange={(v) =>
                update({ heightMm: Math.round(fromUnits(v, units)) })
              }
              min={0}
              step={0.1}
              unit={unit}
              ariaLabel="Device height"
            />
          </Field>
          <Field
            label="Pitch"
            layout="row"
            help={
              ceiling
                ? 'Ceiling mounts point straight down (90°).'
                : '0° is horizontal, 90° points at the floor.'
            }
          >
            <NumberField
              value={ceiling ? 90 : (placement.pitchDeg ?? 0)}
              onChange={(pitchDeg) => update({ pitchDeg })}
              min={0}
              max={90}
              step={1}
              unit="°"
              disabled={ceiling}
              ariaLabel="Device pitch"
            />
          </Field>
          {presets && (
            <Field
              label="Coverage"
              htmlFor={presetId}
              help="Changes the drawn cone only; zone limits follow the tracking sensor."
            >
              <select
                id={presetId}
                value={currentPreset}
                onChange={(e) => choosePreset(e.target.value)}
                className={SELECT}
              >
                <option value="default">
                  Default
                  {defaultPresetId && presets[defaultPresetId]
                    ? ` (${presets[defaultPresetId].label})`
                    : ''}
                </option>
                {Object.entries(presets).map(([id, preset]) => (
                  <option key={id} value={id}>
                    {preset.label} ({preset.horizontalFovDeg}° ×{' '}
                    {preset.verticalFovDeg}°)
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Field>
          )}
          {currentPreset === 'custom' &&
            (['horizontalFovDeg', 'verticalFovDeg'] as const).map((key) => (
              <Field
                key={key}
                label={
                  key === 'horizontalFovDeg' ? 'Horizontal FOV' : 'Vertical FOV'
                }
                layout="row"
              >
                <NumberField
                  value={
                    placement[key] ??
                    (key === 'horizontalFovDeg'
                      ? (profile?.limits?.fieldOfViewDegrees ?? 120)
                      : 70)
                  }
                  onChange={(v) =>
                    update({ coveragePresetId: 'custom', [key]: v })
                  }
                  min={1}
                  max={180}
                  step={1}
                  unit="°"
                  ariaLabel={
                    key === 'horizontalFovDeg'
                      ? 'Horizontal field of view'
                      : 'Vertical field of view'
                  }
                />
              </Field>
            ))}
          <Toggle
            label="Lock position"
            description="Rotation stays adjustable."
            checked={positionLocked}
            onChange={(locked) => update({ locked })}
          />
        </div>
      </Panel>
      <SensorSection
        sensor={sensor}
        draft={draft}
        offline={frame.offline}
        hasDevice={Boolean(editor.room.deviceId)}
        defaultOpen
        onResync={frame.openResync}
      />
    </>
  );
};
