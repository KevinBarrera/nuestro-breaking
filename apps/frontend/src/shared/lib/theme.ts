export type Theme = 'light' | 'dark';

// Keep in sync with the pre-paint script in index.html.
export const themeStorageKey = 'nb-theme';

// Storage can be missing or throw (private mode, blocked site data); light is the safe default.
export function readStoredTheme(): Theme {
  try {
    return globalThis.localStorage.getItem(themeStorageKey) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function storeTheme(theme: Theme) {
  try {
    globalThis.localStorage.setItem(themeStorageKey, theme);
  } catch {
    // The choice still applies for this page view when it cannot be persisted.
  }
}

export function currentTheme(): Theme {
  const applied = document.documentElement.dataset.theme;
  return applied === 'dark' || applied === 'light' ? applied : readStoredTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
