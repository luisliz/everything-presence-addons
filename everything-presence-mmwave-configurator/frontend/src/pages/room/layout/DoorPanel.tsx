import { mdiDeleteOutline } from '@mdi/js';
import type { Door } from '../../../api/types';
import { DoorEditorBody } from '../../../components/DoorEditor';
import { Button, Note, Panel, Toggle } from '../../../components/primitives';
import { doorIssues, type LayoutEditor } from './useLayoutEditor';

export interface DoorPanelProps {
  editor: LayoutEditor;
  door: Door;
}

export const DoorPanel = ({ editor, door }: DoorPanelProps) => {
  const locked = Boolean(door.locked);
  return (
    <>
      <Panel variant="section" title="Door">
        {locked && (
          <Note tone="warning" className="mb-3">
            This door is locked. Unlock it to move, resize or delete it.
          </Note>
        )}
        <fieldset disabled={locked} className="min-w-0 disabled:opacity-50">
          <DoorEditorBody
            door={door}
            onChange={editor.changeDoor}
            maxSegmentIndex={Math.max(
              0,
              (editor.room.roomShell?.points?.length ?? 1) - 1,
            )}
            validation={doorIssues(door, editor.room)}
          />
        </fieldset>
      </Panel>
      <Panel variant="section" title="Lock">
        <Toggle
          label="Lock this door"
          description="A locked door cannot be dragged or deleted."
          checked={locked}
          onChange={() => editor.toggleItemLock('doors', door.id)}
        />
        <Button
          icon={mdiDeleteOutline}
          disabled={locked}
          onClick={() => editor.deleteDoor(door.id)}
          className="mt-3 w-full text-danger-ink"
        >
          Delete door
        </Button>
      </Panel>
    </>
  );
};
