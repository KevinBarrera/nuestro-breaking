// Inline stroke icons shared by the Actividades screen, its dialogs and its form. Decorative:
// the control or text next to each one carries the meaning.
const iconProps = {
  'aria-hidden': true,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// Small sizes get a heavier stroke so the triangle stays legible in a pill.
export const WarningIcon = ({ size = 12 }: { size?: number }) => (
  <svg {...iconProps} width={size} height={size} strokeWidth={size < 16 ? 2.25 : 1.75}>
    <path d="M10 3l8 14H2z" />
    <path d="M10 8.5v3.5M10 14.5v.01" />
  </svg>
);

export const PlusIcon = () => (
  <svg {...iconProps} width="16" height="16" strokeWidth={2}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const PersonIcon = () => (
  <svg {...iconProps} width="18" height="18" className="mt-px shrink-0">
    <circle cx="8" cy="7" r="3" />
    <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
  </svg>
);

export const ArchiveIcon = () => (
  <svg {...iconProps} width="18" height="18">
    <rect x="2.5" y="4" width="15" height="4" rx="1" />
    <path d="M4 8v7.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V8M8 11h4" />
  </svg>
);

export const RestoreIcon = () => (
  <svg {...iconProps} width="16" height="16">
    <path d="M4 10a6 6 0 1 0 1.8-4.3" />
    <path d="M4 3.5V7h3.5" />
  </svg>
);

export const ArrowIcon = () => (
  <svg {...iconProps} width="16" height="16" className="shrink-0 text-muted">
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
);
