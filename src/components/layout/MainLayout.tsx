import { Outlet, useNavigate } from 'react-router';
import { DraftingCompass, History as HistoryIcon, LibraryBig } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { AnimatedThemeToggler } from '../ui/animated-theme-toggler';
import { Dock, DockIcon, DockItem, DockLabel } from '../ui/dock';

const data = [
  {
    title: 'Question Bank',
    icon: <LibraryBig className="text-foreground/80 h-full w-full" />,
    href: '/',
  },
  {
    title: 'Test Builder',
    icon: <DraftingCompass className="text-foreground/80 h-full w-full" />,
    href: '/builder',
  },
  {
    title: 'Past Attempts',
    icon: <HistoryIcon className="text-foreground/80 h-full w-full" />,
    href: '/history',
  },
];

export function MainLayout() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <div className="bg-background text-foreground relative flex h-screen w-screen flex-col overflow-hidden safe-area-top safe-area-bottom">
      {/* Native Desktop Window Drag Region */}
      <div
        data-tauri-drag-region
        className="h-7 w-full shrink-0 select-none bg-base-200/50 border-b border-base-300/40 flex items-center justify-between px-3 text-[11px] font-medium text-base-content/60 backdrop-blur-xs"
      >
        <div className="flex items-center gap-1.5 pointer-events-none pl-18 sm:pl-2">
          <span className="size-2 rounded-full bg-primary/70 inline-block animate-pulse" />
          <span className="font-semibold tracking-wide uppercase text-[10px] text-base-content/70">
            TakeMock Assessment Suite
          </span>
        </div>
        <div className="hidden sm:block text-[10px] font-mono text-base-content/40 pointer-events-none">
          Native CBT Engine • 100% Offline
        </div>
      </div>

      {/* Main Content Area */}
      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>

      <Dock magnification={90}>
        {data.map((item, idx) => (
          <DockItem
            key={idx}
            onClick={() => navigate(item.href)}
            className="bg-card hover:bg-muted text-card-foreground border-border/60 aspect-square rounded-full border shadow-sm cursor-pointer"
          >
            <DockLabel>{item.title}</DockLabel>
            <DockIcon>{item.icon}</DockIcon>
          </DockItem>
        ))}
        <DockItem
          key="theme-icon"
          className="bg-card hover:bg-muted text-card-foreground border-border/60 aspect-square rounded-full border shadow-sm"
        >
          <DockLabel>{resolvedTheme === 'dark' ? 'Cupcake (Light)' : 'Dracula (Dark)'}</DockLabel>
          <DockIcon>
            <AnimatedThemeToggler className="h-full w-full" />
          </DockIcon>
        </DockItem>
      </Dock>
    </div>
  );
}
