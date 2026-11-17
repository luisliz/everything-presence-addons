import {
  mdiClose,
  mdiDeleteOutline,
  mdiLockOpenVariantOutline,
  mdiLockOutline,
  mdiSofaOutline,
} from '@mdi/js';
import { useId } from 'react';
import type { FurnitureInstance } from '../api/types';
import { getFurnitureType } from '../furniture/catalog';
import { getFurnitureIcon } from '../furniture/icons';
import {
  Button,
  Field,
  Icon,
  IconButton,
  Note,
  NumberField,
  Toggle,
} from './primitives';

export const furnitureLabel = (furniture: FurnitureInstance) =>
  getFurnitureType(furniture.typeId)?.label ?? 'Furniture';

export interface FurnitureEditorBodyProps {
  furniture: FurnitureInstance;
  onChange: (furniture: FurnitureInstance) => void;
}

/** Furniture fields without chrome; the Layout inspector and the wizard drawer both render it. */
export const FurnitureEditorBody = ({
  furniture,
  onChange,
}: FurnitureEditorBodyProps) => {
  const rotationId = useId();
  const type = getFurnitureType(furniture.typeId);
  const set = (updates: Partial<FurnitureInstance>) =>
    onChange({ ...furniture, ...updates });
  const ratio =
    furniture.aspectRatioLocked && type
      ? type.defaultWidth / type.defaultDepth
      : null;
  const meters = (
    label: string,
    value: number,
    onValue: (mm: number) => void,
    min?: number,
  ) => (
    <Field label={label} layout="row">
      <NumberField
        value={value / 1000}
        onChange={(m) => onValue(m * 1000)}
        min={min}
        step={0.01}
        unit="m"
        ariaLabel={label}
      />
    </Field>
  );

  return (
    <div className="space-y-3">
      {meters('X', furniture.x, (x) => set({ x }))}
      {meters('Y', furniture.y, (y) => set({ y }))}
      {meters(
        'Width',
        furniture.width,
        (width) => set(ratio ? { width, depth: width / ratio } : { width }),
        0.1,
      )}
      {meters(
        'Depth',
        furniture.depth,
        (depth) => set(ratio ? { depth, width: depth * ratio } : { depth }),
        0.1,
      )}
      <Field
        label="Height"
        layout="row"
        help="For reference only; the plan is 2D."
      >
        <span className="text-sm tabular-nums text-fg-muted">
          {(furniture.height / 1000).toFixed(2)} m
        </span>
      </Field>
      <Toggle
        label="Keep proportions"
        checked={furniture.aspectRatioLocked}
        onChange={(aspectRatioLocked) => set({ aspectRatioLocked })}
      />
      <Field label="Rotation" htmlFor={rotationId}>
        <div className="flex items-center gap-3">
          <input
            id={rotationId}
            type="range"
            min={0}
            max={360}
            value={furniture.rotationDeg}
            onChange={(event) =>
              set({ rotationDeg: Number(event.target.value) })
            }
            className="w-full accent-accent"
          />
          <NumberField
            value={Math.round(furniture.rotationDeg)}
            onChange={(rotationDeg) => set({ rotationDeg })}
            min={0}
            max={360}
            step={1}
            unit="°"
            ariaLabel="Rotation"
          />
        </div>
      </Field>
    </div>
  );
};

interface FurnitureEditorProps extends FurnitureEditorBodyProps {
  onDelete: () => void;
  onClose?: () => void;
  onToggleLock?: () => void;
}

/** Right-hand drawer used by the setup wizard. */
export const FurnitureEditor = ({
  onDelete,
  onClose,
  onToggleLock,
  ...body
}: FurnitureEditorProps) => {
  const locked = Boolean(body.furniture.locked);
  const TypeIcon = getFurnitureIcon(body.furniture.typeId);
  return (
    <aside
      aria-label={furnitureLabel(body.furniture)}
      className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-line bg-surface shadow-e2"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        {TypeIcon ? (
          <TypeIcon className="h-5 w-5 text-fg-muted" />
        ) : (
          <Icon path={mdiSofaOutline} className="text-fg-muted" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {furnitureLabel(body.furniture)}
        </h2>
        {onToggleLock && (
          <IconButton
            icon={locked ? mdiLockOutline : mdiLockOpenVariantOutline}
            label={locked ? 'Unlock furniture' : 'Lock furniture'}
            pressed={locked}
            size="sm"
            onClick={onToggleLock}
          />
        )}
        {onClose && (
          <IconButton
            icon={mdiClose}
            label="Close"
            size="sm"
            onClick={onClose}
          />
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {locked && (
          <Note tone="warning">
            This item is locked. Unlock it to move, resize or delete it.
          </Note>
        )}
        <fieldset disabled={locked} className="min-w-0 disabled:opacity-50">
          <FurnitureEditorBody {...body} />
        </fieldset>
      </div>
      <footer className="border-t border-line p-3">
        <Button
          variant="secondary"
          icon={mdiDeleteOutline}
          disabled={locked}
          onClick={onDelete}
          className="w-full text-danger-ink"
        >
          Delete furniture
        </Button>
      </footer>
    </aside>
  );
};
