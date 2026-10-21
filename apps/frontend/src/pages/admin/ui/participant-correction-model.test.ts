import { describe, expect, it } from 'vitest';
import type { AdminRegistrationFailure, RegistrationSummary } from '@/entities/admin-registration';
import {
  canCorrectParticipant,
  correctionErrors,
  correctionFailure,
  correctionHasChanges,
  correctionInput,
  correctionReasonError,
  correctionReasonHint,
  crossEventWarning,
  initialCorrectionForm,
  legacyNameHint,
  type CorrectionForm,
} from './participant-correction-model';

const summary = (overrides: Partial<RegistrationSummary> = {}): RegistrationSummary => ({
  id: 'reg-1',
  status: 'confirmed',
  folio: 'LMP-7K3Q',
  channel: 'in_person',
  participant: {
    fullName: 'Ana López Ruiz',
    firstName: 'Ana',
    firstLastName: 'López',
    secondLastName: 'Ruiz',
    stageName: 'Bgirl Ana',
  },
  ...overrides,
});

const legacy = summary({
  participant: {
    fullName: 'Ana López',
    firstName: null,
    firstLastName: null,
    secondLastName: null,
    stageName: null,
  },
});

const form = (overrides: Partial<CorrectionForm> = {}): CorrectionForm => ({
  firstName: 'Ana',
  firstLastName: 'López',
  secondLastName: 'Ruiz',
  stageName: 'Bgirl Ana',
  ...overrides,
});

describe('canCorrectParticipant', () => {
  it('offers the correction on pending and confirmed registrations, online or in person', () => {
    expect(canCorrectParticipant(summary())).toBe(true);
    expect(canCorrectParticipant(summary({ status: 'pending_payment', folio: null }))).toBe(true);
    expect(canCorrectParticipant(summary({ channel: 'online' }))).toBe(true);
  });

  it('leaves out voided registrations', () => {
    expect(canCorrectParticipant(summary({ status: 'voided', folio: null }))).toBe(false);
  });
});

describe('initialCorrectionForm', () => {
  it('starts from the stored name parts and AKA', () => {
    expect(initialCorrectionForm(summary())).toEqual(form());
  });

  it('leaves the parts of a legacy participant empty instead of guessing them', () => {
    expect(initialCorrectionForm(legacy)).toEqual({
      firstName: '',
      firstLastName: '',
      secondLastName: '',
      stageName: '',
    });
    expect(legacyNameHint(legacy)).toBe(
      'Esta inscripción guardó el nombre completo (Ana López) sin separarlo: escribe el nombre y los apellidos por separado.',
    );
    expect(legacyNameHint(summary())).toBeNull();
  });
});

describe('correctionErrors', () => {
  it('requires the first name and first last name', () => {
    expect(correctionErrors(form({ firstName: '  ', firstLastName: '' }))).toEqual({
      firstName: 'Escribe el nombre.',
      firstLastName: 'Escribe el primer apellido.',
    });
  });

  it('allows blank optional parts and caps every part at 100 characters', () => {
    expect(correctionErrors(form({ secondLastName: ' ', stageName: '' }))).toEqual({});
    expect(
      correctionErrors(
        form({
          firstName: 'x'.repeat(101),
          stageName: 'y'.repeat(101),
          secondLastName: 'z'.repeat(100),
        }),
      ),
    ).toEqual({ firstName: 'Usa máximo 100 caracteres.', stageName: 'Usa máximo 100 caracteres.' });
  });

  it('counts the length after collapsing inner spaces, as the backend does', () => {
    expect(correctionErrors(form({ firstName: `${'x'.repeat(50)}    ${'x'.repeat(49)}` }))).toEqual(
      {},
    );
  });
});

describe('correctionReasonError and correctionReasonHint', () => {
  it('requires a reason of 1 to 500 characters once trimmed', () => {
    expect(correctionReasonError('   ')).toBe('Escribe el motivo de la corrección.');
    expect(correctionReasonError('x'.repeat(501))).toBe('Usa máximo 500 caracteres.');
    expect(correctionReasonError(` ${'x'.repeat(500)} `)).toBeUndefined();
  });

  it('says the reason stays in the history and counts the trimmed characters', () => {
    expect(correctionReasonHint('  Typo ')).toBe('Queda en el historial. 4 de 500 caracteres.');
  });
});

