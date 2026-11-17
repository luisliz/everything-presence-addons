import {
  mdiCheck,
  mdiCrosshairsGps,
  mdiLock,
  mdiPaletteOutline,
  mdiRotateRightVariant,
  mdiVectorPolyline,
} from '@mdi/js';
import { type ReactNode, useState } from 'react';
import type { RoomConfig } from '../../../api/types';
import { FLOOR_MATERIALS } from '../../../components/FloorMaterials';
import {
  Badge,
  Button,
  cx,
  Field,
  Icon,
  Note,
  NumberField,
  Panel,
  Segmented,
} from '../../../components/primitives';
import { navigate } from '../../../router';
import { formatLengthLabel } from '../../../utils/lengthLabels';
import {
  areAllSegmentsLocked,
  countLockedObjects,
  isDevicePositionLocked,
} from '../../../utils/lockState';
import { isRoomCentered } from '../../../utils/roomCentering';
import {
  describeRotationScope,
  normalizeSignedAngle,
  type RotationScope,
} from '../../../utils/roomRotation';
import { DisplayLayers, type DisplayLayersProps } from '../DisplayLayers';
import { SNAP_STEPS_MM, snapLabel, type Units } from './units';
import type { LayoutEditor } from './useLayoutEditor';

export const LAYOUT_POSITION_ID = 'layout-position';

export const lockedObjectCount = (room: RoomConfig) =>
  countLockedObjects(room) +
  (isDevicePositionLocked(room.devicePlacement) ? 1 : 0);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 py-1 text-sm">
    <span className="text-fg-muted">{label}</span>
    <span className="flex items-center gap-1.5 tabular-nums text-fg">
      {children}
    </span>
  </div>
);

