import type {
  HeldPass,
  RegistrationEntitlements,
  RegistrationStatus,
} from '@/entities/admin-registration';
import type { CatalogActivity, CatalogPassType } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  canSwapDiscipline,
  disciplineSwapConfirmation,
  disciplineSwapFailure,
  disciplineSwapOptions,
  reviewDisciplineSwap,
  swapReasonError,
} from './discipline-swap-model';

const eventId = 'event-1';

const passType = (
  id: string,
  name: string,
  overrides: Partial<CatalogPassType> = {},
): CatalogPassType => ({
  id,
  eventId,
  name,
  passClass: 'full',
  priceCents: 80000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 1,
  activities: [],
  ...overrides,
});

const activity = (id: string, name: string, startsAt: string, status = 'active') =>
  ({
    id,
    eventId,
    venueId: 'venue-1',
    kind: 'competition',
    name,
    startsAt,
    endsAt: startsAt,
    status,
    version: 1,
  }) as CatalogActivity;

const activities = [
  activity('popping-1v1', 'Popping 1vs1', '2026-11-14T18:00:00Z'),
  activity('popping-2v2', 'Popping 2vs2', '2026-11-14T16:00:00Z'),
  activity('popping-old', 'Popping 3vs3', '2026-11-14T17:00:00Z', 'archived'),
  activity('breaking-1v1', 'Breaking 1vs1', '2026-11-14T15:00:00Z'),
  activity('popping-workshop', 'Taller de popping', '2026-11-14T12:00:00Z'),
];

const breaking = passType('breaking', 'Breaking', {
  activities: [{ activityId: 'breaking-1v1', access: 'selectable' }],
});
const popping = passType('popping', 'Popping', {
  activities: [
    { activityId: 'popping-1v1', access: 'selectable' },
    { activityId: 'popping-2v2', access: 'selectable' },
    { activityId: 'popping-old', access: 'selectable' },
    { activityId: 'popping-workshop', access: 'included' },
  ],
});
const locking = passType('locking', 'Locking', { priceCents: 90000 });
const dancehall = passType('dancehall', 'Dancehall', { status: 'archived' });
const general = passType('general', 'General', { passClass: 'general' });
const catalog = [breaking, popping, locking, dancehall, general];

const held = (passTypeId: string, overrides: Partial<HeldPass> = {}): HeldPass => ({
  registrationPassId: `held-${passTypeId}`,
  passTypeId,
  name: catalog.find((type) => type.id === passTypeId)?.name ?? passTypeId,
  passClass: catalog.find((type) => type.id === passTypeId)?.passClass ?? 'full',
  // The snapshot of what was charged; the swap compares current catalog prices.
  priceCents: 70000,
  selections: ['breaking-1v1'],
  ...overrides,
});

const entitlements = (
  passes: HeldPass[],
  status: RegistrationStatus = 'confirmed',
): RegistrationEntitlements => ({
  registration: {
    id: 'registration-1',
    status,
    folio: status === 'confirmed' ? 'LMP-7K3Q' : null,
    channel: 'online',
    participant: {
      fullName: 'Alex Rivera',
      firstName: 'Alex',
      firstLastName: 'Rivera',
      secondLastName: null,
      stageName: null,
    },
  },
  passes,
  accessibleActivityIds: [],
});

describe('canSwapDiscipline', () => {
  it('offers the swap on pending and confirmed registrations with exactly one full pass', () => {
    expect(canSwapDiscipline(entitlements([held('breaking')], 'confirmed'))).toBe(true);
    expect(canSwapDiscipline(entitlements([held('breaking')], 'pending_payment'))).toBe(true);
    expect(
      canSwapDiscipline(
        entitlements([held('breaking'), held('general', { passClass: 'add_on' })], 'confirmed'),
      ),
    ).toBe(true);
  });

  it('never offers it on a voided registration or without exactly one full pass', () => {
    expect(canSwapDiscipline(entitlements([held('breaking')], 'voided'))).toBe(false);
    expect(canSwapDiscipline(entitlements([]))).toBe(false);
    expect(canSwapDiscipline(entitlements([held('general')]))).toBe(false);
    expect(canSwapDiscipline(entitlements([held('breaking'), held('popping')]))).toBe(false);
  });
});

describe('disciplineSwapOptions', () => {
  it('lists the other active full passes with the same current price and their competitions', () => {
    const options = disciplineSwapOptions(held('breaking'), catalog, activities);
    expect(options).toEqual({
      status: 'ready',
      from: { name: 'Breaking', priceCents: 80000, selected: 'Breaking 1vs1' },
      targets: [
        {
          passTypeId: 'popping',
          name: 'Popping',
          priceCents: 80000,
          // Active selectable competitions by start time; included workshops are not choices.
          choices: [
            { activityId: 'popping-2v2', name: 'Popping 2vs2', available: true },
            { activityId: 'popping-1v1', name: 'Popping 1vs1', available: true },
          ],
        },
      ],
    });
  });

  it('explains when no other full pass has the same current price', () => {
    const options = disciplineSwapOptions(held('locking'), catalog, activities);
    expect(options).toMatchObject({ status: 'none' });
    expect(options.status === 'none' && options.message).toBe(
      'Ningún otro pase completo activo cuesta lo mismo que «Locking» ($900.00). El cambio de disciplina solo se hace entre pases del mismo precio actual.',
    );
  });

  it('reports an unreadable catalog or a held pass type missing from it', () => {
    expect(disciplineSwapOptions(held('breaking'), null, activities)).toEqual({
      status: 'unavailable',
    });
    expect(disciplineSwapOptions(held('breaking'), catalog, null)).toEqual({
      status: 'unavailable',
    });
    expect(disciplineSwapOptions(held('gone'), catalog, activities)).toEqual({
      status: 'unavailable',
    });
  });
});

