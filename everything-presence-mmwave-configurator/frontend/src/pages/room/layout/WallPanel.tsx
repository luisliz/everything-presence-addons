import { mdiCallSplit, mdiDeleteOutline, mdiMinus, mdiPlus } from '@mdi/js';
import {
  Button,
  Field,
  IconButton,
  Note,
  NumberField,
  Panel,
  Toggle,
} from '../../../components/primitives';
import { formatLengthLabel } from '../../../utils/lengthLabels';
import { isSegmentLocked, isShellLocked } from '../../../utils/lockState';
import { fromUnits, lengthUnit, nudgeMm, toUnits, type Units } from './units';
import type { LayoutEditor } from './useLayoutEditor';

const OFFSET_MM = 100;

export interface WallPanelProps {
  editor: LayoutEditor;
  index: number;
  units: Units;
}

export const WallPanel = ({ editor, index, units }: WallPanelProps) => {
  const { room } = editor;
  const points = room.roomShell?.points ?? [];
  const a = points[index];
  const b = points[(index + 1) % points.length];
  if (!a || !b) return null;
  const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
  const locked = isSegmentLocked(room.roomShell, index);
  const shellLocked = isShellLocked(room.roomShell);
  const totalInches = Math.round(lengthMm / 25.4);
  const nudge = nudgeMm(units);
  const nudgeLabel = formatLengthLabel(nudge, units);
  const offsetLabel = formatLengthLabel(OFFSET_MM, units);

  return (
    <>
      <Panel variant="section" title="Wall">
        <div className="space-y-3">
          {locked && (
            <Note tone="warning">
              This wall is locked. Unlock it to move or split it.
            </Note>
          )}
          <fieldset
            disabled={locked}
            className="min-w-0 space-y-3 disabled:opacity-50"
          >
            <Field label="Length" layout={units === 'metric' ? 'row' : 'stack'}>
              <div className="flex items-center justify-end gap-1">
                <IconButton
                  icon={mdiMinus}
                  label={`Shorten by ${nudgeLabel}`}
                  size="sm"
                  onClick={() => editor.setWallLength(index, lengthMm - nudge)}
                />
                {units === 'metric' ? (
                  <NumberField
                    value={toUnits(lengthMm, units)}
                    onChange={(m) =>
                      editor.setWallLength(index, fromUnits(m, units))
                    }
                    min={0.1}
                    step={0.01}
                    unit={lengthUnit(units)}
                    ariaLabel="Wall length"
                  />
                ) : (
                  <>
                    <NumberField
                      value={Math.floor(totalInches / 12)}
                      onChange={(ft) =>
                        editor.setWallLength(
                          index,
                          (ft * 12 + (totalInches % 12)) * 25.4,
                        )
                      }
                      min={0}
                      step={1}
                      unit="ft"
                      ariaLabel="Wall length, feet"
                      className="[&_input]:w-20"
                    />
                    <NumberField
                      value={totalInches % 12}
                      onChange={(inch) =>
                        editor.setWallLength(
                          index,
                          (Math.floor(totalInches / 12) * 12 + inch) * 25.4,
                        )
                      }
                      min={0}
                      max={11.9}
                      step={0.1}
                      unit="in"
                      ariaLabel="Wall length, inches"
                      className="[&_input]:w-20"
                    />
                  </>
                )}
                <IconButton
                  icon={mdiPlus}
                  label={`Lengthen by ${nudgeLabel}`}
                  size="sm"
                  onClick={() => editor.setWallLength(index, lengthMm + nudge)}
                />
              </div>
            </Field>
            <Field
              label="Offset"
              layout="row"
              help="Slides the wall sideways, keeping its length."
            >
              <div className="flex gap-1">
                <Button
                  size="sm"
                  onClick={() => editor.offsetWall(index, -OFFSET_MM)}
                >
                  −{offsetLabel}
                </Button>
                <Button
                  size="sm"
                  onClick={() => editor.offsetWall(index, OFFSET_MM)}
                >
                  +{offsetLabel}
                </Button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                icon={mdiCallSplit}
                onClick={() => editor.splitWall(index)}
              >
                Split wall
              </Button>
              <Button
                size="sm"
                icon={mdiDeleteOutline}
                className="text-danger-ink"
                disabled={points.length <= 2}
                onClick={() => editor.deleteWallPoint(index)}
              >
                Delete end point
              </Button>
            </div>
            <p className="text-xs text-fg-muted">
              Shift+click a wall on the canvas to split it there.
            </p>
          </fieldset>
        </div>
      </Panel>
      <Panel variant="section" title="Lock">
        <Toggle
          label="Lock this wall"
          description="A locked wall cannot be moved, split or deleted."
          checked={locked}
          onChange={() => editor.toggleWallLock(index)}
        />
        <Toggle
          label="Lock whole room"
          checked={shellLocked}
          onChange={editor.setShellLock}
        />
      </Panel>
    </>
  );
};
