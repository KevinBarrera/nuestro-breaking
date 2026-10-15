import type { PublicActivity, PublicPass } from '@/entities/public-event';

// Test catalog: two full passes with competitions, general entry and an add-on that needs a full pass.
const activity = (id: string, name: string): PublicActivity => ({
  id,
  name,
  kind: 'competition',
  startsAt: '2026-11-21T18:00:00.000Z',
  endsAt: '2026-11-21T20:00:00.000Z',
});

export const breaking: PublicPass = {
  id: 'breaking',
  name: 'Breaking',
  passClass: 'full',
  priceCents: 200000,
  requiresPassClass: null,
  selectableActivities: [activity('bboy', 'Bboy'), activity('bgirl', 'Bgirl')],
  includedActivities: [],
};

export const popping: PublicPass = {
  ...breaking,
  id: 'popping',
  name: 'Popping',
  selectableActivities: [activity('popping-1v1', '1v1')],
};

export const general: PublicPass = {
  id: 'general',
  name: 'Entrada general',
  passClass: 'general',
  priceCents: 100000,
  requiresPassClass: null,
  selectableActivities: [],
  includedActivities: [],
};

export const openStyles: PublicPass = {
  id: 'open-styles',
  name: 'Open Styles',
  passClass: 'add_on',
  priceCents: 80000,
  requiresPassClass: 'full',
  selectableActivities: [],
  includedActivities: [activity('open-1v1', 'Competencia 1vs1')],
};

export const catalogPasses = [breaking, popping, general, openStyles];
