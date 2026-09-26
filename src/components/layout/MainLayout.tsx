import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  DraftingCompass,
  Plus,
  Zap,
} from 'lucide-react';

interface NavSegment {
  id: string;
  title: string;
  shortcut: string;
  icon: typeof BookOpen;
  href: string;
  matcher: (path: string) => boolean;
}

const navSegments: NavSegment[] = [
  {
    id: 'papers',
    title: 'Papers',
    shortcut: '⌘1',
    icon: BookOpen,
    href: '/',
    matcher: (path: string) => path === '/' || path === '/papers',
  },
  {
    id: 'drills',
    title: 'Drills',
    shortcut: '⌘2',
    icon: Zap,
    href: '/practice',
    matcher: (path: string) =>
      path.startsWith('/practice') || path.startsWith('/drills') || path.startsWith('/atlas'),
  },
  {
    id: 'builder',
    title: 'Builder',
    shortcut: '⌘3',
    icon: DraftingCompass,
    href: '/builder',
    matcher: (path: string) => path.startsWith('/builder'),
  },
  {
    id: 'analysis',
    title: 'Analysis',
    shortcut: '⌘4',
    icon: BarChart3,
    href: '/analysis',
    matcher: (path: string) => path.startsWith('/analysis'),
  },
  {
    id: 'mistakes',
    title: 'Mistakes',
    shortcut: '⌘5',
    icon: AlertCircle,
    href: '/mistakes',
    matcher: (path: string) => path.startsWith('/mistakes'),
  },
];

export function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  // Desktop Keyboard Shortcuts (⌘1 through ⌘5)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  const handleToolbarMouseDown = (e: React.MouseEvent) => {
    if (
      e.button === 0 &&
      !(e.target as HTMLElement).closest('button, a, input, select, textarea, [role="tab"]')
    ) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => getCurrentWindow().startDragging())
        .catch(() => {});
    }
  };

  return (
    <div className="bg-transparent text-foreground relative flex h-screen w-screen flex-col overflow-hidden">
      {/* Native macOS Window Unified Toolbar */}
      <header
        data-tauri-drag-region
        onMouseDown={handleToolbarMouseDown}
        className="h-12 w-full shrink-0 select-none liquid-glass-header flex items-center justify-between px-4 z-40 cursor-default"
      >
        {/* Leading edge: Traffic lights inset spacing (80px) + App Identifier */}
        <div
          data-tauri-drag-region
          className="flex items-center gap-2.5 pl-20 sm:pl-20 text-[13px] font-medium"
        >
          <span className="font-semibold tracking-tight text-foreground/90">TakeMock</span>
        </div>

        {/* Center: macOS Native Segmented Navigation Control */}
        <nav
          aria-label="Window Navigation"
          className="macos-segmented shadow-2xs"
          role="tablist"
        >
          {navSegments.map((item) => {
            const isActive = item.matcher(location.pathname);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={isActive}
                title={`${item.title} (${item.shortcut})`}
                onClick={() => navigate(item.href)}
                className={`macos-segment-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="size-3.5" />
                <span>{item.title}</span>
              </button>
            );
          })}
        </nav>

        {/* Trailing edge: Quick Action Button */}
        <div className="flex items-center gap-2" data-tauri-drag-region>
          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm gap-1.5"
            title="Create New Paper"
          >
            <Plus className="size-3.5" />
            <span>New Paper</span>
          </button>
        </div>
      </header>

      {/* Main Desktop Window Content Area */}
      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto relative z-10">
        <Outlet />
      </main>
    </div>
  );
}
