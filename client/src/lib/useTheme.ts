import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeCtx {
  theme: Theme;
  resolved: 'light' | 'dark';
  setTheme: (t: Theme) => void;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({
  theme: 'system',
  resolved: 'light',
  setTheme: () => {},
  cycle: () => {},
});

export const useTheme = () => useContext(ThemeContext);

function getSystemPref(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolve(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? getSystemPref() : theme;
}

function applyClass(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system';
  });

  const [resolved, setResolved] = useState<'light' | 'dark'>(() => resolve(theme));

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem('theme', t);
    setThemeState(t);
  }, []);

  const cycle = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
  }, [theme, setTheme]);

  // Apply dark class whenever theme or system pref changes
  useEffect(() => {
    const r = resolve(theme);
    setResolved(r);
    applyClass(r);

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => {
        const nr = resolve('system');
        setResolved(nr);
        applyClass(nr);
      };
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [theme]);

  return createElement(ThemeContext.Provider, { value: { theme, resolved, setTheme, cycle } }, children);
}
