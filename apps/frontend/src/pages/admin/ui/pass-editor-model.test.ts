import type { CatalogActivity, CatalogPassType, EventWindow } from '@/entities/event-catalog';
import { describe, expect, it } from 'vitest';
import {
  accessCounter,
  accessDays,
  accessWarning,
  archiveBuyers,
  checkClose,
  closePresets,
  draftChangeRows,
  draftInput,
  filterAccessDays,
  isDraftDirty,
  passDraft,
  passPreview,
  priceNote,
  setDayAccess,
  type PassDraft,
} from './pass-editor-model';

// Mexico City is UTC-6 in November; the event runs Saturday 21 and Sunday 22.
const timeZone = 'America/Mexico_City';
const eventWindow: EventWindow = {
  startsAt: '2026-11-21T16:00:00.000Z', // Saturday 10:00
  endsAt: '2026-11-23T05:59:00.000Z', // Sunday 23:59
};

const activity = (
  id: string,
  name: string,
  startsAt: string,
  status = 'active',
): CatalogActivity => ({
  id,
  eventId: 'event',
  venueId: 'venue',
  kind: 'competition',
  name,
  startsAt,
  endsAt: new Date(Date.parse(startsAt) + 3600_000).toISOString(),
  status: status as CatalogActivity['status'],
  version: 1,
});

const toprock = activity('toprock', 'Breaking 1v1 Toprock', '2026-11-21T16:00:00.000Z');
const footwork = activity('footwork', 'Breaking Footwork', '2026-11-21T17:00:00.000Z');
const popping = activity('popping', 'Popping 1v1', '2026-11-22T16:00:00.000Z');
const locking = activity('locking', 'Locking 1v1', '2026-11-22T17:00:00.000Z');
const old = activity('old', 'Vieja', '2026-11-22T18:00:00.000Z', 'archived');
const activities = [locking, popping, footwork, toprock, old];

const pass: CatalogPassType = {
  id: 'breaking',
  eventId: 'event',
  name: 'Pase completo Breaking',
  passClass: 'full',
  priceCents: 200000,
  requiresPassClass: null,
  onlineSalesClosesAt: null,
  status: 'active',
  version: 3,
  activities: [
    { activityId: 'toprock', access: 'selectable' },
    { activityId: 'footwork', access: 'selectable' },
  ],
};

const draftOf = (overrides: Partial<PassDraft> = {}): PassDraft => ({
  ...passDraft(pass, timeZone, eventWindow),
  ...overrides,
});

describe('passDraft', () => {
  it('starts a new pass empty, as a full pass that follows the event sale', () => {
    expect(passDraft(undefined, timeZone, eventWindow)).toEqual({
      name: '',
      passClass: 'full',
      price: '',
      requires: '',
      closes: false,
      closeDay: '2026-11-20',
      closeTime: '23:59',
      choices: {},
    });
    expect(passDraft(undefined, timeZone, null).closeDay).toBe('');
  });

  it('reads a stored pass on the event clock', () => {
    expect(
      passDraft(
        { ...pass, onlineSalesClosesAt: '2026-11-20T05:59:00.000Z', requiresPassClass: null },
        timeZone,
        eventWindow,
      ),
    ).toEqual({
      name: 'Pase completo Breaking',
      passClass: 'full',
      price: '2000.00',
      requires: '',
      closes: true,
      closeDay: '2026-11-19',
      closeTime: '23:59',
      choices: { toprock: 'selectable', footwork: 'selectable' },
    });
  });
});

describe('closePresets', () => {
  it('offers the day before the event at 23:59 and the event start', () => {
    expect(closePresets(eventWindow, timeZone)).toEqual([
      { label: 'Un día antes del evento', day: '2026-11-20', time: '23:59' },
      { label: 'Al empezar el evento', day: '2026-11-21', time: '10:00' },
    ]);
    expect(closePresets(null, timeZone)).toEqual([]);
  });
});

describe('checkClose', () => {
  it('reads the close moment as a sentence on the event clock', () => {
    expect(checkClose(draftOf({ closes: true }), timeZone, eventWindow)).toEqual({
      kind: 'ok',
      at: '2026-11-21T05:59:00.000Z',
      sentence: 'Se deja de vender en línea el viernes 20 de noviembre a las 23:59.',
      note: 'Hora de Ciudad de México. En mesa se sigue vendiendo.',
      afterEvent: false,
    });
  });

  it('warns that a date after the event has no effect', () => {
    const result = checkClose(
      draftOf({ closes: true, closeDay: '2026-11-24', closeTime: '12:00' }),
      timeZone,
      eventWindow,
    );
    expect(result).toMatchObject({
      kind: 'ok',
      afterEvent: true,
      note: 'Esa fecha es después del evento (21 y 22 de noviembre): no tendrá efecto.',
    });
  });

  it('asks for a day and a 24-hour time otherwise', () => {
    for (const draft of [
      draftOf({ closes: true, closeTime: '25:00' }),
      draftOf({ closes: true, closeTime: '9:30' }),
      draftOf({ closes: true, closeDay: '' }),
    ])
      expect(checkClose(draft, timeZone, eventWindow)).toEqual({
        kind: 'invalid',
        message: 'Elige el día y escribe la hora, por ejemplo 23:59.',
      });
  });

  it('follows the event sale when no date is set', () => {
    expect(checkClose(draftOf(), timeZone, eventWindow)).toEqual({ kind: 'none' });
  });
});

