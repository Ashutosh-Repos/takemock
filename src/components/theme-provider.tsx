import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light' | 'system';

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  resolvedTheme: 'dark' | 'light';
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: 'system',
  resolvedTheme: 'dark',
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function getSystemThemeSnapshot(): 'dark' | 'light' {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function subscribeToSystemTheme(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', callback);
  return () => mediaQuery.removeEventListener('change', callback);
}

function applyThemeClassesToDOM(resolved: 'dark' | 'light') {
  if (typeof window === 'undefined') return;
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(resolved);
  root.setAttribute('data-theme', resolved === 'dark' ? 'dark' : 'light');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const systemTheme = useSyncExternalStore<'dark' | 'light'>(
    subscribeToSystemTheme,
    getSystemThemeSnapshot,
    () => 'dark',
  );

  // Always sync with macOS system appearance
  const resolvedTheme = systemTheme;

  useEffect(() => {
    // Clear any legacy manual override so the app always follows macOS
    try {
      localStorage.removeItem('vite-ui-theme');
    } catch {
      // Silently ignore storage errors
    }
    applyThemeClassesToDOM(resolvedTheme);
  }, [resolvedTheme]);

  const value = {
    theme: 'system' as Theme,
    resolvedTheme,
    setTheme: () => {
      // No-op: strictly follows macOS system appearance
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider');

  return context;
};
