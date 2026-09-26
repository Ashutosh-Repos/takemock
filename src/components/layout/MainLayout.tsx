import { Outlet, useLocation, useNavigate } from 'react-router';
import { AlertCircle, BarChart3, DraftingCompass, Home, Zap } from 'lucide-react';
import { useTheme } from '../theme-provider';
import { AnimatedThemeToggler } from '../ui/animated-theme-toggler';
import { Dock, DockIcon, DockItem, DockLabel, DockSeparator } from '../ui/dock';
import { cn } from '@/lib/utils';

const dockItems = [
  {
    title: 'Home',
    icon: <Home className="h-full w-full" />,
    href: '/',
    matcher: (path: string) => path === '/' || path === '/papers',
    accentColor: 'text-blue-500 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300',
  },
  {
    title: 'Drills',
    icon: <Zap className="h-full w-full" />,
    href: '/practice',
    matcher: (path: string) => path.startsWith('/practice') || path.startsWith('/drills') || path.startsWith('/atlas'),
    accentColor: 'text-amber-500 dark:text-amber-400 group-hover:text-amber-600 dark:group-hover:text-amber-300',
  },
  {
    title: 'Builder',
    icon: <DraftingCompass className="h-full w-full" />,
    href: '/builder',
    matcher: (path: string) => path.startsWith('/builder'),
    accentColor: 'text-emerald-500 dark:text-emerald-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-300',
  },
  {
    title: 'Analysis',
    icon: <BarChart3 className="h-full w-full" />,
    href: '/analysis',
    matcher: (path: string) => path.startsWith('/analysis'),
    accentColor: 'text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-300',
  },
  {
    title: 'Mistakes',
    icon: <AlertCircle className="h-full w-full" />,
    href: '/mistakes',
    matcher: (path: string) => path.startsWith('/mistakes'),
    accentColor: 'text-rose-500 dark:text-rose-400 group-hover:text-rose-600 dark:group-hover:text-rose-300',
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

      {/* Authentic Apple macOS Liquid Glass Dock */}
      <Dock
        magnification={70}
        distance={140}
        direction="horizontal"
        placement="bottom"
        containerClassName="bottom-3.5 left-1/2 -translate-x-1/2"
      >
        {dockItems.map((item, idx) => {
          const isActive = location.pathname ? item.matcher(location.pathname) : false;
          return (
            <DockItem
              key={idx}
              onClick={() => navigate(item.href)}
              aria-label={item.title}
              aria-current={isActive ? 'page' : undefined}
              isActive={isActive}
              className={cn(
                'rounded-[14px] transition-all duration-180 flex items-center justify-center relative p-2',
                'border shadow-xs backdrop-blur-md',
                isActive
                  ? 'bg-white/80 dark:bg-white/20 border-white/85 dark:border-white/30 shadow-[0_4px_16px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.95)]'
                  : 'bg-white/40 dark:bg-white/8 hover:bg-white/60 dark:hover:bg-white/14 border-white/50 dark:border-white/12 shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]'
              )}
            >
              <DockLabel>{item.title}</DockLabel>
              <DockIcon className={item.accentColor}>{item.icon}</DockIcon>
            </DockItem>
          );
        })}

        <DockSeparator />

        <DockItem
          key="theme-icon"
          aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          className={cn(
            'rounded-[14px] transition-all duration-180 flex items-center justify-center relative p-2',
            'border shadow-xs backdrop-blur-md',
            'bg-white/40 dark:bg-white/8 hover:bg-white/60 dark:hover:bg-white/14 border-white/50 dark:border-white/12 text-muted-foreground hover:text-foreground shadow-[0_2px_8px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.6)]'
          )}
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
