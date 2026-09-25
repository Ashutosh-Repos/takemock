import { Outlet, useLocation, useNavigate } from 'react-router';
import { BarChart3, BookOpen, Compass, Hammer, Target } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { AnimatedThemeToggler } from '../ui/animated-theme-toggler';
import { Dock, DockIcon, DockItem, DockLabel } from '../ui/dock';
import { cn } from '@/lib/utils';

const dockItems = [
  {
    title: 'Library',
    icon: <BookOpen className="h-full w-full" />,
    href: '/',
    matcher: (path: string) => path === '/' || path === '/papers',
  },
  {
    title: 'Practice',
    icon: <Compass className="h-full w-full" />,
    href: '/practice',
    matcher: (path: string) => path.startsWith('/practice') || path.startsWith('/atlas'),
  },
  {
    title: 'Builder',
    icon: <Hammer className="h-full w-full" />,
    href: '/builder',
    matcher: (path: string) => path.startsWith('/builder'),
  },
  {
    title: 'Analysis',
    icon: <BarChart3 className="h-full w-full" />,
    href: '/analysis',
    matcher: (path: string) => path.startsWith('/analysis'),
  },
  {
    title: 'Mistakes',
    icon: <Target className="h-full w-full" />,
    href: '/mistakes',
    matcher: (path: string) => path.startsWith('/mistakes'),
  },
];

export function MainLayout() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

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
            TakeMock
          </span>
        </div>
        <div className="hidden sm:block text-[10px] font-mono text-base-content/40 pointer-events-none">
          Offline
        </div>
      </div>

      {/* Main Content Area */}
      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </main>

      <Dock
        magnification={76}
        distance={130}
        direction="horizontal"
        placement="bottom"
        containerClassName="bottom-3 left-1/2 -translate-x-1/2"
      >
        {dockItems.map((item, idx) => {
          const isActive = location.pathname ? item.matcher(location.pathname) : false;
          return (
            <DockItem
              key={idx}
              onClick={() => navigate(item.href)}
              className={cn(
                'rounded-full border cursor-pointer transition-colors duration-150 flex items-center justify-center',
                isActive
                  ? 'bg-primary text-primary-content border-primary shadow-md'
                  : 'bg-card/90 hover:bg-muted text-card-foreground border-border/70 shadow-xs'
              )}
            >
              <DockLabel>{item.title}</DockLabel>
              <DockIcon>{item.icon}</DockIcon>
            </DockItem>
          );
        })}
        <DockItem
          key="theme-icon"
          className="bg-card/90 hover:bg-muted text-card-foreground border-border/70 rounded-full border shadow-xs cursor-pointer transition-colors duration-150 flex items-center justify-center"
        >
          <DockLabel>{resolvedTheme === 'dark' ? 'Light Theme' : 'Dark Theme'}</DockLabel>
          <DockIcon>
            <AnimatedThemeToggler className="h-full w-full" />
          </DockIcon>
        </DockItem>
      </Dock>
    </div>
  );
}
