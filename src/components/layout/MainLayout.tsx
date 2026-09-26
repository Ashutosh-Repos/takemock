import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  DraftingCompass,
  Monitor,
  Moon,
  Plus,
  Sliders,
  Sun,
  Zap,
} from 'lucide-react';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MacPreferencesModal } from '@/components/shared/MacPreferencesModal';
import { useTheme } from '@/components/theme-provider';

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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [prefsOpen, setPrefsOpen] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('prefs') === '1';
    } catch {
      return false;
    }
  });

  // Desktop Keyboard Shortcuts (⌘1 through ⌘5, plus ⌘, for Preferences)
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
        } else if (e.key === ',') {
          e.preventDefault();
          setPrefsOpen((prev) => !prev);
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
    <div className="relative flex h-screen w-screen flex-col overflow-hidden text-foreground bg-transparent">
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
        <SegmentedControl
          ariaLabel="Window Navigation"
          variant="toolbar"
          value={navSegments.find((item) => item.matcher(location.pathname))?.id}
          onValueChange={(id) => {
            const target = navSegments.find((item) => item.id === id);
            if (target) navigate(target.href);
          }}
          options={navSegments.map((item) => ({
            value: item.id,
            label: item.title,
            icon: item.icon,
            title: `${item.title} (${item.shortcut})`,
          }))}
        />

        {/* Trailing edge: Quick Action Button & Component Inspector */}
        <div className="flex items-center gap-1.5" data-tauri-drag-region>
          {/* Quick Appearance Toggle */}
          <button
            onClick={() => setTheme(theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system')}
            className="macos-toolbar-btn"
            title={`macOS Appearance: ${theme === 'system' ? `Auto/System (${resolvedTheme})` : theme} (Click to switch)`}
          >
            {theme === 'system' ? (
              <Monitor className="size-4" />
            ) : resolvedTheme === 'dark' ? (
              <Moon className="size-4" />
            ) : (
              <Sun className="size-4" />
            )}
          </button>

          <button
            onClick={() => setPrefsOpen(true)}
            className="macos-toolbar-btn"
            title="macOS Components Inspector (⌘,)"
          >
            <Sliders className="size-4" />
          </button>

          <button
            onClick={() => navigate('/builder')}
            className="btn btn-primary btn-sm h-7 px-3 gap-1.5 font-medium"
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

      {/* macOS Components & Preferences Modal */}
      <MacPreferencesModal open={prefsOpen} onOpenChange={setPrefsOpen} />
    </div>
  );
}