describe('draftInput', () => {
  it('builds the input, sending the required class only for add-ons', () => {
    expect(draftInput(draftOf({ requires: 'full' }), timeZone, eventWindow)).toEqual({
      ok: true,
      input: {
        name: 'Pase completo Breaking',
        passClass: 'full',
        priceCents: 200000,
        requiresPassClass: null,
        onlineSalesClosesAt: null,
      },
    });
    const addOn = draftInput(
      draftOf({
        name: ' Open Styles ',
        passClass: 'add_on',
        price: '800',
        requires: 'full',
        closes: true,
      }),
      timeZone,
      eventWindow,
    );
    expect(addOn).toEqual({
      ok: true,
      input: {
        name: 'Open Styles',
        passClass: 'add_on',
        priceCents: 80000,
        requiresPassClass: 'full',
        onlineSalesClosesAt: '2026-11-21T05:59:00.000Z',
      },
    });
  });

  it('accepts 0 as a free pass', () => {
    expect(draftInput(draftOf({ price: '0' }), timeZone, eventWindow)).toMatchObject({
      ok: true,
      input: { priceCents: 0 },
    });
  });

  it('names each invalid field', () => {
    expect(
      draftInput(
        draftOf({ name: '  ', price: '', closes: true, closeTime: 'x' }),
        timeZone,
        eventWindow,
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: 'Escribe el nombre del pase.',
        price: 'Escribe el precio. Usa 0 si es sin costo.',
        close: 'Elige el día y escribe la hora, por ejemplo 23:59.',
      },
    });
    expect(draftInput(draftOf({ price: '1,500' }), timeZone, eventWindow)).toEqual({
      ok: false,
      errors: {
        price:
          'Escribe un precio válido en pesos, sin separadores de miles y con hasta 2 decimales, por ejemplo 1500 o 1500,50.',
      },
    });
  });
});

describe('isDraftDirty', () => {
  it('compares a new draft with the empty one and an edit with the stored pass', () => {
    const fresh = passDraft(undefined, timeZone, eventWindow);
    expect(isDraftDirty(fresh, fresh)).toBe(false);
    expect(isDraftDirty(fresh, { ...fresh, choices: { toprock: 'none' } })).toBe(false);
    expect(isDraftDirty(fresh, { ...fresh, choices: { toprock: 'included' } })).toBe(true);
    expect(isDraftDirty(fresh, { ...fresh, closeTime: '10:00' })).toBe(false);
    expect(isDraftDirty(fresh, { ...fresh, closes: true })).toBe(true);
    expect(isDraftDirty(draftOf(), draftOf({ name: 'Otro' }))).toBe(true);
  });
});

describe('accessDays', () => {
  it('groups the active activities by event day in start order', () => {
    const days = accessDays(activities, timeZone);
    expect(days.map((day) => [day.label, day.activities.map((entry) => entry.id)])).toEqual([
      ['Sábado 21 de noviembre', ['toprock', 'footwork']],
      ['Domingo 22 de noviembre', ['popping', 'locking']],
    ]);
  });

  it('filters by accent-insensitive search and by access, dropping empty days', () => {
    const days = accessDays(activities, timeZone);
    const choices = { toprock: 'selectable' as const, popping: 'none' as const };
    expect(
      filterAccessDays(days, choices, 'TÓPROCK', false).map((day) => day.activities.length),
    ).toEqual([1]);
    expect(
      filterAccessDays(days, choices, '', true).flatMap((day) => day.activities.map((a) => a.id)),
    ).toEqual(['toprock']);
    expect(filterAccessDays(days, choices, 'zzz', false)).toEqual([]);
  });

  it('sets every activity of one day at once', () => {
    const [saturday] = accessDays(activities, timeZone);
    expect(setDayAccess(saturday!, { popping: 'included' }, 'selectable')).toEqual({
      popping: 'included',
      toprock: 'selectable',
      footwork: 'selectable',
    });
  });
});

describe('accessCounter', () => {
  it('counts included and eligible activities out of the active ones', () => {
    const days = accessDays(activities, timeZone);
    expect(
      accessCounter(days, { toprock: 'included', footwork: 'selectable', old: 'included' }),
    ).toBe('1 incluida · 1 elegible de 4');
    expect(accessCounter(days, {})).toBe('0 incluidas · 0 elegibles de 4');
  });
});

describe('accessWarning', () => {
  it('warns when a full pass or an add-on gives access to nothing', () => {
    const days = accessDays(activities, timeZone);
    expect(accessWarning('full', days, {})).toBe(
      'Un pase completo sin actividades no da acceso a ninguna competencia. Marca las que puede escoger o las que incluye.',
    );
    expect(accessWarning('add_on', days, { toprock: 'none' })).toBe(
      'Un adicional sin actividades no suma nada al pase completo. Marca al menos una como incluida.',
    );
    expect(accessWarning('general', days, {})).toBeNull();
    expect(accessWarning('full', days, { toprock: 'selectable' })).toBeNull();
  });
});

