// Shared by the bottom bar and the pages' own summaries (the desktop side panel).
export const passCountLabel = (count: number) => (count === 1 ? '1 pase' : `${count} pases`);

export const continueButtonClass =
  'inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-7 text-base font-bold text-primary-fg outline-none hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50';
