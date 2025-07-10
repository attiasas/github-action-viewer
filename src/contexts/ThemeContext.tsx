import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark' | 'auto';

interface ThemeContextType {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Initialize theme from localStorage if available
    const savedTheme = localStorage.getItem('app-theme') as Theme;
    if (savedTheme && ['light', 'dark', 'auto'].includes(savedTheme)) {
      return savedTheme;
    }
    return 'light';
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>('light');

  // Listen for system theme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // Save theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Calculate effective theme
  const effectiveTheme = theme === 'auto' ? systemTheme : theme;

  // Apply theme class to body
  useEffect(() => {
    const className = `theme-${effectiveTheme}`;
    console.log('Applying theme class:', className); // Debug log
    document.body.className = className;
    console.log('Body class now:', document.body.className); // Debug log
  }, [effectiveTheme]);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
