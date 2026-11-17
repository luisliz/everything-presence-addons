import {
  mdiAlertCircleOutline,
  mdiAlertOutline,
  mdiCheckCircleOutline,
  mdiClose,
  mdiInformationOutline,
} from '@mdi/js';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

interface ToastEntry {
  id: number;
  message: ReactNode;
  tone: ToastTone;
}

interface ToastApi {
  show: (
    message: ReactNode,
    options?: { tone?: ToastTone; durationMs?: number },
  ) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE = {
  info: { icon: mdiInformationOutline, ink: 'text-accent-ink' },
  success: { icon: mdiCheckCircleOutline, ink: 'text-success-ink' },
  warning: { icon: mdiAlertOutline, ink: 'text-warning-ink' },
  danger: { icon: mdiAlertCircleOutline, ink: 'text-danger-ink' },
};

const MAX_VISIBLE = 3;

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback(
    (id: number) =>
      setToasts((list) => list.filter((toast) => toast.id !== id)),
    [],
  );

  const show = useCallback<ToastApi['show']>(
    (message, { tone = 'info', durationMs = 5000 } = {}) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((list) => [...list, { id, message, tone }].slice(-MAX_VISIBLE));
      if (durationMs > 0) window.setTimeout(() => dismiss(id), durationMs);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <section
          aria-label="Notifications"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 top-16 z-[125] flex flex-col items-center gap-2 px-4 md:bottom-6 md:top-auto"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto flex w-full max-w-md items-center gap-2.5 rounded-xl border border-line bg-surface-2 py-2 pl-3 pr-1.5 text-sm text-fg shadow-e2"
            >
              <Icon
                path={TONE[toast.tone].icon}
                size={20}
                className={cx(TONE[toast.tone].ink)}
              />
              <div className="min-w-0 flex-1">{toast.message}</div>
              <IconButton
                icon={mdiClose}
                label="Dismiss"
                size="sm"
                tooltip={false}
                onClick={() => dismiss(toast.id)}
              />
            </div>
          ))}
        </section>,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
