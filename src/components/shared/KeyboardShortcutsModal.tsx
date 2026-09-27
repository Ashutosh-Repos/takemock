import * as React from 'react';
import { useNavigate } from 'react-router';
import {
  X,
  Search,
  Compass,
  BookOpen,
  Layers,
  Sparkles,
  Zap,
  FolderOpen,
  ArrowRight,
  Command,
} from 'lucide-react';

export interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutAction {
  id: string;
  category: string;
  description: string;
  keys: string[];
  icon: React.ComponentType<{ className?: string }>;
  action?: () => void;
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  const navigate = useNavigate();
  const [search, setSearch] = React.useState('');
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const shortcutActions: ShortcutAction[] = React.useMemo(
    () => [
      // Navigation & Views
      {
        id: 'nav-papers',
        category: 'Navigation',
        description: 'Go to Library & Papers',
        keys: ['⌘', '1'],
        icon: Compass,
        action: () => navigate('/'),
      },
      {
        id: 'nav-practice',
        category: 'Navigation',
        description: 'Go to Quick Drill',
        keys: ['⌘', '2'],
        icon: Zap,
        action: () => navigate('/practice'),
      },
      {
        id: 'nav-builder',
        category: 'Navigation',
        description: 'Go to Builder',
        keys: ['⌘', '3'],
        icon: Sparkles,
        action: () => navigate('/builder'),
      },
      {
        id: 'nav-analysis',
        category: 'Navigation',
        description: 'Go to Performance Analytics',
        keys: ['⌘', '4'],
        icon: Layers,
        action: () => navigate('/analysis'),
      },
      {
        id: 'nav-mistakes',
        category: 'Navigation',
        description: 'Go to Mistake Vault',
        keys: ['⌘', '5'],
        icon: BookOpen,
        action: () => navigate('/mistakes'),
      },
      {
        id: 'nav-sidebar',
        category: 'Navigation',
        description: 'Toggle Navigation Sidebar',
        keys: ['⌘', 'B'],
        icon: Layers,
        action: () => {
          window.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'b', metaKey: true, bubbles: true }),
          );
        },
      },

      // Global Actions
      {
        id: 'act-search',
        category: 'Global Actions',
        description: 'Quick Search Questions & Papers',
        keys: ['⌘', 'F'],
        icon: Search,
        action: () => {
          onOpenChange(false);
          setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>('input[type="search"]');
            el?.focus();
            el?.select();
          }, 80);
        },
      },
      {
        id: 'act-new-paper',
        category: 'Global Actions',
        description: 'Create New Examination Paper',
        keys: ['⌘', 'N'],
        icon: Sparkles,
        action: () => navigate('/builder'),
      },
      {
        id: 'act-import',
        category: 'Global Actions',
        description: 'Import Question Pack (.md, .json)',
        keys: ['⌘', 'O'],
        icon: FolderOpen,
        action: () => navigate('/builder?import=1'),
      },
      {
        id: 'act-shortcuts',
        category: 'Global Actions',
        description: 'Toggle Spotlight & Shortcuts',
        keys: ['⌘', 'K'],
        icon: Command,
      },
      {
        id: 'act-dismiss',
        category: 'Global Actions',
        description: 'Dismiss Dialog / Active Menu',
        keys: ['Esc'],
        icon: X,
        action: () => onOpenChange(false),
      },

      // Drills & Question Cards
      {
        id: 'drill-inspect',
        category: 'Drills & Question Cards',
        description: 'Inspect Question Details & Solution',
        keys: ['↵'],
        icon: BookOpen,
      },
      {
        id: 'drill-copy',
        category: 'Drills & Question Cards',
        description: 'Copy Question Prompt / LaTeX',
        keys: ['⌘', 'C'],
        icon: Command,
      },
      {
        id: 'drill-nav',
        category: 'Drills & Question Cards',
        description: 'Previous / Next Question in Inspector',
        keys: ['←', '→'],
        icon: ArrowRight,
      },

      // Examination Runner
      {
        id: 'runner-select',
        category: 'Examination Runner',
        description: 'Select Option A, B, C, or D',
        keys: ['1', '–', '4'],
        icon: Layers,
      },
      {
        id: 'runner-check',
        category: 'Examination Runner',
        description: 'Check Answer (Practice Mode)',
        keys: ['Space'],
        icon: Sparkles,
      },
      {
        id: 'runner-review',
        category: 'Examination Runner',
        description: 'Mark / Unmark for Review',
        keys: ['⌥', 'M'],
        icon: BookOpen,
      },
      {
        id: 'runner-clear',
        category: 'Examination Runner',
        description: 'Clear Candidate Response',
        keys: ['⌥', 'C'],
        icon: X,
      },
      {
        id: 'runner-save',
        category: 'Examination Runner',
        description: 'Save Response & Next Question',
        keys: ['⌥', 'S'],
        icon: ArrowRight,
      },
    ],
    [navigate, onOpenChange],
  );

  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return shortcutActions;
    const q = search.toLowerCase();
    return shortcutActions.filter(
      (item) =>
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.keys.join(' ').toLowerCase().includes(q),
    );
  }, [search, shortcutActions]);

  // Keep selected index within bounds
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Reset when opening
  React.useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation inside Spotlight: ArrowUp, ArrowDown, Enter, Escape
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0,
        );
      } else if (e.key === 'Enter') {
        const item = filteredItems[selectedIndex];
        if (item?.action) {
          e.preventDefault();
          item.action();
          onOpenChange(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, filteredItems, selectedIndex, onOpenChange]);

  // Auto-scroll selected item into view
  React.useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;
    const selectedEl = listEl.querySelector<HTMLElement>('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-4 pt-[14vh] pb-6 select-none sm:pt-[16vh]">
      {/* Blurred Backdrop */}
      <div
        className="animate-in fade-in fixed inset-0 bg-black/45 backdrop-blur-xs transition-opacity duration-150"
        onClick={() => onOpenChange(false)}
      />

      {/* Spotlight Window Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Spotlight Command Palette"
        className="animate-in zoom-in-95 relative flex max-h-[75vh] w-full max-w-2xl flex-col gap-3 bg-transparent transition-all duration-180"
      >
        {/* Spotlight Floating Search Bar Card */}
        <div className="border-border/80 bg-card/85 flex h-14 shrink-0 items-center gap-3.5 border px-4 opacity-60 shadow-2xl backdrop-blur-3xl sm:h-15 sm:px-5 dark:bg-[#1c1c1e]/85">
          <Search className="text-primary/80 size-5 shrink-0" />
          <input
            ref={inputRef}
            type="search"
            placeholder="Search shortcuts or actions..."
            aria-label="Search shortcuts or actions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-foreground placeholder:text-muted-foreground/60 flex-1 border-none bg-transparent p-0 text-[15px] outline-none focus:ring-0 focus:outline-none sm:text-base"
            autoFocus
          />

          {search && (
            <button
              onClick={() => setSearch('')}
              className="text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted/80 rounded-md px-2 py-0.5 text-xs transition-colors"
              title="Clear search"
            >
              Clear
            </button>
          )}

          <kbd className="bg-muted/60 text-muted-foreground border-border/50 hidden items-center rounded border px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">
            esc
          </kbd>

          <button
            onClick={() => onOpenChange(false)}
            className="macos-toolbar-btn text-muted-foreground hover:text-foreground hover:bg-muted/60 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
            title="Close (Esc)"
            aria-label="Close spotlight"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Spotlight Results & Footer Card */}
        <div className="border-border/80 bg-card/85 flex max-h-[58vh] w-full flex-col overflow-hidden rounded-2xl border opacity-65 shadow-2xl backdrop-blur-3xl dark:bg-[#1c1c1e]/85">
          {/* Results List */}
          <div
            ref={listRef}
            className="max-h-[48vh] flex-1 space-y-0.5 overflow-y-auto p-2 sm:p-2.5"
          >
            {filteredItems.length === 0 ? (
              <div className="text-muted-foreground py-14 text-center text-xs">
                No shortcuts or actions matching &ldquo;{search}&rdquo;
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const Icon = item.icon;
                const isFirstInCategory =
                  idx === 0 || item.category !== filteredItems[idx - 1]?.category;

                return (
                  <React.Fragment key={item.id}>
                    {/* Category Header */}
                    {isFirstInCategory && (
                      <div
                        className={`px-3 ${
                          idx === 0 ? 'pt-1' : 'pt-2.5'
                        } text-muted-foreground/60 pb-1 text-[10px] font-semibold tracking-wider uppercase select-none`}
                      >
                        {item.category}
                      </div>
                    )}

                    <div
                      data-selected={isSelected ? 'true' : 'false'}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => {
                        if (item.action) {
                          item.action();
                          onOpenChange(false);
                        }
                      }}
                      className={`group flex cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-xs transition-colors ${
                        isSelected
                          ? 'bg-primary font-medium text-white shadow-2xs'
                          : 'text-foreground/90 hover:bg-muted/40 font-normal'
                      }`}
                    >
                      {/* Left: Icon & Description */}
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div
                          className={`flex size-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : 'bg-muted/60 text-muted-foreground group-hover:text-primary group-hover:bg-primary/10'
                          }`}
                        >
                          <Icon className="size-3.5" />
                        </div>
                        <span className="truncate text-[13px]">{item.description}</span>
                      </div>

                      {/* Right: Key Badges */}
                      <div className="ml-3 flex shrink-0 items-center gap-1">
                        {item.keys.map((k, kIdx) => (
                          <kbd
                            key={kIdx}
                            className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 font-mono text-[11px] font-semibold transition-colors ${
                              isSelected
                                ? 'border-transparent bg-white/25 text-white'
                                : k === '–'
                                  ? 'text-muted-foreground bg-transparent font-normal'
                                  : 'bg-card/90 text-foreground border-border/70 border shadow-2xs'
                            }`}
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>

          {/* Spotlight Footer Bar */}
          <div className="border-border/40 bg-muted/20 text-muted-foreground flex h-9 shrink-0 items-center justify-between border-t px-4 text-[11px] select-none">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  ↑
                </kbd>
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  ↓
                </kbd>
                <span className="text-[10.5px]">Navigate</span>
              </span>
              <span className="flex items-center gap-1">
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  ↵
                </kbd>
                <span className="text-[10.5px]">Select</span>
              </span>
              <span className="flex items-center gap-1 sm:inline-flex">
                <kbd className="py-0.2 bg-card/80 border-border/60 text-foreground rounded border px-1 font-mono text-[9px]">
                  esc
                </kbd>
                <span className="text-[10.5px]">Close</span>
              </span>
            </div>

            <div className="flex items-center gap-2">
              {filteredItems[selectedIndex]?.action && (
                <span className="text-primary hidden text-[10.5px] font-medium sm:inline-block">
                  Press ↵ to Execute
                </span>
              )}
              <span className="text-muted-foreground/75 font-mono text-[10px]">
                {filteredItems.length} shortcut{filteredItems.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
