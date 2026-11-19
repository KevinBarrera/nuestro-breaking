import type { ReactNode } from 'react';

// Decorative stroke icons of the side navigation (#313); the labels carry the meaning.
function Icon({ size = 18, children }: { size?: 16 | 18; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export const CalendarIcon = () => (
  <Icon>
    <rect x="3" y="4.5" width="14" height="13" rx="2" />
    <path d="M3 8.5h14M7 2.5v4M13 2.5v4" />
  </Icon>
);

export const TeamIcon = () => (
  <Icon>
    <circle cx="8" cy="7" r="3" />
    <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M13.5 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1.3.7 2 2.4 2 4.6" />
  </Icon>
);

export const OperationIcon = () => (
  <Icon>
    <path d="M2.5 10h3l2-5 4 10 2-5h4" />
  </Icon>
);

export const CatalogIcon = () => (
  <Icon>
    <path d="M10.5 2.5h7v7l-8 8-7-7z" />
    <circle cx="14" cy="6" r="1.2" />
  </Icon>
);

export const SettingsIcon = () => (
  <Icon>
    <path d="M3 6h8M15 6h2M3 14h2M9 14h8" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </Icon>
);

export const LockIcon = () => (
  <Icon size={16}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon size={16}>
    <path d="M6 8l4 4 4-4" />
  </Icon>
);
