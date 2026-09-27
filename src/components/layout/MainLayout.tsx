import { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  DraftingCompass,
  FolderOpen,
  Keyboard,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Zap,
} from 'lucide-react';
import { assessmentRepository } from '@/core/storage/repository';
import { isTauriEnvironment } from '@/core/native/tauriBridge';
import { KeyboardShortcutsModal } from '@/components/shared/KeyboardShortcutsModal';

interface NavItem {
  id: string;
  title: string;
  shortcut: string;
  icon: typeof BookOpen;
  href: string;
  matcher: (path: string) => boolean;
  section: 'LIBRARY' | 'AUTHORING' | 'PERFORMANCE';
  getBadge?: (counts: { papers: number; mistakes: number }) => number | null;
  badgeVariant?: 'default' | 'error';
}

const navItems: NavItem[] = [
  {
    id: 'papers',
    title: 'Papers',
    shortcut: '⌘1',
    icon: BookOpen,
    href: '/',
    matcher: (path: string) => path === '/' || path === '/papers',
    section: 'LIBRARY',
    getBadge: (c) => (c.papers > 0 ? c.papers : null),
  },
  {
    id: 'drills',
    title: 'Quick Drill',
    shortcut: '⌘2',
    icon: Zap,
    href: '/practice',
    matcher: (path: string) =>
      path.startsWith('/practice') || path.startsWith('/drills') || path.startsWith('/atlas'),
    section: 'LIBRARY',
  },
  {
    id: 'builder',
    title: 'Builder',
    shortcut: '⌘3',
    icon: DraftingCompass,
    href: '/builder',
    matcher: (path: string) => path.startsWith('/builder'),
    section: 'AUTHORING',
  },
  {
    id: 'analysis',
    title: 'Analytics',
    shortcut: '⌘4',
    icon: BarChart3,
    href: '/analysis',
    matcher: (path: string) => path.startsWith('/analysis'),
    section: 'PERFORMANCE',
  },
  {
    id: 'mistakes',
    title: 'Mistake Vault',
    shortcut: '⌘5',
    icon: AlertCircle,
    href: '/mistakes',
    matcher: (path: string) => path.startsWith('/mistakes'),
    section: 'PERFORMANCE',
    getBadge: (c) => (c.mistakes > 0 ? c.mistakes : null),
    badgeVariant: 'error',
  },
];

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Primary macOS Sidebar visibility state
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try {
      const stored = localStorage.getItem('takemock_sidebar_open');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('takemock_sidebar_open', String(next));
      } catch {
        // Silently ignore storage errors (e.g. private browsing quota)
      }
      return next;
    });
  }, []);

  // Dynamic counts for macOS sidebar badges
  const [counts, setCounts] = useState({ papers: 0, mistakes: 0 });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const loadCounts = useCallback(async () => {
    try {
      const [tests, mistakeData] = await Promise.all([
        assessmentRepository.getTests(),
        assessmentRepository.getMistakeAnalytics(),
      ]);
      setCounts({
        papers: tests.length,
        mistakes: mistakeData.unresolvedQuestions.length,
      });
    } catch {
      // Fallback silently if storage is initializing
    }
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts, location.pathname]);

  // Desktop Keyboard Shortcuts (⌘1 through ⌘5, ⌘N, ⌘B, ⌘F, ⌘/, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Pressing '?' when not typing in an input
      if (
        e.key === '?' &&
        !e.metaKey &&
        !e.ctrlKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)
      ) {
        e.preventDefault();
        setShortcutsOpen((prev) => !prev);
        return;
      }

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          navigate('/');
        } else if (e.key === '2') {
          e.preventDefault();
          navigate('/practice');
        } else if (e.key === '3') {
          e.preventDefault();
          navigate('/builder');
        } else if (e.key === '4') {
          e.preventDefault();
          navigate('/analysis');
        } else if (e.key === '5') {
          e.preventDefault();
          navigate('/mistakes');
        } else if (e.key === 'b' || e.key === 'B' || e.key === 's' || e.key === 'S') {
          e.preventDefault();
          toggleSidebar();
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          navigate('/builder');
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          const searchInput = document.querySelector<HTMLInputElement>('input[type="search"]');
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        } else if (e.key === '/' || e.key === '?' || e.key === 'k' || e.key === 'K') {
          e.preventDefault();
          setShortcutsOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, toggleSidebar]);

  // Listen for native macOS menu bar actions and navigations (NSMenu)
  useEffect(() => {
    let unlistenNavigate: (() => void) | undefined;
    let unlistenAction: (() => void) | undefined;

    if (isTauriEnvironment()) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('native-menu-navigate', (event) => {
          navigate(event.payload);
        }).then((unsub) => {
          unlistenNavigate = unsub;
        });

        listen<string>('native-menu-action', (event) => {
          if (event.payload === 'toggle-sidebar') {
            toggleSidebar();
          } else if (event.payload === 'import-paper') {
            navigate('/builder?import=1');
          }
        }).then((unsub) => {
          unlistenAction = unsub;
        });
      });
    }

    return () => {
      unlistenNavigate?.();
      unlistenAction?.();
    };
  }, [navigate, toggleSidebar]);

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    if (
      e.button === 0 &&
      !(e.target as HTMLElement).closest(
        'button, a, input, select, textarea, [role="tab"], [role="menuitem"]',
      )
    ) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch(() => {});
    }
  };

  // Find active navigation item title for content toolbar breadcrumb
  const activeItem = navItems.find((item) => item.matcher(location.pathname));
  const currentViewTitle = activeItem
    ? activeItem.title
    : location.pathname.startsWith('/result')
      ? 'Assessment Review'
      : 'TakeMock';

  return (
    <div className="text-foreground relative flex h-screen w-screen flex-row overflow-hidden bg-transparent select-none">
      {/* ====================================================================
          PRIMARY MACOS SIDEBAR (Master Navigation)
          Compliant with Apple HIG Master-Detail Navigation Pattern
          ==================================================================== */}
      <aside
        className={`macos-sidebar relative z-30 flex h-full shrink-0 flex-col transition-[width] duration-200 ease-in-out ${
          sidebarOpen ? 'w-60' : 'w-0 overflow-hidden border-none'
        }`}
      >
        {/* Sidebar Header with macOS Window Traffic Lights Clearance */}
        <div
          data-tauri-drag-region
          onMouseDown={handleToolbarMouseDown}
          className="border-border/40 flex h-13 shrink-0 cursor-default items-center justify-between border-b px-3 select-none"
        >
          {/* Traffic lights clearance space */}
          <div className="h-full w-19.5" data-tauri-drag-region />

          <button
            onClick={toggleSidebar}
            className="macos-toolbar-btn text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md p-0"
            title="Collapse Sidebar (⌘B)"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        </div>

        {/* Sidebar Grouped Navigation Content */}
        <div className="flex-1 space-y-4 overflow-y-auto py-2.5">
          {/* Section: LIBRARY */}
          <div>
            <div className="macos-sidebar-section-title">Library</div>
            <nav className="space-y-0.5">
              {navItems
                .filter((item) => item.section === 'LIBRARY')
                .map((item) => {
                  const isActive = item.matcher(location.pathname);
                  const Icon = item.icon;
                  const badge = item.getBadge?.(counts);

                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.href)}
                      className={`macos-sidebar-item w-[calc(100%-16px)] ${isActive ? 'active' : ''}`}
                      title={`${item.title} (${item.shortcut})`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={`size-4 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`}
                        />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {badge !== null && badge !== undefined && (
                          <span className="macos-sidebar-badge font-mono">{badge}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </nav>
          </div>

          {/* Section: AUTHORING */}
          <div>
            <div className="macos-sidebar-section-title">Authoring</div>
            <nav className="space-y-0.5">
              {navItems
                .filter((item) => item.section === 'AUTHORING')
                .map((item) => {
                  const isActive = item.matcher(location.pathname);
                  const Icon = item.icon;
                  const badge = item.getBadge?.(counts);

                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.href)}
                      className={`macos-sidebar-item w-[calc(100%-16px)] ${isActive ? 'active' : ''}`}
                      title={`${item.title} (${item.shortcut})`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={`size-4 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`}
                        />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {badge !== null && badge !== undefined && (
                          <span className="macos-sidebar-badge font-mono">{badge}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </nav>
          </div>

          {/* Section: PERFORMANCE */}
          <div>
            <div className="macos-sidebar-section-title">Performance</div>
            <nav className="space-y-0.5">
              {navItems
                .filter((item) => item.section === 'PERFORMANCE')
                .map((item) => {
                  const isActive = item.matcher(location.pathname);
                  const Icon = item.icon;
                  const badge = item.getBadge?.(counts);

                  return (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.href)}
                      className={`macos-sidebar-item w-[calc(100%-16px)] ${isActive ? 'active' : ''}`}
                      title={`${item.title} (${item.shortcut})`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Icon
                          className={`size-4 shrink-0 ${isActive ? 'text-white' : 'text-muted-foreground'}`}
                        />
                        <span className="truncate">{item.title}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {badge !== null && badge !== undefined && (
                          <span
                            className={`macos-sidebar-badge font-mono ${
                              item.badgeVariant === 'error' && !isActive
                                ? 'bg-rose-500/15 font-semibold text-rose-600 dark:text-rose-400'
                                : ''
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
            </nav>
          </div>
        </div>

        {/* Clean macOS Sidebar Footer with Shortcuts Button */}
        <div className="border-border/40 flex shrink-0 items-center justify-between border-t px-2.5 py-2 select-none">
          <button
            onClick={() => setShortcutsOpen(true)}
            className="text-muted-foreground hover:text-foreground hover:bg-muted/50 flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11.5px] font-medium transition-colors"
            title="Keyboard Shortcuts (⌘/)"
            aria-label="View Keyboard Shortcuts"
          >
            <div className="flex items-center gap-1.5">
              <Keyboard className="text-primary size-3.5" />
              <span>Keyboard Shortcuts</span>
            </div>
            <kbd className="bg-card/80 border-border/60 text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[10px]">
              ⌘/
            </kbd>
          </button>
        </div>
      </aside>

      {/* ====================================================================
          DETAIL / CONTENT REGION
          Unified macOS Window Toolbar + Fluid Responsive Desktop Canvas
          ==================================================================== */}
      <div className="macos-content-pane relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        {/* Unified macOS Content Toolbar */}
        <header
          data-tauri-drag-region
          onMouseDown={handleToolbarMouseDown}
          className={`liquid-glass-header z-20 flex h-13 shrink-0 cursor-default items-center justify-between px-4 select-none ${
            !sidebarOpen ? 'pl-19.5' : ''
          }`}
        >
          {/* Leading Content Toolbar Area: Sidebar Toggle & Breadcrumb Title */}
          <div className="flex items-center gap-2.5" data-tauri-drag-region>
            {!sidebarOpen && (
              <button
                onClick={toggleSidebar}
                className="macos-toolbar-btn text-muted-foreground hover:text-foreground mr-1 flex size-7 items-center justify-center rounded-md p-0"
                title="Show Sidebar (⌘B)"
              >
                <PanelLeft className="size-4" />
              </button>
            )}

            <span className="text-foreground text-[13px] font-semibold tracking-tight">
              {currentViewTitle}
            </span>
          </div>

          {/* Trailing Content Toolbar Controls */}
          <div className="flex items-center gap-2" data-tauri-drag-region>
            {/* Keyboard Shortcuts Trigger Button */}
            <button
              onClick={() => setShortcutsOpen(true)}
              className="macos-toolbar-btn text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md p-0"
              title="Keyboard Shortcuts (⌘/)"
              aria-label="View Keyboard Shortcuts"
            >
              <Keyboard className="size-3.5" />
            </button>

            {/* Dynamic Semantic Action according to current page */}
            {location.pathname === '/' || location.pathname === '/papers' ? (
              <button
                onClick={() => navigate('/builder')}
                className="btn btn-primary btn-sm h-7 gap-1.5 px-3 text-xs font-medium shadow-xs"
                title="Create New Paper (⌘N)"
              >
                <Plus className="size-3.5" />
                <span>New Paper</span>
              </button>
            ) : location.pathname.startsWith('/builder') ? (
              <button
                onClick={() => {
                  const importBtn = document.getElementById('builder-pick-file-btn');
                  importBtn?.click();
                }}
                className="btn btn-secondary btn-sm border-border/60 hover:bg-muted h-7 gap-1.5 border px-2.5 text-xs font-medium"
                title="Import Question Pack (⌘O)"
              >
                <FolderOpen className="size-3.5" />
                <span>Import File</span>
              </button>
            ) : null}
          </div>
        </header>

        {/* Main Desktop Window Detail Canvas */}
        <main className="relative z-10 h-full w-full flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