const Swatch = ({
  label,
  color,
  checked,
  onSelect,
}: {
  label: string;
  color?: string;
  checked: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={checked}
    aria-label={label}
    onClick={onSelect}
    className={cx(
      'relative flex h-12 items-end overflow-hidden rounded-lg border p-1 text-left text-[11px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
      checked ? 'border-accent ring-1 ring-accent' : 'border-line',
      !color && 'bg-surface-2',
    )}
    style={color ? { backgroundColor: color } : undefined}
  >
    <span className="rounded bg-surface/85 px-1 text-fg">{label}</span>
    {checked && (
      <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg">
        <Icon path={mdiCheck} size={16} />
      </span>
    )}
  </button>
);

export interface LayoutRoomPanelProps {
  editor: LayoutEditor;
  units: Units;
  setUnits: (units: Units) => void;
  layers: DisplayLayersProps;
}

export const LayoutRoomPanel = ({
  editor,
  units,
  setUnits,
  layers,
}: LayoutRoomPanelProps) => {
  const { room } = editor;
  const points = room.roomShell?.points ?? [];
  const [angle, setAngle] = useState(45);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const size = points.length
    ? `${formatLengthLabel(Math.max(...xs) - Math.min(...xs), units)} × ${formatLengthLabel(Math.max(...ys) - Math.min(...ys), units)}`
    : 'No walls';
  const locked = lockedObjectCount(room);
  const centered = isRoomCentered(room);
  const canRotate = points.length > 0;
  const pinnedNote = (verb: string) =>
    locked > 0 ? (
      <p className="text-xs text-warning-ink">
        {locked} locked {locked === 1 ? 'object' : 'objects'} will be {verb}{' '}
        too. Undo reverts it.
      </p>
    ) : null;

  return (
    <>
      <Panel variant="section" title="Room">
        {points.length === 0 && !editor.drawing.isDrawingWall ? (
          <Note
            tone="info"
            title="No walls yet"
            icon={mdiVectorPolyline}
            actions={
              <Button
                size="sm"
                icon={mdiVectorPolyline}
                onClick={() => editor.setTool('walls')}
              >
                Draw walls
              </Button>
            }
          >
            Draw the outline, or start from a shape in the toolbar.
          </Note>
        ) : (
          <>
            <Row label="Size">
              <output aria-label="Room size">{size}</output>
            </Row>
            <Row label="Walls">{points.length}</Row>
          </>
        )}
        {(areAllSegmentsLocked(room.roomShell) || locked > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {areAllSegmentsLocked(room.roomShell) && (
              <Badge tone="warning" icon={mdiLock}>
                Walls locked
              </Badge>
            )}
            {locked > 0 && <Badge>{locked} locked</Badge>}
          </div>
        )}
      </Panel>

      <Panel variant="section" title="Canvas">
        <div className="space-y-3">
          <Field
            label="Snap"
            layout="row"
            help="Rounds placed and moved points to this grid. Hold Alt to draw or drag corners off the grid."
          >
            <Segmented
              size="sm"
              ariaLabel="Snap"
              value={String(editor.snapGridMm)}
              onChange={(v) => editor.setSnapGridMm(Number(v))}
              options={SNAP_STEPS_MM.map((mm) => ({
                value: String(mm),
                label: snapLabel(mm, units),
              }))}
            />
          </Field>
          <Field
            label="Wall angle"
            layout="row"
            help="Constrains wall drags to 45° steps."
          >
            <Segmented
              size="sm"
              ariaLabel="Wall angle"
              value={editor.angleSnap ? '45' : 'free'}
              onChange={(v) => editor.setAngleSnap(v === '45')}
              options={[
                { value: '45', label: '45°' },
                { value: 'free', label: 'Free' },
              ]}
            />
          </Field>
          <Field
            label="Units"
            layout="row"
            help="Changes how lengths are shown. The room is stored in millimetres."
          >
            <Segmented
              size="sm"
              ariaLabel="Units"
              value={units}
              onChange={setUnits}
              options={[
                { value: 'metric', label: 'Metric' },
                { value: 'imperial', label: 'Imperial' },
              ]}
            />
          </Field>
        </div>
      </Panel>

      <Panel variant="section" title="Floor">
        <div className="space-y-3">
          <Field label="Fill" layout="row">
            <Segmented
              size="sm"
              ariaLabel="Floor fill"
              value={room.roomShellFillMode ?? 'overlay'}
              onChange={(roomShellFillMode) =>
                editor.commit({ ...room, roomShellFillMode })
              }
              options={[
                { value: 'overlay', label: 'Overlay' },
                { value: 'material', label: 'Material' },
              ]}
            />
          </Field>
          {room.roomShellFillMode === 'material' && (
            <fieldset className="grid grid-cols-3 gap-1.5">
              <legend className="sr-only">Floor material</legend>
              {Object.entries(FLOOR_MATERIALS).map(([id, material]) => (
                <Swatch
                  key={id}
                  label={material.label}
                  color={material.color}
                  checked={room.floorMaterial === id}
                  onSelect={() =>
                    editor.commit({
                      ...room,
                      floorMaterial: id as RoomConfig['floorMaterial'],
                    })
                  }
                />
              ))}
              <Swatch
                label="None"
                checked={(room.floorMaterial ?? 'none') === 'none'}
                onSelect={() =>
                  editor.commit({ ...room, floorMaterial: 'none' })
                }
              />
            </fieldset>
          )}
          <Button
            variant="ghost"
            size="sm"
            icon={mdiPaletteOutline}
            onClick={() => navigate({ name: 'settings', section: 'assets' })}
          >
            Manage custom materials
          </Button>
        </div>
      </Panel>

      <Panel variant="section" title="Position on grid" id={LAYOUT_POSITION_ID}>
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">
            Moves walls, doors, furniture and the sensor together so the room
            sits on (0,0). Saving a wall change does this automatically.
          </p>
          <Button
            size="sm"
            icon={mdiCrosshairsGps}
            disabled={!points.length || centered}
            onClick={() => editor.center()}
          >
            {centered && points.length
              ? 'Centred on (0,0)'
              : 'Centre room on origin'}
          </Button>
          {!centered && pinnedNote('moved')}
          <Field
            label="What a rotation moves"
            help="Keep sensor aiming swings the drawing around a fixed sensor; use it when targets show at the wrong angle."
          >
            <Segmented<RotationScope>
              size="sm"
              ariaLabel="What a rotation moves"
              value={editor.rotationScope}
              onChange={editor.setRotationScope}
              options={(['layout', 'roomOnly'] as const).map((scope) => ({
                value: scope,
                label: describeRotationScope(scope),
              }))}
            />
          </Field>
          <Field label="Custom angle" layout="row">
            <div className="flex items-center gap-2">
              <NumberField
                value={angle}
                onChange={setAngle}
                min={-180}
                max={180}
                step={1}
                unit="°"
                ariaLabel="Custom rotation angle"
              />
              <Button
                size="sm"
                icon={mdiRotateRightVariant}
                disabled={!canRotate || normalizeSignedAngle(angle) === 0}
                onClick={() => editor.rotate(angle)}
              >
                Rotate
              </Button>
            </div>
          </Field>
          {canRotate ? (
            pinnedNote('rotated')
          ) : (
            <p className="text-xs text-fg-muted">Draw a wall outline first.</p>
          )}
        </div>
      </Panel>

      <Panel variant="section" title="Display" collapsible defaultOpen={false}>
        <DisplayLayers {...layers} />
      </Panel>
    </>
  );
};
