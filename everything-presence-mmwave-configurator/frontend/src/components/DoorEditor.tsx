import {
  mdiCheck,
  mdiClose,
  mdiDeleteOutline,
  mdiDoor,
  mdiLockOpenVariantOutline,
  mdiLockOutline,
} from '@mdi/js';
import { type ReactNode, useId } from 'react';
import type { Door } from '../api/types';
import { DoorStyleIcon } from './DoorStyleIcon';
import {
  Button,
  cx,
  Field,
  Icon,
  IconButton,
  Note,
  NumberField,
} from './primitives';

export interface DoorValidation {
  overlaps: boolean;
  nearCorner: boolean;
  tooWide: boolean;
}

interface Choice<T> {
  value: T;
  label: string;
  description?: string;
  art: ReactNode;
}

const ChoiceGrid = <T extends string>({
  legend,
  hint,
  value,
  options,
  onChange,
}: {
  legend: string;
  hint?: string;
  value: T;
  options: Choice<T>[];
  onChange: (value: T) => void;
}) => {
  const hintId = useId();
  return (
    <fieldset aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-2 text-sm text-fg-muted">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={checked}
              aria-label={option.description ?? option.label}
              onClick={() => onChange(option.value)}
              className={cx(
                'relative flex flex-col items-center gap-1 rounded-lg border p-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed',
                checked
                  ? 'border-accent/60 bg-accent-tint font-medium text-accent-ink'
                  : 'border-line bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {checked && (
                <Icon
                  path={mdiCheck}
                  size={16}
                  className="absolute right-1.5 top-1.5"
                />
              )}
              {option.art}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs text-fg-muted">
          {hint}
        </p>
      )}
    </fieldset>
  );
};

const Opening = ({ children }: { children: ReactNode }) => (
  <svg className="h-10 w-10" fill="none" viewBox="0 0 48 48" aria-hidden="true">
    <rect
      x="3"
      y="21"
      width="42"
      height="24"
      fill="currentColor"
      opacity="0.1"
      rx="2"
    />
    <line
      x1="3"
      y1="20"
      x2="18"
      y2="20"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
    />
    <line
      x1="30"
      y1="20"
      x2="45"
      y2="20"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
    />
    {children}
  </svg>
);

const Arc = ({ d }: { d: string }) => (
  <path
    d={d}
    stroke="currentColor"
    strokeWidth="1.4"
    strokeOpacity="0.6"
    strokeDasharray="3 2"
    strokeLinecap="round"
  />
);

const swingArt = (inward: boolean) => {
  const panelY = inward ? 32 : 8;
  return (
    <Opening>
      <Arc d={`M30 20 A12 12 0 0 ${inward ? 1 : 0} 18 ${panelY}`} />
      <line
        x1="18"
        y1="20"
        x2="18"
        y2={panelY}
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="18" cy="20" r="2" fill="currentColor" />
    </Opening>
  );
};

const hingeArt = (left: boolean) => {
  const hingeX = left ? 18 : 30;
  return (
    <Opening>
      <Arc
        d={`M${left ? 30 : 18} 20 A12 12 0 0 ${left ? 1 : 0} ${hingeX} 32`}
      />
      <line
        x1={hingeX}
        y1="20"
        x2={hingeX}
        y2="32"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={hingeX} cy="20" r="2" fill="currentColor" />
    </Opening>
  );
};

const slideArt = (left: boolean) => {
  const [start, end] = left ? [18, 24] : [24, 30];
  const farJamb = left ? 30 : 18;
  return (
    <Opening>
      <line
        x1={left ? end : start}
        y1="26"
        x2={farJamb}
        y2="26"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeOpacity="0.6"
        strokeDasharray="3 2"
        strokeLinecap="round"
      />
      <line
        x1={start}
        y1="26"
        x2={end}
        y2="26"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx={farJamb} cy="26" r="2" fill="currentColor" />
    </Opening>
  );
};

const STYLES: Array<{ value: Door['style']; label: string }> = [
  { value: 'single', label: 'Hinged' },
  { value: 'double', label: 'Double' },
  { value: 'sliding', label: 'Sliding' },
  { value: 'opening', label: 'Opening' },
];

export interface DoorEditorBodyProps {
  door: Door;
  onChange: (door: Door) => void;
  /** Number of wall segments - 1. */
  maxSegmentIndex: number;
  validation?: DoorValidation | null;
}