describe('reviewDisciplineSwap', () => {
  const [target] = (() => {
    const options = disciplineSwapOptions(held('breaking'), catalog, activities);
    return options.status === 'ready' ? options.targets : [];
  })();

  it('sends the target, its checked competitions in the order shown and the trimmed reason', () => {
    expect(
      reviewDisciplineSwap(target, ['popping-1v1', 'popping-2v2'], '  Pidió popping  '),
    ).toEqual({
      ok: true,
      input: {
        toPassTypeId: 'popping',
        activityIds: ['popping-2v2', 'popping-1v1'],
        reason: 'Pidió popping',
      },
    });
  });

  it('allows a swap without competitions and drops ids that are not choices of the target', () => {
    expect(reviewDisciplineSwap(target, ['breaking-1v1'], 'Cambio')).toEqual({
      ok: true,
      input: { toPassTypeId: 'popping', activityIds: [], reason: 'Cambio' },
    });
  });

  it('reports a missing target and a blank or long reason at once', () => {
    expect(reviewDisciplineSwap(null, [], '   ')).toEqual({
      ok: false,
      errors: {
        toPassTypeId: 'Elige el pase al que cambia.',
        reason: 'Escribe el motivo del cambio.',
      },
    });
    expect(reviewDisciplineSwap(target, [], 'x'.repeat(501))).toEqual({
      ok: false,
      errors: { reason: 'Usa máximo 500 caracteres.' },
    });
    expect(swapReasonError('x'.repeat(500))).toBeUndefined();
  });
});

describe('disciplineSwapConfirmation', () => {
  it('summarizes the pass and competitions before and after with the reason', () => {
    const options = disciplineSwapOptions(held('breaking'), catalog, activities);
    if (options.status !== 'ready') throw new Error('Expected targets');
    expect(
      disciplineSwapConfirmation(
        options.from,
        options.targets[0],
        ['popping-1v1'],
        'Pidió popping',
      ),
    ).toEqual({
      title: '¿Cambiar «Breaking» por «Popping»?',
      consequence:
        'Antes: Breaking (Breaking 1vs1). Después: Popping (Popping 1vs1). Motivo: Pidió popping. El monto cobrado no cambia y el cambio quedará registrado con este motivo.',
    });
    expect(
      disciplineSwapConfirmation(
        { ...options.from, selected: null },
        options.targets[0],
        [],
        'Cambio',
      ).consequence,
    ).toContain('Antes: Breaking (Sin competencias). Después: Popping (Sin competencias).');
  });
});

describe('disciplineSwapFailure', () => {
  it('puts a rejected reason or target under its field', () => {
    expect(disciplineSwapFailure({ kind: 'invalid', fieldErrors: { reason: 'invalid' } })).toEqual({
      fields: { reason: 'Escribe un motivo de 1 a 500 caracteres.' },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
    expect(
      disciplineSwapFailure({ kind: 'invalid', fieldErrors: { toPassTypeId: 'required' } }),
    ).toEqual({
      fields: { toPassTypeId: 'Elige el pase al que cambia.' },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
    expect(
      disciplineSwapFailure({ kind: 'invalid', fieldErrors: { 'activityIds[0]': 'duplicate' } }),
    ).toEqual({
      fields: {},
      message: 'No pudimos cambiar la disciplina. Revisa los datos e intenta de nuevo.',
      reload: false,
    });
  });

  it('explains a check-in without offering a reload, since the screen cannot show it', () => {
    expect(disciplineSwapFailure({ kind: 'rule', code: 'discipline_swap_checked_in' })).toEqual({
      fields: {},
      message:
        'Esta persona ya registró su entrada al evento, así que su disciplina ya no se puede cambiar.',
      reload: false,
    });
  });

  it('offers a reload for stale data and lost answers', () => {
    const stale = [
      [
        'registration_voided',
        'Esta inscripción se anuló y ya no admite cambios. Recarga para ver su estado.',
      ],
      [
        'discipline_swap_single_full_pass_required',
        'La inscripción ya no tiene un solo pase completo. Recarga para ver sus pases.',
      ],
      [
        'discipline_swap_invalid_target',
        'Ese pase ya no está disponible para el cambio. Recarga para ver los pases actuales.',
      ],
      [
        'discipline_swap_price_mismatch',
        'Los precios de los pases cambiaron y ya no coinciden. Recarga para ver los pases actuales.',
      ],
      [
        'invalid_activity_selection',
        'Alguna competencia ya no está disponible para ese pase. Recarga para ver las competencias actuales.',
      ],
      ['registration_not_pending', 'La inscripción cambió. Recarga para ver su estado.'],
    ] as const;
    for (const [code, message] of stale)
      expect(disciplineSwapFailure({ kind: 'rule', code })).toEqual({
        fields: {},
        message,
        reload: true,
      });
    expect(disciplineSwapFailure({ kind: 'unknown' })).toEqual({
      fields: {},
      message:
        'No pudimos confirmar si se cambió la disciplina. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
    expect(disciplineSwapFailure({ kind: 'not_found' }).reload).toBe(true);
  });

  it('keeps access and other errors in the form', () => {
    expect(disciplineSwapFailure({ kind: 'forbidden' })).toEqual({
      fields: {},
      message: 'Sin acceso: tu cuenta no puede cambiar disciplinas en este evento.',
      reload: false,
    });
    expect(disciplineSwapFailure({ kind: 'error' })).toEqual({
      fields: {},
      message: 'No pudimos cambiar la disciplina. Intenta de nuevo.',
      reload: false,
    });
  });
});
