import { applyTheme, currentTheme, storeTheme, type Theme } from '@/shared/lib';
import { useState } from 'react';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storeTheme(next);
    setTheme(next);
  }

  return { theme, toggle };
}