/** Door fields without chrome; the Layout inspector and the wizard drawer both render it. */
export const DoorEditorBody = ({
  door,
  onChange,
  maxSegmentIndex,
  validation,
}: DoorEditorBodyProps) => {
  const wallId = useId();
  const positionId = useId();
  const style = door.style ?? 'single';
  const wide = style === 'sliding' || style === 'double';
  const set = (updates: Partial<Door>) => onChange({ ...door, ...updates });

  return (
    <div className="space-y-5">
      {validation?.overlaps && (
        <Note tone="warning" title="Overlaps another door">
          Move it along the wall so the two doors do not overlap.
        </Note>
      )}
      {validation?.nearCorner && (
        <Note tone="warning" title="Close to a corner">
          Consider moving it toward the middle of the wall.
        </Note>
      )}
      {validation?.tooWide && (
        <Note tone="danger" title="Wider than the wall allows">
          The door takes more than 90% of the wall. Make it narrower or pick a
          longer wall.
        </Note>
      )}

      <ChoiceGrid
        legend="Type"
        value={style}
        onChange={(value) => set({ style: value })}
        options={STYLES.map((option) => ({
          ...option,
          art: <DoorStyleIcon style={option.value} className="h-8 w-12" />,
        }))}
      />

      <Field label="Wall" htmlFor={wallId}>
        <select
          id={wallId}
          value={door.segmentIndex}
          onChange={(event) =>
            set({ segmentIndex: Number(event.target.value) })
          }
          className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent [@media(pointer:coarse)]:h-11"
        >
          {Array.from({ length: maxSegmentIndex + 1 }, (_, i) => (
            <option key={`wall-${i + 1}`} value={i}>
              Wall {i + 1}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Position along wall" htmlFor={positionId}>
        <div className="flex items-center gap-3">
          <input
            id={positionId}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={door.positionOnSegment}
            onChange={(event) =>
              set({ positionOnSegment: Number(event.target.value) })
            }
            className="w-full accent-accent"
          />
          <output
            htmlFor={positionId}
            className="w-10 text-right text-xs tabular-nums text-fg-muted"
          >
            {Math.round(door.positionOnSegment * 100)}%
          </output>
        </div>
      </Field>

      <Field
        label="Width"
        layout="row"
        help={
          wide
            ? 'Wide openings can be up to 3000 mm.'
            : 'A standard door is 800 to 900 mm.'
        }
      >
        <NumberField
          value={door.widthMm}
          onChange={(widthMm) => set({ widthMm })}
          min={600}
          max={wide ? 3000 : 1200}
          step={10}
          unit="mm"
          ariaLabel="Door width"
        />
      </Field>

      {(style === 'single' || style === 'double') && (
        <ChoiceGrid
          legend="Swing direction"
          hint="The shaded side is the room."
          value={door.swingDirection}
          onChange={(value) => set({ swingDirection: value })}
          options={[
            {
              value: 'in',
              label: 'Into room',
              description: 'Opens into the room',
              art: swingArt(true),
            },
            {
              value: 'out',
              label: 'Out of room',
              description: 'Opens away from the room',
              art: swingArt(false),
            },
          ]}
        />
      )}
      {style === 'single' && (
        <ChoiceGrid
          legend="Hinge side"
          hint="The dot marks the hinge."
          value={door.swingSide}
          onChange={(value) => set({ swingSide: value })}
          options={[
            {
              value: 'left',
              label: 'Left',
              description: 'Hinge on the left of the doorway',
              art: hingeArt(true),
            },
            {
              value: 'right',
              label: 'Right',
              description: 'Hinge on the right of the doorway',
              art: hingeArt(false),
            },
          ]}
        />
      )}
      {style === 'sliding' && (
        <ChoiceGrid
          legend="Slides toward"
          hint="The panel stows on this side of the opening."
          value={door.swingSide}
          onChange={(value) => set({ swingSide: value })}
          options={[
            {
              value: 'left',
              label: 'Left',
              description: 'Panel slides to the left half',
              art: slideArt(true),
            },
            {
              value: 'right',
              label: 'Right',
              description: 'Panel slides to the right half',
              art: slideArt(false),
            },
          ]}
        />
      )}
    </div>
  );
};

interface DoorEditorProps extends DoorEditorBodyProps {
  onDelete: () => void;
  onClose?: () => void;
  onToggleLock?: () => void;
}

/** Right-hand drawer used by the setup wizard. */
export const DoorEditor = ({
  onDelete,
  onClose,
  onToggleLock,
  ...body
}: DoorEditorProps) => {
  const locked = Boolean(body.door.locked);
  return (
    <aside
      aria-label="Door"
      className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-line bg-surface shadow-e2"
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <Icon path={mdiDoor} className="text-fg-muted" />
        <h2 className="flex-1 text-sm font-semibold text-fg">Door</h2>
        {onToggleLock && (
          <IconButton
            icon={locked ? mdiLockOutline : mdiLockOpenVariantOutline}
            label={locked ? 'Unlock door' : 'Lock door'}
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
            This door is locked. Unlock it to move, resize or delete it.
          </Note>
        )}
        <fieldset disabled={locked} className="min-w-0 disabled:opacity-50">
          <DoorEditorBody {...body} />
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
          Delete door
        </Button>
      </footer>
    </aside>
  );
};
