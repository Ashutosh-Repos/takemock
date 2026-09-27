import * as React from 'react';

export interface MacContextMenuItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface MacContextMenuDivider {
  type: 'divider';
}

export type MacContextMenuEntry = MacContextMenuItem | MacContextMenuDivider;

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
  entries: MacContextMenuEntry[];
}

export function isDivider(entry: MacContextMenuEntry): entry is MacContextMenuDivider {
  return 'type' in entry && entry.type === 'divider';
}

export function useMacContextMenu() {
  const [contextMenuState, setContextMenuState] = React.useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    entries: [],
  });

  const openContextMenu = React.useCallback(
    (e: React.MouseEvent, entries: MacContextMenuEntry[]) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuState({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        entries,
      });
    },
    [],
  );

  const closeContextMenu = React.useCallback(() => {
    setContextMenuState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
  }, []);

  return {
    contextMenuState,
    openContextMenu,
    closeContextMenu,
  };
}
