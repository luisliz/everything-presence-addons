import { mdiVectorPolyline } from '@mdi/js';
import {
  createLShapePoints,
  createRectanglePoints,
  type RoomShapePoint,
} from '../utils/roomShapes';
import { Button, cx, Icon } from './primitives';

export type BasicRoomShapeKind = 'rectangle' | 'l-shape';

export interface BasicRoomShapeSelection {
  kind: BasicRoomShapeKind;
  width: number;
  length: number;
  cutoutWidth: number;
  cutoutLength: number;
}

interface BasicRoomShapesPickerProps {
  units: 'metric' | 'imperial';
  onApply: (
    points: RoomShapePoint[],
    selection: BasicRoomShapeSelection,
  ) => void;
  onDrawOwn: () => void;
  onCancel?: () => void;
  /** Popover body without the card, title and close button. */
  compact?: boolean;
}

const pointsForSelection = (selection: BasicRoomShapeSelection) =>
  selection.kind === 'rectangle'
    ? createRectanglePoints(selection)
    : createLShapePoints(selection);

export const resizeBasicRoomShapeWall = (
  selection: BasicRoomShapeSelection,
  segmentIndex: number,
  length: number,
): { points: RoomShapePoint[]; selection: BasicRoomShapeSelection } => {
  const next = { ...selection };
  if (selection.kind === 'rectangle') {
    if (segmentIndex === 0 || segmentIndex === 2) next.width = length;
    else next.length = length;
  } else {
    if (segmentIndex === 0) next.width = length;
    else if (segmentIndex === 1) next.length = length + selection.cutoutLength;
    else if (segmentIndex === 2) next.cutoutWidth = length;
    else if (segmentIndex === 3) next.cutoutLength = length;
    else if (segmentIndex === 4) next.width = length + selection.cutoutWidth;
    else next.length = length;
  }
  return { selection: next, points: pointsForSelection(next) };
};

const SHAPES: Array<{
  kind: BasicRoomShapeKind;
  label: string;
  detail: string;
  path: string;
}> = [
  {
    kind: 'rectangle',
    label: 'Rectangle',
    detail: 'Four straight sides.',
    path: 'M 25 20 H 135 V 90 H 25 Z',
  },
  {
    kind: 'l-shape',
    label: 'L-shaped room',
    detail: 'One corner cut out.',
    path: 'M 20 15 H 140 V 65 H 90 V 95 H 20 Z',
  },
];

const tile =
  'flex flex-col gap-1 rounded-xl border border-line bg-surface p-3 text-left transition-colors hover:border-accent/60 hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

export const BasicRoomShapesPicker = ({
  units,
  onApply,
  onDrawOwn,
  onCancel,
  compact = false,
}: BasicRoomShapesPickerProps) => {
  const scale = units === 'metric' ? 1000 : 304.8;
  const choose = (kind: BasicRoomShapeKind) => {
    const selection: BasicRoomShapeSelection = {
      kind,
      width: 4 * scale,
      length: 4 * scale,
      cutoutWidth: 1.5 * scale,
      cutoutLength: 1.5 * scale,
    };
    onApply(pointsForSelection(selection), selection);
  };
  const grid = (
    <div
      className={cx(
        'grid gap-2',
        compact ? 'w-72 grid-cols-2' : 'sm:grid-cols-3',
      )}
    >
      {SHAPES.map((shape) => (
        <button
          key={shape.kind}
          type="button"
          onClick={() => choose(shape.kind)}
          className={tile}
        >
          <svg
            viewBox="0 0 160 110"
            className={compact ? 'h-14 w-full' : 'h-24 w-full'}
            aria-hidden="true"
          >
            <path
              d={shape.path}
              strokeWidth="4"
              strokeLinejoin="round"
              className="fill-accent/15 stroke-accent"
            />
          </svg>
          <span className="text-sm font-medium text-fg">{shape.label}</span>
          <span className="text-xs text-fg-muted">{shape.detail}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={onDrawOwn}
        className={cx(
          tile,
          compact && 'col-span-2 flex-row items-center gap-3',
        )}
      >
        <Icon path={mdiVectorPolyline} size={24} className="text-fg-muted" />
        <span>
          <span className="block text-sm font-medium text-fg">Draw my own</span>
          <span className="block text-xs text-fg-muted">
            Place each corner yourself.
          </span>
        </span>
      </button>
    </div>
  );
  if (compact) return grid;
  return (
    <div className="w-full max-w-3xl rounded-2xl border border-line bg-surface p-5 shadow-e2 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-fg">
            Choose your room shape
          </h2>
          <p className="mt-1 text-sm text-fg-muted">
            Pick a shape to place it on the canvas, then adjust its wall lengths
            there.
          </p>
        </div>
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Close
          </Button>
        )}
      </div>
      {grid}
    </div>
  );
};
