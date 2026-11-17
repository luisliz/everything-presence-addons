import { mdiCircleMedium, mdiImageOutline, mdiLayersOutline } from '@mdi/js';
import { type ReactNode, useId, useState } from 'react';
import {
  IconButton,
  Popover,
  Segmented,
  Sheet,
  Toggle,
} from '../../components/primitives';
import type { useDisplaySettings } from '../../hooks/useDisplaySettings';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  MARKER_SCALE_MAX,
  MARKER_SCALE_MIN,
} from '../../utils/deviceMarkerSettings';

export type DisplaySettingsApi = ReturnType<typeof useDisplaySettings>;

export interface DisplayLayersProps {
  display: DisplaySettingsApi;
  /** Rings and controls that only make sense for some devices. */
  features?: { triggerRing?: boolean; alignedDirection?: boolean };
  smoothTracking?: { value: boolean; onChange: (value: boolean) => void };
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset className="space-y-0.5">
    <legend className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
      {title}
    </legend>
    {children}
  </fieldset>
);

const SliderRow = ({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) => {
  const id = useId();
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 px-2 py-1">
      <label htmlFor={id} className="text-sm text-fg">
        {label}
      </label>
      <output htmlFor={id} className="text-xs tabular-nums text-fg-muted">
        {format(value)}
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="col-span-2 w-full accent-accent disabled:opacity-40"
      />
    </div>
  );
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

export const DisplayLayers = ({
  display: d,
  features = {},
  smoothTracking,
}: DisplayLayersProps) => (
  <div className="w-full space-y-4 md:w-72">
    <Group title="Coverage">
      <Toggle
        label="Show coverage"
        checked={d.showDeviceRadar}
        onChange={d.setShowDeviceRadar}
      />
      <Toggle
        label="Clip to walls"
        description="Hide the part of the cone outside the room"
        checked={d.clipRadarToWalls}
        onChange={d.setClipRadarToWalls}
      />
      <Toggle
        label="Max distance ring"
        checked={d.showMaxDistanceOverlay}
        onChange={d.setShowMaxDistanceOverlay}
      />
      {features.triggerRing && (
        <Toggle
          label="Trigger distance ring"
          checked={d.showTriggerDistanceOverlay}
          onChange={d.setShowTriggerDistanceOverlay}
        />
      )}
      {features.alignedDirection && (
        <Toggle
          label="Aligned direction"
          description="Arrow along the corrected installation angle"
          checked={d.showAlignedDirection}
          onChange={d.setShowAlignedDirection}
        />
      )}
    </Group>
    <Group title="Room">
      <Toggle label="Walls" checked={d.showWalls} onChange={d.setShowWalls} />
      <Toggle label="Doors" checked={d.showDoors} onChange={d.setShowDoors} />
      <Toggle
        label="Furniture"
        checked={d.showFurniture}
        onChange={d.setShowFurniture}
      />
      <Toggle label="Zones" checked={d.showZones} onChange={d.setShowZones} />
      <Toggle
        label="Zone labels"
        checked={d.showZoneLabels}
        onChange={d.setShowZoneLabels}
      />
      <Toggle
        label="Targets"
        checked={d.showTargets}
        onChange={d.setShowTargets}
      />
      <Toggle
        label="Device marker"
        checked={d.showDeviceIcon}
        onChange={d.setShowDeviceIcon}
      />
    </Group>
    <Group title="Appearance">
      <div className="flex items-center justify-between gap-3 px-2 py-1">
        <span className="text-sm text-fg">Device marker style</span>
        <Segmented
          size="sm"
          ariaLabel="Device marker style"
          value={d.deviceMarkerStyle}
          onChange={d.setDeviceMarkerStyle}
          options={[
            { value: 'icon', label: 'Icon', icon: mdiImageOutline },
            { value: 'node', label: 'Dot', icon: mdiCircleMedium },
          ]}
          iconOnly
        />
      </div>
      <SliderRow
        label="Device marker size"
        value={d.deviceMarkerScale}
        min={MARKER_SCALE_MIN}
        max={MARKER_SCALE_MAX}
        step={0.05}
        format={percent}
        disabled={!d.showDeviceIcon}
        onChange={d.setDeviceMarkerScale}
      />
      <SliderRow
        label="Device marker opacity"
        value={d.deviceMarkerOpacity}
        min={0.1}
        max={1}
        step={0.1}
        format={percent}
        disabled={!d.showDeviceIcon}
        onChange={d.setDeviceMarkerOpacity}
      />
      <SliderRow
        label="Target size"
        value={d.targetMarkerScale}
        min={MARKER_SCALE_MIN}
        max={MARKER_SCALE_MAX}
        step={0.05}
        format={percent}
        disabled={!d.showTargets}
        onChange={d.setTargetMarkerScale}
      />
      <SliderRow
        label="Zone label size"
        value={d.zoneLabelScale}
        min={MARKER_SCALE_MIN}
        max={MARKER_SCALE_MAX}
        step={0.05}
        format={percent}
        disabled={!d.showZoneLabels}
        onChange={d.setZoneLabelScale}
      />
    </Group>
    {smoothTracking && (
      <Group title="Tracking">
        <Toggle
          label="Smooth tracking"
          description="Animate targets between updates"
          checked={smoothTracking.value}
          onChange={smoothTracking.onChange}
        />
      </Group>
    )}
  </div>
);

/** Toolbar button: a popover on wide screens, a bottom sheet on phones. */
export const LayersControl = (props: DisplayLayersProps) => {
  const wide = useMediaQuery('(min-width: 768px)', true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const trigger = <IconButton icon={mdiLayersOutline} label="Display layers" />;
  if (wide)
    return (
      <Popover trigger={trigger} label="Display layers" align="start">
        <DisplayLayers {...props} />
      </Popover>
    );
  return (
    <>
      <IconButton
        icon={mdiLayersOutline}
        label="Display layers"
        onClick={() => setSheetOpen(true)}
      />
      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Display layers"
      >
        <DisplayLayers {...props} />
      </Sheet>
    </>
  );
};