describe('correctionHasChanges', () => {
  it('ignores surrounding and repeated spaces', () => {
    expect(correctionHasChanges(form(), summary())).toBe(false);
    expect(
      correctionHasChanges(form({ firstName: '  Ana ', stageName: 'Bgirl   Ana' }), summary()),
    ).toBe(false);
  });

  it('sees a changed, cleared or newly filled part', () => {
    expect(correctionHasChanges(form({ firstName: 'Anna' }), summary())).toBe(true);
    expect(correctionHasChanges(form({ stageName: '' }), summary())).toBe(true);
    expect(correctionHasChanges(form({ secondLastName: '' }), summary())).toBe(true);
    expect(
      correctionHasChanges(
        { firstName: 'Ana', firstLastName: 'López', secondLastName: '', stageName: '' },
        legacy,
      ),
    ).toBe(true);
  });
});

describe('correctionInput', () => {
  it('trims all four parts, keeping blank ones so they are cleared, and the reason', () => {
    expect(
      correctionInput(form({ firstName: ' Ana ', stageName: '  ' }), '  Error de captura '),
    ).toEqual({
      firstName: 'Ana',
      firstLastName: 'López',
      secondLastName: 'Ruiz',
      stageName: '',
      reason: 'Error de captura',
    });
  });
});

describe('crossEventWarning', () => {
  it('counts the other events in singular and plural', () => {
    expect(crossEventWarning(1)).toBe(
      'Esta persona aparece en 1 evento más. Esos registros no cambian.',
    );
    expect(crossEventWarning(2)).toBe(
      'Esta persona aparece en 2 eventos más. Esos registros no cambian.',
    );
  });
});

describe('correctionFailure', () => {
  it('puts a rejected reason and rejected parts under their fields', () => {
    expect(correctionFailure({ kind: 'invalid', fieldErrors: { reason: 'invalid' } })).toEqual({
      fields: { reason: 'Escribe un motivo de 1 a 500 caracteres.' },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
    expect(
      correctionFailure({
        kind: 'invalid',
        fieldErrors: { firstName: 'required', stageName: 'too_long' },
      }),
    ).toEqual({
      fields: { firstName: 'Escribe el nombre.', stageName: 'Usa máximo 100 caracteres.' },
      message: 'Revisa los datos marcados.',
      reload: false,
    });
  });

  it('explains an invalid answer it cannot place on a field', () => {
    expect(correctionFailure({ kind: 'invalid', fieldErrors: { email: 'unknown_field' } })).toEqual(
      {
        fields: {},
        message: 'No pudimos guardar la corrección. Revisa los datos e intenta de nuevo.',
        reload: false,
      },
    );
  });

  it('asks for a reload when the screen is stale or the outcome is unknown', () => {
    const reloads: [AdminRegistrationFailure, string][] = [
      [
        { kind: 'rule', code: 'correction_no_changes' },
        'La inscripción ya tiene ese nombre y AKA. Recarga para ver los datos actuales.',
      ],
      [
        { kind: 'rule', code: 'registration_voided' },
        'Esta inscripción se anuló y ya no se puede corregir. Recarga para ver su estado.',
      ],
      [
        { kind: 'unknown' },
        'No pudimos confirmar si la corrección se guardó. Recarga la inscripción antes de intentarlo de nuevo.',
      ],
      [
        { kind: 'not_found' },
        'No encontramos esta inscripción en este evento. Recarga para ver los datos actuales.',
      ],
      [
        { kind: 'rule', code: 'receipt_taken' },
        'La inscripción cambió. Recarga para ver su estado.',
      ],
    ];
    for (const [failure, message] of reloads)
      expect(correctionFailure(failure)).toEqual({ fields: {}, message, reload: true });
  });

  it('reports denied access and other errors without a reload', () => {
    expect(correctionFailure({ kind: 'forbidden' })).toEqual({
      fields: {},
      message: 'Sin acceso: tu cuenta no puede corregir inscripciones en este evento.',
      reload: false,
    });
    expect(correctionFailure({ kind: 'error' })).toEqual({
      fields: {},
      message: 'No pudimos guardar la corrección. Intenta de nuevo.',
      reload: false,
    });
  });
});
