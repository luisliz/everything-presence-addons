import { mdiAlertOutline, mdiVectorPolygon, mdiVectorRectangle } from '@mdi/js';
import { useState } from 'react';
import {
  ConfirmDialog,
  Icon,
  InfoTrigger,
  Panel,
  Segmented,
} from '../../../components/primitives';
import type { ZonesEditor } from './useZonesEditor';

type Shape = 'rect' | 'polygon';

export const ZoneShapeSection = ({ editor }: { editor: ZonesEditor }) => {
  const [confirming, setConfirming] = useState(false);
  const { shapeStatus, polygonMode, switching } = editor;
  if (!shapeStatus.supported) return null;
  const value: Shape = polygonMode ? 'polygon' : 'rect';
  const target: Shape = polygonMode ? 'rect' : 'polygon';
  const polygonsMissing =
    !polygonMode && editor.polygonZonesAvailable === false;

  return (
    <Panel
      variant="section"
      title="Zone shape"
      actions={
        <InfoTrigger
          label="About zone shape"
          content="Switches which saved zone set the device uses for detection. Zones in the other shape stay saved on the device."
        />
      }
    >
      {shapeStatus.controllable === false ? (
        <p className="text-sm text-fg-muted">
          Polygons. This firmware only supports polygon zones.
        </p>
      ) : (
        <Segmented<Shape>
          ariaLabel="Zone shape"
          value={value}
          onChange={() => setConfirming(true)}
          busyValue={switching ? target : undefined}
          options={[
            { value: 'rect', label: 'Rectangles', icon: mdiVectorRectangle },
            {
              value: 'polygon',
              label: 'Polygons',
              icon: mdiVectorPolygon,
              disabled: polygonsMissing,
              tooltip: polygonsMissing
                ? 'Polygon zones need a firmware update on this device'
                : undefined,
            },
          ]}
        />
      )}
      <ConfirmDialog
        open={confirming}
        title="Switch the zone shape?"
        body={
          <span className="flex gap-3">
            <Icon
              path={mdiAlertOutline}
              size={24}
              className="shrink-0 text-warning-ink"
            />
            <span>
              The device switches from{' '}
              {polygonMode
                ? 'polygon zones to rectangle zones'
                : 'rectangle zones to polygon zones'}{' '}
              for detection. Your {polygonMode ? 'polygon' : 'rectangle'} zones
              stay saved on the device.
              {editor.dirtyCount > 0 &&
                ` Your ${editor.dirtyCount} unsaved zone change${editor.dirtyCount === 1 ? '' : 's'} will be discarded.`}
            </span>
          </span>
        }
        tone={editor.dirtyCount > 0 ? 'danger' : 'default'}
        confirmLabel={
          editor.dirtyCount > 0
            ? 'Discard and switch'
            : `Switch to ${polygonMode ? 'rectangles' : 'polygons'}`
        }
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          void editor.switchShape();
        }}
      />
    </Panel>
  );
};
