// Token-styled button classes for shared UI, matching the admin catalog buttons.
// Every tone keeps a 44px touch target and a visible focus ring.
export type ButtonTone = 'primary' | 'secondary' | 'danger' | 'destructive';

const base =
  'min-h-11 rounded-lg px-4 py-2 text-sm font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-50';

const tones: Record<ButtonTone, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90',
  secondary: 'border border-line text-fg hover:bg-row',
  // Outlined, for a destructive action that still needs confirmation.
  danger: 'border border-danger-fg text-danger-fg hover:bg-danger',
  // Filled, for the confirm button that performs the destructive action.
  destructive: 'bg-danger-fg text-surface hover:opacity-90',
};

export const buttonClass = (tone: ButtonTone, className = '') =>
  `${base} ${tones[tone]} ${className}`.trim();
