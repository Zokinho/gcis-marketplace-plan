import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { createElement } from 'react';

export type Theme = 'light' | 'dark' | 'teal' | 'system';

interface ThemeCtx {
  theme: Theme;
  resolved: 'light' | 'dark' | 'teal';
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

function resolve(theme: Theme): 'light' | 'dark' | 'teal' {
  if (theme === 'teal') return 'teal';
  return theme === 'system' ? getSystemPref() : theme;
}

function applyClass(resolved: 'light' | 'dark' | 'teal') {
  const root = document.documentElement;
  root.classList.remove('dark', 'theme-gradient');
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else if (resolved === 'teal') {
    root.classList.add('theme-gradient');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    return stored && ['light', 'dark', 'teal', 'system'].includes(stored) ? stored : 'system';
  });

  const [resolved, setResolved] = useState<'light' | 'dark' | 'teal'>(() => resolve(theme));

  const setTheme = useCallback((t: Theme) => {
    localStorage.setItem('theme', t);
    setThemeState(t);
  }, []);

  const cycle = useCallback(() => {
    const order: Theme[] = ['light', 'dark', 'teal', 'system'];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  }, [theme, setTheme]);

  // Apply class whenever theme or system pref changes
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
