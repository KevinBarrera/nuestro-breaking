import { describe, expect, it } from 'vitest';
import type { AdminRegistrationFailure, HeldPass } from '@/entities/admin-registration';
import type { CatalogPassType, PassClass, RequiredPassClass } from '@/entities/event-catalog';
import {
  removalBlockers,
  removalBlockersHint,
  removePassConfirmation,
  removePassFailure,
} from './sale-pass-removal-model';

const passType = (
  id: string,
  passClass: PassClass,
  requiresPassClass: RequiredPassClass | null = null,
): CatalogPassType => ({
  id,
  eventId: 'event-1',
  name: `Pase ${id}`,
  passClass,
  priceCents: 10000,
  requiresPassClass,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 1,
  activities: [],
});

const held = (passTypeId: string, passClass: PassClass, name = `Pase ${passTypeId}`): HeldPass => ({
  registrationPassId: `held-${passTypeId}`,
  passTypeId,
  name,
  passClass,
  priceCents: 150000,
  selections: [],
});

const passTypes = [
  passType('breaking', 'full'),
  passType('popping', 'full'),
  passType('general', 'general'),
  passType('openStyles', 'add_on', 'full'),
  passType('topRock', 'add_on', 'full'),
  passType('afterParty', 'add_on', 'general'),
  passType('workshop', 'add_on'),
];

describe('removalBlockers', () => {
  const breaking = held('breaking', 'full', 'Pase completo');
  const openStyles = held('openStyles', 'add_on', 'Open Styles');

  it('names the held add-ons that require the class of the only pass that has it', () => {
    const topRock = held('topRock', 'add_on', 'Top Rock');
    const workshop = held('workshop', 'add_on', 'Taller');
    expect(removalBlockers([breaking, openStyles, topRock, workshop], breaking, passTypes)).toEqual(
      ['Open Styles', 'Top Rock'],
    );
  });

  it('lets another held pass of the same class keep the add-on', () => {
    const popping = held('popping', 'full');
    expect(removalBlockers([breaking, popping, openStyles], breaking, passTypes)).toEqual([]);
  });

  it('ignores add-ons that require another class, and the add-ons themselves', () => {
    const general = held('general', 'general');
    const afterParty = held('afterParty', 'add_on');
    expect(removalBlockers([general, afterParty, openStyles], openStyles, passTypes)).toEqual([]);
    expect(removalBlockers([breaking, afterParty], breaking, passTypes)).toEqual([]);
    expect(removalBlockers([general, afterParty], general, passTypes)).toEqual(['Pase afterParty']);
  });

  it('leaves the check to the backend when the pass types could not be read', () => {
    expect(removalBlockers([breaking, openStyles], breaking, null)).toEqual([]);
  });
});

describe('removalBlockersHint', () => {
  it('names one add-on or several, and nothing when none blocks', () => {
    expect(removalBlockersHint([])).toBeNull();
    expect(removalBlockersHint(['Open Styles'])).toBe(
      'Quita primero «Open Styles», que requiere este pase.',
    );
    expect(removalBlockersHint(['Open Styles', 'Top Rock'])).toBe(
      'Quita primero «Open Styles» y «Top Rock», que requieren este pase.',
    );
  });
});

describe('removePassConfirmation', () => {
  it('names the pass and its price, and says its competitions go too', () => {
    expect(removePassConfirmation(held('breaking', 'full', 'Pase completo'))).toEqual({
      title: '¿Quitar «Pase completo»?',
      consequence:
        'Se descuentan $1,500.00 del total. También se quitan las competencias elegidas con este pase.',
    });
  });
});

describe('removePassFailure', () => {
  const failure = (value: AdminRegistrationFailure) => removePassFailure(value);

  it('says when the account has no access', () => {
    for (const kind of ['unauthorized', 'forbidden'] as const)
      expect(failure({ kind })).toEqual({
        message: 'Sin acceso: tu cuenta no puede quitar pases en este evento.',
        reload: false,
      });
  });

  it('never offers a blind retry when the answer was lost', () => {
    expect(failure({ kind: 'unknown' })).toEqual({
      message:
        'No pudimos confirmar si el pase se quitó. Recarga la inscripción antes de intentarlo de nuevo.',
      reload: true,
    });
  });

  it('explains each removal rule and asks for a reload', () => {
    expect(failure({ kind: 'rule', code: 'registration_not_pending' })).toEqual({
      message: 'Esta inscripción ya no está pendiente de pago. Recarga para ver su estado.',
      reload: true,
    });
    expect(failure({ kind: 'rule', code: 'online_registration_pass_locked' })).toEqual({
      message: 'Esta inscripción se hizo en línea: sus pases no se pueden quitar.',
      reload: true,
    });
    expect(failure({ kind: 'rule', code: 'pass_required_by_add_on' })).toEqual({
      message: 'Un pase adicional requiere este pase. Recarga para ver cuál quitar primero.',
      reload: true,
    });
    expect(failure({ kind: 'rule', code: 'receipt_taken' })).toEqual({
      message: 'La inscripción cambió. Recarga para ver su estado.',
      reload: true,
    });
  });

  it('asks for a reload when the pass or registration is gone', () => {
    expect(failure({ kind: 'not_found' })).toEqual({
      message: 'No encontramos este pase o la inscripción. Recarga para ver los datos actuales.',
      reload: true,
    });
  });

  it('falls back to a plain retry message', () => {
    expect(failure({ kind: 'error' })).toEqual({
      message: 'No pudimos quitar el pase. Intenta de nuevo.',
      reload: false,
    });
  });
});
