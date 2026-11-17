import { mdiCheck } from '@mdi/js';
import { useState } from 'react';
import type { FurnitureType } from '../api/types';
import {
  getAllFurnitureByCategory,
  getFurnitureCategories,
} from '../furniture/catalog';
import {
  CustomFurniturePreview,
  getCustomFurnitureType,
} from '../furniture/customVisual';
import { getFurnitureIcon } from '../furniture/icons';
import { useCustomAssets } from '../hooks/useCustomAssets';
import { cx, Icon, Sheet } from './primitives';

interface FurnitureLibraryProps {
  onSelect: (furnitureType: FurnitureType) => void;
  onClose: () => void;
}

export const FurnitureLibrary = ({
  onSelect,
  onClose,
}: FurnitureLibraryProps) => {
  const [category, setCategory] = useState('all');
  const { customFurniture } = useCustomAssets();
  const items = getAllFurnitureByCategory(category, customFurniture);

  return (
    <Sheet
      open
      onClose={onClose}
      variant="side"
      title="Furniture"
      description="Pick an item to place it in the room."
    >
      <fieldset className="-mx-1 mb-3 flex flex-wrap gap-1.5">
        <legend className="sr-only">Category</legend>
        {getFurnitureCategories().map((cat) => {
          const checked = cat.id === category;
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={checked}
              onClick={() => setCategory(cat.id)}
              className={cx(
                'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [@media(pointer:coarse)]:h-11',
                checked
                  ? 'border-accent/60 bg-accent-tint font-medium text-accent-ink'
                  : 'border-line text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {checked && <Icon path={mdiCheck} size={16} />}
              {cat.label}
            </button>
          );
        })}
      </fieldset>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const TypeIcon = getFurnitureIcon(item.id);
          const custom = getCustomFurnitureType(customFurniture, item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="group flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-3 text-center transition-colors hover:border-accent/60 hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span className="flex h-12 w-12 items-center justify-center text-fg-muted group-hover:text-accent-ink">
                {TypeIcon ? (
                  <TypeIcon className="h-full w-full" />
                ) : custom ? (
                  <CustomFurniturePreview
                    furniture={custom}
                    className="h-full w-full"
                  />
                ) : (
                  <span className="text-xs text-fg-subtle">Item</span>
                )}
              </span>
              <span className="text-sm font-medium text-fg">{item.label}</span>
              <span className="text-xs tabular-nums text-fg-muted">
                {(item.defaultWidth / 1000).toFixed(1)} ×{' '}
                {(item.defaultDepth / 1000).toFixed(1)} m
              </span>
            </button>
          );
        })}
      </div>
      {items.length === 0 && (
        <p className="py-10 text-center text-sm text-fg-muted">
          No furniture in this category.
        </p>
      )}
    </Sheet>
  );
};
