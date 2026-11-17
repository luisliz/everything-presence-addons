import { mdiCheck } from '@mdi/js';
import {
  cloneElement,
  type KeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from './cx';
import { Icon } from './Icon';
import {
  focusableWithin,
  useAnchoredPosition,
  useEscape,
  useOutsidePress,
} from './layer';

export interface MenuItem {
  label: string;
  icon?: string;
  onSelect: () => void;
  danger?: boolean;
  checked?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  trigger: ReactElement;
  items: MenuItem[];
  align?: 'start' | 'end';
  label?: string;
}

export const Menu = ({ trigger, items, align = 'end', label }: MenuProps) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const refs = useMemo(() => [anchorRef, menuRef], []);
  const menuId = useId();
  const position = useAnchoredPosition(open, anchorRef, menuRef, align);
  const close = useCallback(() => setOpen(false), []);
  const closeAndRefocus = useCallback(() => {
    setOpen(false);
    focusableWithin(anchorRef.current as HTMLElement)[0]?.focus();
  }, []);

  useOutsidePress(open, refs, close);
  useEscape(open, closeAndRefocus);

  useEffect(() => {
    if (open && position)
      menuRef.current
        ?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
        ?.focus();
  }, [open, position]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([disabled])',
      ) ?? []),
    ];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    const target =
      event.key === 'ArrowDown'
        ? entries[(index + 1) % entries.length]
        : event.key === 'ArrowUp'
          ? entries[(index - 1 + entries.length) % entries.length]
          : event.key === 'Home'
            ? entries[0]
            : event.key === 'End'
              ? entries[entries.length - 1]
              : null;
    if (target) {
      event.preventDefault();
      target.focus();
    }
    if (event.key === 'Tab') close();
  };

  return (
    <>
      <span ref={anchorRef} className="inline-flex">
        {cloneElement(trigger, {
          'aria-haspopup': 'menu',
          'aria-expanded': open,
          'aria-controls': open ? menuId : undefined,
          onClick: () => setOpen((value) => !value),
        })}
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{
              left: position?.left ?? -9999,
              top: position?.top ?? -9999,
            }}
            className="fixed z-[110] min-w-[12rem] rounded-xl border border-line bg-surface p-1 shadow-e2"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                {...(item.checked === undefined
                  ? { role: 'menuitem' }
                  : { role: 'menuitemcheckbox', 'aria-checked': item.checked })}
                disabled={item.disabled}
                onClick={() => {
                  closeAndRefocus();
                  item.onSelect();
                }}
                className={cx(
                  'flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm focus:outline-none focus-visible:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 [@media(pointer:coarse)]:h-11',
                  item.danger
                    ? 'text-danger-ink hover:bg-danger-tint'
                    : 'text-fg hover:bg-surface-2',
                )}
              >
                {item.icon && (
                  <Icon
                    path={item.icon}
                    size={20}
                    className={item.danger ? undefined : 'text-fg-muted'}
                  />
                )}
                <span className="flex-1">{item.label}</span>
                {item.checked && (
                  <Icon path={mdiCheck} size={16} className="text-accent-ink" />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
};
