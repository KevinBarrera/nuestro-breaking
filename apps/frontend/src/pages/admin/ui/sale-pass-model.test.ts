import { describe, expect, it } from 'vitest';
import {
  adminRegistrationRuleCodes,
  type AdminRegistrationFailure,
  type HeldPass,
} from '@/entities/admin-registration';
import type { CatalogPassType, PassClass, RequiredPassClass } from '@/entities/event-catalog';
import { addPassConfirmation, addPassFailure, salePassOptions } from './sale-pass-model';

const passType = (
  id: string,
  passClass: PassClass,
  overrides: Partial<CatalogPassType> & { requiresPassClass?: RequiredPassClass | null } = {},
): CatalogPassType => ({
  id,
  eventId: 'event-1',
  name: `Pase ${id}`,
  passClass,
  priceCents: 10000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 1,
  activities: [],
  ...overrides,
});

const held = (passTypeId: string, passClass: PassClass): HeldPass => ({
  registrationPassId: `held-${passTypeId}`,
  passTypeId,
  name: `Pase ${passTypeId}`,
  passClass,
  priceCents: 10000,
  selections: [],
});

const full = passType('full', 'full', { name: 'Pase completo', priceCents: 150000 });
const general = passType('general', 'general', { name: 'Entrada general', priceCents: 30000 });
const fullAddOn = passType('fullAddOn', 'add_on', { requiresPassClass: 'full' });
const generalAddOn = passType('generalAddOn', 'add_on', { requiresPassClass: 'general' });
const freeAddOn = passType('freeAddOn', 'add_on');

const reasons = (passTypes: CatalogPassType[], heldPasses: HeldPass[]) =>
  Object.fromEntries(
    salePassOptions(passTypes, heldPasses).map((option) => [option.passTypeId, option.reason]),
  );

describe('salePassOptions', () => {
  it('lists the active pass types in catalog order with name, class and price', () => {
    const archived = passType('archived', 'general', { status: 'archived' });
    expect(salePassOptions([full, archived, general], [])).toEqual([
      {
        passTypeId: 'full',
        name: 'Pase completo',
        passClass: 'full',
        priceCents: 150000,
        reason: null,
      },
      {
        passTypeId: 'general',
        name: 'Entrada general',
        passClass: 'general',
        priceCents: 30000,
        reason: null,
      },
    ]);
  });

  it('disables a pass type the registration already holds', () => {
    expect(reasons([full, freeAddOn], [held('full', 'full'), held('freeAddOn', 'add_on')])).toEqual(
      expect.objectContaining({ full: 'Ya tiene este pase.', freeAddOn: 'Ya tiene este pase.' }),
    );
  });

  it('disables general entry when a full pass is held, and the other way around', () => {
    expect(reasons([general], [held('full', 'full')]).general).toBe(
      'El pase completo ya incluye la entrada general.',
    );
    expect(reasons([full], [held('general', 'general')]).full).toBe(
      'Ya tiene entrada general y el pase completo la incluye.',
    );
  });

  it('counts held passes of archived pass types, as the backend does', () => {
    // The held full pass is no longer in the catalog list at all.
    expect(reasons([general, fullAddOn], [held('retiredFull', 'full')])).toEqual({
      general: 'El pase completo ya incluye la entrada general.',
      fullAddOn: null,
    });
  });

  it('disables an add-on until the registration holds the pass class it requires', () => {
    expect(reasons([fullAddOn, generalAddOn, freeAddOn], [])).toEqual({
      fullAddOn: 'Primero agrega un pase completo.',
      generalAddOn: 'Primero agrega una entrada general.',
      freeAddOn: null,
    });
    // A full pass includes general entry, but the backend still asks for a general pass.
    expect(reasons([fullAddOn, generalAddOn], [held('full', 'full')])).toEqual({
      fullAddOn: null,
      generalAddOn: 'Primero agrega una entrada general.',
    });
  });

  it('never blocks an add-on for holding both general and full', () => {
    expect(
      reasons([freeAddOn], [held('full', 'full'), held('general', 'general')]).freeAddOn,
    ).toBeNull();
  });
});

describe('addPassConfirmation', () => {
  it('names the pass and its price, and says when it is charged', () => {
    const [option] = salePassOptions([full], []);
    expect(addPassConfirmation(option)).toEqual({
      title: '¿Agregar «Pase completo» por $1,500.00?',
      consequence: 'El cobro se hace al confirmar el pago. Hasta entonces puedes quitarlo.',
    });
  });
});

describe('addPassFailure', () => {
  const failure = (value: AdminRegistrationFailure) => addPassFailure(value);

  it('never offers a blind retry when the answer was lost', () => {
    expect(failure({ kind: 'unknown' })).toEqual({
      message:
        'No pudimos confirmar si el pase se agregó. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
  });

  it('says when the account has no access', () => {
    for (const kind of ['unauthorized', 'forbidden'] as const)
      expect(failure({ kind })).toEqual({
        message: 'Sin acceso: tu cuenta no puede agregar pases en este evento.',
        reload: false,
      });
  });

  it('gives every pass rule its own message and a reload, since the screen is stale', () => {
    const messages = adminRegistrationRuleCodes.map((code) => failure({ kind: 'rule', code }));
    for (const result of messages) {
      expect(result.reload).toBe(true);
      expect(result.message).not.toBe('No pudimos agregar el pase. Intenta de nuevo.');
    }
    expect(failure({ kind: 'rule', code: 'pass_already_held' }).message).toBe(
      'La inscripción ya tiene este pase. Recarga para ver sus pases actuales.',
    );
    expect(failure({ kind: 'rule', code: 'registration_not_pending' }).message).toBe(
      'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
    );
  });

  it('asks for a reload when the pass type or registration is gone', () => {
    expect(failure({ kind: 'not_found' })).toEqual({
      message: 'No encontramos este pase o la inscripción. Recarga para ver los datos actuales.',
      reload: true,
    });
  });

  it('falls back to a plain retry message', () => {
    expect(failure({ kind: 'error' })).toEqual({
      message: 'No pudimos agregar el pase. Intenta de nuevo.',
      reload: false,
    });
  });
});
