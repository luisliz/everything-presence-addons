import type { ReactNode } from 'react';
import { useAppData } from '../../contexts/AppDataContext';
import {
  leaveDecision,
  navigate,
  type Route,
  usePendingLeave,
} from '../../router';
import { ConfirmDialog } from '../primitives';
import { BottomBar } from './BottomBar';
import { Rail } from './Rail';
import { Sidebar } from './Sidebar';
import { type Presence, TopBar } from './TopBar';

export interface AppShellProps {
  route: Route;
  /** Room the phone bottom bar opens from non-room screens. */
  lastRoomId: string | null;
  presence: Presence | null;
  onAddDevice: () => void;
  children: ReactNode;
}

const LeaveGuardDialog = () => {
  const pending = usePendingLeave();
  return (
    <ConfirmDialog
      open={pending !== null}
      title={pending?.guard.title ?? 'Unsaved changes'}
      body={pending?.guard.message}
      cancelLabel="Stay"
      confirmLabel={
        pending?.guard.onSave ? 'Save and leave' : 'Discard and leave'
      }
      tone={pending?.guard.onSave ? 'default' : 'danger'}
      secondary={
        pending?.guard.onSave
          ? {
              label: 'Discard',
              onSelect: leaveDecision.discard,
              tone: 'danger',
            }
          : undefined
      }
      onConfirm={() =>
        pending?.guard.onSave
          ? void leaveDecision.save()
          : leaveDecision.discard()
      }
      onCancel={leaveDecision.stay}
      busy={pending?.saving}
    />
  );
};

export const AppShell = ({
  route,
  lastRoomId,
  presence,
  onAddDevice,
  children,
}: AppShellProps) => {
  const { appVersion } = useAppData();
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-fg">
      <Sidebar
        route={route}
        appVersion={appVersion}
        onAddDevice={onAddDevice}
      />
      <Rail route={route} onAddDevice={onAddDevice} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          route={route}
          presence={presence}
          onAddDevice={onAddDevice}
          onNavigate={navigate}
        />
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
        <BottomBar
          route={route}
          roomId={route.name === 'room' ? route.roomId : lastRoomId}
        />
      </div>
      <LeaveGuardDialog />
    </div>
  );
};
