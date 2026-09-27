import * as React from 'react';
import { createPortal } from 'react-dom';
import { type ContextMenuState, isDivider } from '@/hooks/useMacContextMenu';

interface MacContextMenuPortalProps {
  state: ContextMenuState;
  onClose: () => void;
}

export function MacContextMenuPortal({ state, onClose }: MacContextMenuPortalProps) {
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ x: state.x, y: state.y });
  const [focusedIndex, setFocusedIndex] = React.useState<number>(-1);

  const actionableIndices = React.useMemo(() => {
    return state.entries
      .map((entry, idx) => (!isDivider(entry) && !entry.disabled ? idx : null))
      .filter((idx): idx is number => idx !== null);
  }, [state.entries]);

  // Reset focus whenever menu opens
  React.useEffect(() => {
    if (state.isOpen) {
      setFocusedIndex(-1);
    }
  }, [state.isOpen]);

  // Clamp position to viewport once rendered
  React.useLayoutEffect(() => {
    if (!state.isOpen || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const padding = 8;
    let clampedX = state.x;
    let clampedY = state.y;

    if (clampedX + rect.width > window.innerWidth - padding) {
      clampedX = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (clampedY + rect.height > window.innerHeight - padding) {
      clampedY = Math.max(padding, window.innerHeight - rect.height - padding);
    }

    setPosition({ x: clampedX, y: clampedY });
  }, [state.isOpen, state.x, state.y]);

  // Handle dismiss interactions & keyboard navigation
  React.useEffect(() => {
    if (!state.isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (actionableIndices.length === 0) return;
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos = (currentPos + 1) % actionableIndices.length;
          return actionableIndices[nextPos];
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (actionableIndices.length === 0) return;
        setFocusedIndex((prev) => {
          const currentPos = actionableIndices.indexOf(prev);
          const nextPos = (currentPos - 1 + actionableIndices.length) % actionableIndices.length;
          return actionableIndices[nextPos];
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (focusedIndex >= 0 && focusedIndex < state.entries.length) {
          const item = state.entries[focusedIndex];
          if (!isDivider(item) && !item.disabled) {
            e.preventDefault();
            item.onClick();
            onClose();
          }
        }
      }
    };

    const handleScrollOrResize = () => {
      onClose();
    };

    // Capture phase ensures we close before other clicks trigger
    document.addEventListener('mousedown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [state.isOpen, onClose, actionableIndices, focusedIndex, state.entries]);

  if (!state.isOpen) return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
      className="macos-context-menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {state.entries.map((entry, index) => {
        if (isDivider(entry)) {
          return (
            <div key={`divider-${index}`} className="macos-context-menu-divider" role="separator" />
          );
        }

        const Icon = entry.icon;
        const isFocused = focusedIndex === index;

        return (
          <button
            key={entry.id}
            role="menuitem"
            disabled={entry.disabled}
            onMouseEnter={() => setFocusedIndex(index)}
            onClick={() => {
              entry.onClick();
              onClose();
            }}
            className={`macos-context-menu-item group w-full text-left ${
              entry.destructive ? 'destructive' : ''
            } ${entry.disabled ? 'pointer-events-none opacity-40' : ''} ${
              isFocused
                ? entry.destructive
                  ? 'bg-destructive text-white'
                  : 'bg-primary text-white'
                : ''
            }`}
          >
            <div className="flex items-center gap-2">
              {Icon && (
                <Icon
                  className={`size-3.5 shrink-0 ${
                    isFocused ? 'text-white' : 'text-muted-foreground group-hover:text-white'
                  }`}
                />
              )}
              <span>{entry.label}</span>
            </div>
            {entry.shortcut && (
              <span
                className={`macos-shortcut-hint font-mono text-[11px] ${
                  isFocused ? 'text-white/80' : 'text-muted-foreground group-hover:text-white/80'
                }`}
              >
                {entry.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
