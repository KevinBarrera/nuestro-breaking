import { useTheme } from './use-theme';

type ThemeToggleProps = { className?: string };

export function ThemeToggle({ className = '' }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      aria-pressed={theme === 'dark'}
      onClick={toggle}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      Tema oscuro
    </button>
  );
}
