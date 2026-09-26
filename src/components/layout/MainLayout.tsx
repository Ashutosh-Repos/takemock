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
    activeClass: 'bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-500/50 shadow-md ring-2 ring-blue-500/20',
    hoverClass: 'hover:border-blue-400/50 hover:bg-blue-500/10',
  },
  {
    title: 'Drills',
    icon: <Zap className="h-full w-full" />,
    href: '/practice',
    matcher: (path: string) => path.startsWith('/practice') || path.startsWith('/drills') || path.startsWith('/atlas'),
    activeClass: 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/50 shadow-md ring-2 ring-amber-500/20',
    hoverClass: 'hover:border-amber-400/50 hover:bg-amber-500/10',
  },
  {
    title: 'Builder',
    icon: <DraftingCompass className="h-full w-full" />,
    href: '/builder',
    matcher: (path: string) => path.startsWith('/builder'),
    activeClass: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/50 shadow-md ring-2 ring-emerald-500/20',
    hoverClass: 'hover:border-emerald-400/50 hover:bg-emerald-500/10',
  },
  {
    title: 'Analysis',
    icon: <BarChart3 className="h-full w-full" />,
    href: '/analysis',
    matcher: (path: string) => path.startsWith('/analysis'),
    activeClass: 'bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-500/50 shadow-md ring-2 ring-purple-500/20',
    hoverClass: 'hover:border-purple-400/50 hover:bg-purple-500/10',
  },
  {
    title: 'Mistakes',
    icon: <AlertCircle className="h-full w-full" />,
    href: '/mistakes',
    matcher: (path: string) => path.startsWith('/mistakes'),
    activeClass: 'bg-rose-500/20 text-rose-600 dark:text-rose-300 border-rose-500/50 shadow-md ring-2 ring-rose-500/20',
    hoverClass: 'hover:border-rose-400/50 hover:bg-rose-500/10',
  },
];

export function MainLayout() {
  const { resolvedTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="bg-background text-foreground relative flex h-screen w-screen flex-col overflow-hidden safe-area-top safe-area-bottom">
      {/* Ambient Apple Luminous Depth Glows for Liquid Glass Refraction */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-45 dark:opacity-25">
        <div className="absolute -top-[15%] -left-[10%] h-[520px] w-[520px] rounded-full bg-blue-500/20 blur-[130px] dark:bg-blue-600/15" />
        <div className="absolute top-[20%] -right-[10%] h-[550px] w-[550px] rounded-full bg-purple-500/18 blur-[140px] dark:bg-purple-600/12" />
        <div className="absolute -bottom-[20%] left-[10%] h-[500px] w-[500px] rounded-full bg-emerald-500/15 blur-[130px] dark:bg-emerald-600/10" />
        <div className="absolute top-[50%] left-[40%] h-[450px] w-[450px] rounded-full bg-amber-500/12 blur-[140px] dark:bg-amber-600/10" />
        <div className="absolute bottom-[5%] right-[15%] h-[480px] w-[480px] rounded-full bg-rose-500/14 blur-[130px] dark:bg-rose-600/10" />
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
        className="macos-liquid-dock"
      >
        {dockItems.map((item, idx) => {
          const isActive = location.pathname ? item.matcher(location.pathname) : false;
          return (
            <DockItem
              key={idx}
              onClick={() => navigate(item.href)}
              className={cn(
                'rounded-full border cursor-pointer transition-all duration-150 flex items-center justify-center backdrop-blur-md',
                isActive
                  ? item.activeClass
                  : cn('liquid-glass-pill text-card-foreground border-border/50 shadow-xs', item.hoverClass)
              )}
            >
              <DockLabel>{item.title}</DockLabel>
              <DockIcon>{item.icon}</DockIcon>
            </DockItem>
          );
        })}
        <DockItem
          key="theme-icon"
          className="liquid-glass-pill hover:bg-muted/80 text-card-foreground border-border/50 rounded-full border shadow-xs cursor-pointer transition-all duration-150 flex items-center justify-center backdrop-blur-md"
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
