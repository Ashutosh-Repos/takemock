import { Outlet, useLocation, useNavigate } from 'react-router';
import { AlertCircle, BarChart3, DraftingCompass, Home, Zap } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { AnimatedThemeToggler } from '../ui/animated-theme-toggler';
import { Dock, DockIcon, DockItem, DockLabel } from '../ui/dock';
import { cn } from '@/lib/utils';

const dockItems = [
  {
    title: 'Home',
    icon: <Home className="h-full w-full" />,
    href: '/',
    matcher: (path: string) => path === '/' || path === '/papers',
  },
  {
    title: 'Drills',
    icon: <Zap className="h-full w-full" />,
    href: '/practice',
    matcher: (path: string) => path.startsWith('/practice') || path.startsWith('/drills') || path.startsWith('/atlas'),
  },
  {
    title: 'Builder',
    icon: <DraftingCompass className="h-full w-full" />,
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
    icon: <AlertCircle className="h-full w-full" />,
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
      {/* Ambient Apple Luminous Depth Glows for Liquid Glass Refraction */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-50 dark:opacity-30">
        <div className="absolute -top-[15%] -left-[10%] h-[520px] w-[520px] rounded-full bg-blue-500/20 blur-[130px] dark:bg-blue-600/15" />
        <div className="absolute top-[35%] -right-[10%] h-[600px] w-[600px] rounded-full bg-indigo-500/20 blur-[140px] dark:bg-indigo-600/15" />
        <div className="absolute -bottom-[20%] left-[20%] h-[500px] w-[500px] rounded-full bg-teal-500/15 blur-[130px] dark:bg-teal-600/12" />
      </div>

      {/* Native Desktop Window Drag Region */}
      <header
        data-tauri-drag-region
        className="h-8 w-full shrink-0 select-none liquid-glass-header flex items-center justify-between px-3 text-[11px] font-medium text-muted-foreground z-40"
      >
        <div className="flex items-center gap-2 pointer-events-none pl-18 sm:pl-3">
          <div className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
          <span className="font-semibold tracking-tight text-xs text-foreground">
            TakeMock
          </span>
          <span className="text-[10px] text-muted-foreground/60 font-mono hidden md:inline">
            v0.1.0
          </span>
        </div>

        {/* Center Title or Breadcrumb */}
        <div className="text-[11px] font-medium text-muted-foreground pointer-events-none tracking-tight">
          {dockItems.find((d) => d.matcher(location.pathname))?.title || 'Assessment'}
        </div>

        <div className="flex items-center gap-2 pointer-events-none">
          <span className="text-[10px] font-mono tracking-wide text-muted-foreground/75 px-1.5 py-0.5 rounded border border-border/60 bg-muted/40">
            LOCAL
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full flex-1 overflow-x-hidden overflow-y-auto relative z-10 pb-20">
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
