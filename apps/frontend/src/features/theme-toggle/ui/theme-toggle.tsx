import { useTheme } from './use-theme';

type ThemeToggleProps = { className?: string };

// Icon-only button whose accessible name states the action: the dark theme shows a sun to switch
// back to light, the light theme a moon to switch to dark.
export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-icon={dark ? 'sun' : 'moon'}
      onClick={toggle}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </>
        ) : (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}