describe('draftChangeRows', () => {
  it('lists the changed fields and then each changed access, in the access order', () => {
    const draft = draftOf({
      price: '2200',
      closes: true,
      choices: { toprock: 'selectable', footwork: 'none', locking: 'included' },
    });
    const result = draftInput(draft, timeZone, eventWindow);
    if (!result.ok) throw new Error('invalid');
    expect(
      draftChangeRows(
        pass,
        result.input,
        draft.choices,
        accessDays(activities, timeZone),
        activities,
        timeZone,
      ).map((row) => [row.label, row.before, row.after]),
    ).toEqual([
      ['Precio', '$2,000.00', '$2,200.00'],
      ['Venta en línea', 'Mientras el evento venda', 'Hasta el 20 nov 2026, 23:59'],
      ['Breaking Footwork', 'Elegible', 'Sin acceso'],
      ['Locking 1v1', 'Sin acceso', 'Incluida'],
    ]);
  });

  it('is empty when nothing changed', () => {
    const draft = draftOf();
    const result = draftInput(draft, timeZone, eventWindow);
    if (!result.ok) throw new Error('invalid');
    expect(
      draftChangeRows(
        pass,
        result.input,
        draft.choices,
        accessDays(activities, timeZone),
        activities,
        timeZone,
      ),
    ).toEqual([]);
  });
});

describe('priceNote and archiveBuyers', () => {
  it('says buyers keep what they paid', () => {
    expect(priceNote(6)).toBe(
      'Las 6 personas que ya lo compraron conservan el precio que pagaron. El nuevo precio aplica a las ventas siguientes.',
    );
    expect(priceNote(1)).toBe(
      'La persona que ya lo compró conserva el precio que pagó. El nuevo precio aplica a las ventas siguientes.',
    );
    expect(priceNote(0)).toBe('El nuevo precio aplica a las ventas siguientes.');
    expect(priceNote(undefined)).toBe(
      'Quien ya lo compró conserva el precio que pagó. El nuevo precio aplica a las ventas siguientes.',
    );
  });

  it('says buyers keep an archived pass', () => {
    expect(archiveBuyers(6)).toBe('Las 6 personas que lo compraron lo conservan.');
    expect(archiveBuyers(1)).toBe('La persona que lo compró lo conserva.');
    expect(archiveBuyers(0)).toBeNull();
    expect(archiveBuyers(undefined)).toBe('Quien ya lo compró lo conserva.');
  });
});

describe('passPreview', () => {
  const days = accessDays(activities, timeZone);

  it('shows the pass as buyers see it', () => {
    expect(
      passPreview(
        draftOf({
          choices: { toprock: 'included', footwork: 'selectable', popping: 'selectable' },
        }),
        days,
        timeZone,
        eventWindow,
      ),
    ).toEqual({
      classLabel: 'Pase completo',
      name: 'Pase completo Breaking',
      named: true,
      price: '$2,000.00',
      requires: null,
      included: ['Breaking 1v1 Toprock'],
      selectableTitle: 'Escoge entre 2 competencias',
      selectable: 'Breaking Footwork, Popping 1v1',
      empty: null,
      sale: 'Venta en línea: mientras el evento venda.',
    });
  });

  it('shows placeholders, free passes, add-on requirements and the close date', () => {
    const preview = passPreview(
      draftOf({
        name: '',
        passClass: 'add_on',
        price: '0',
        requires: 'full',
        closes: true,
        choices: {},
      }),
      days,
      timeZone,
      eventWindow,
    );
    expect(preview).toMatchObject({
      classLabel: 'Adicional',
      name: 'Nombre del pase',
      named: false,
      price: 'Sin costo',
      requires: 'Requiere un pase completo',
      selectableTitle: null,
      empty: 'Sin actividades todavía.',
      sale: 'Venta en línea: hasta el 20 nov 2026, 23:59.',
    });
    expect(passPreview(draftOf({ price: 'abc' }), days, timeZone, eventWindow).price).toBe('$—');
    expect(
      passPreview(draftOf({ passClass: 'general', choices: {} }), days, timeZone, eventWindow),
    ).toMatchObject({ classLabel: 'Entrada general', empty: 'Entrada al evento.' });
  });

  it('shortens a long eligible list', () => {
    const many = Object.fromEntries(
      ['toprock', 'footwork', 'popping', 'locking'].map((id) => [id, 'selectable' as const]),
    );
    const extra = activity('extra', 'Extra', '2026-11-22T19:00:00.000Z');
    const preview = passPreview(
      draftOf({ choices: { ...many, extra: 'selectable' } }),
      accessDays([...activities, extra], timeZone),
      timeZone,
      eventWindow,
    );
    expect(preview.selectableTitle).toBe('Escoge entre 5 competencias');
    expect(preview.selectable).toBe(
      'Breaking 1v1 Toprock, Breaking Footwork, Popping 1v1, Locking 1v1 y 1 más',
    );
  });
});
