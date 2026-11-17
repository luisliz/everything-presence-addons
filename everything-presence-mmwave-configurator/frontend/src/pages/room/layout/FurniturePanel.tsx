import { mdiDeleteOutline } from '@mdi/js';
import type { FurnitureInstance } from '../../../api/types';
import { FurnitureEditorBody } from '../../../components/FurnitureEditor';
import { Button, Note, Panel, Toggle } from '../../../components/primitives';
import type { LayoutEditor } from './useLayoutEditor';

export interface FurniturePanelProps {
  editor: LayoutEditor;
  furniture: FurnitureInstance;
}

export const FurniturePanel = ({ editor, furniture }: FurniturePanelProps) => {
  const locked = Boolean(furniture.locked);
  return (
    <>
      <Panel variant="section" title="Placement and size">
        {locked && (
          <Note tone="warning" className="mb-3">
            This item is locked. Unlock it to move, resize or delete it.
          </Note>
        )}
        <fieldset disabled={locked} className="min-w-0 disabled:opacity-50">
          <FurnitureEditorBody
            furniture={furniture}
            onChange={editor.changeFurniture}
          />
        </fieldset>
      </Panel>
      <Panel variant="section" title="Lock">
        <Toggle
          label="Lock this item"
          description="A locked item cannot be dragged, resized or deleted."
          checked={locked}
          onChange={() => editor.toggleItemLock('furniture', furniture.id)}
        />
        <Button
          icon={mdiDeleteOutline}
          disabled={locked}
          onClick={() => editor.deleteFurniture(furniture.id)}
          className="mt-3 w-full text-danger-ink"
        >
          Delete furniture
        </Button>
      </Panel>
    </>
  );
};
