import { useId } from 'react';
import type { FurnitureInstance } from '../api/types';
import { getFurnitureType } from '../furniture/catalog';
import { Field, NumberField, Toggle } from './primitives';

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
