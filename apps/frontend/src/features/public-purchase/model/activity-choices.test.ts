import { describe, expect, it } from 'vitest';
import {
  choiceCountHint,
  choiceKind,
  choiceUnavailableMessage,
  choicesStepCopy,
  kindSections,
  passActivityLines,
} from './activity-choices';
import { activity } from './test-fixtures';

const bboy = activity('bboy', 'Bboy');
const bgirl = activity('bgirl', 'Bgirl');
const footwork = activity('footwork', 'Workshop de footwork', 'workshop');
const party = activity('party', 'Fiesta de cierre', 'social');

describe('choiceKind (#411)', () => {
  it('names the kind when every choice shares it and calls a mix "mixed"', () => {
    expect(choiceKind([bboy, bgirl])).toBe('competition');
    expect(choiceKind([footwork])).toBe('workshop');
    expect(choiceKind([party])).toBe('social');
    expect(choiceKind([bboy, footwork])).toBe('mixed');
    expect(choiceKind([activity('x', 'X', 'unknown')])).toBe('mixed');
  });
});

describe('choiceCountHint (#411)', () => {
  it('counts competitions as categorías, as before', () => {
    expect(choiceCountHint([bboy])).toBe('1 categoría para elegir');
    expect(choiceCountHint([bboy, bgirl])).toBe('2 categorías para elegir');
  });

  it('counts workshops and social activities by their kind', () => {
    expect(choiceCountHint([footwork])).toBe('1 taller para elegir');
    expect(choiceCountHint([footwork, footwork])).toBe('2 talleres para elegir');
    expect(choiceCountHint([party, party])).toBe('2 actividades sociales para elegir');
  });

  it('counts mixed kinds as actividades', () => {
    expect(choiceCountHint([bboy, bgirl, footwork])).toBe('3 actividades para elegir');
  });
});

describe('choicesStepCopy (#411)', () => {
  it('keeps the compete wording for competitions only', () => {
    expect(choicesStepCopy('competition')).toEqual({
      title: 'Elige tus categorías',
      intro:
        'Es opcional. Marca en las que quieres competir; si cambias de opinión, la organización puede ajustarlo después.',
      change: 'Cambiar mis categorías',
    });
    expect(choicesStepCopy('workshop')).toEqual({
      title: 'Elige tus talleres',
      intro:
        'Es opcional. Marca los que quieres tomar; si cambias de opinión, la organización puede ajustarlo después.',
      change: 'Cambiar mis talleres',
    });
    expect(choicesStepCopy('social').title).toBe('Elige tus actividades sociales');
    expect(choicesStepCopy('mixed')).toEqual({
      title: 'Elige tus actividades',
      intro:
        'Es opcional. Marca en las que quieres participar; si cambias de opinión, la organización puede ajustarlo después.',
      change: 'Cambiar mis actividades',
    });
  });
});

describe('choiceUnavailableMessage (#411)', () => {
  it('names the kind the buyer chose from', () => {
    expect(choiceUnavailableMessage('competition')).toBe(
      'Una de tus categorías ya no está disponible. Vuelve a elegir tus categorías.',
    );
    expect(choiceUnavailableMessage('workshop')).toBe(
      'Uno de tus talleres ya no está disponible. Vuelve a elegir tus talleres.',
    );
    expect(choiceUnavailableMessage('mixed')).toBe(
      'Una de tus actividades ya no está disponible. Vuelve a elegir tus actividades.',
    );
  });
});

describe('kindSections (#411)', () => {
  const item = (entry: typeof bboy) => ({ activity: entry, selected: false });

  it('keeps one unlabeled section when every choice shares a kind', () => {
    expect(kindSections([item(bboy), item(bgirl)])).toEqual([
      { label: null, items: [item(bboy), item(bgirl)] },
    ]);
  });

  it('groups mixed choices by kind, competitions first, keeping catalog order inside', () => {
    expect(kindSections([item(footwork), item(bboy), item(party), item(bgirl)])).toEqual([
      { label: 'Categorías', items: [item(bboy), item(bgirl)] },
      { label: 'Talleres', items: [item(footwork)] },
      { label: 'Actividades sociales', items: [item(party)] },
    ]);
  });
});

describe('passActivityLines (#404)', () => {
  const entry = (name: string, kind: string) => ({ name, kind });

  it('lists one labeled line per kind in kind order, keeping start order inside', () => {
    expect(
      passActivityLines([
        entry('Cypher nocturno', 'social'),
        entry('Workshop intensivo de footwork', 'workshop'),
        entry('Breaking 1vs1', 'competition'),
        entry('Taller de toprock', 'workshop'),
        entry('Popping 1v1', 'competition'),
      ]),
    ).toEqual([
      { label: 'Categorías', names: 'Breaking 1vs1, Popping 1v1' },
      { label: 'Talleres', names: 'Workshop intensivo de footwork, Taller de toprock' },
      { label: 'Actividades sociales', names: 'Cypher nocturno' },
    ]);
  });

  it('labels a single kind too and leaves out kinds without activities', () => {
    expect(passActivityLines([entry('Workshop intensivo de footwork', 'workshop')])).toEqual([
      { label: 'Talleres', names: 'Workshop intensivo de footwork' },
    ]);
    expect(passActivityLines([])).toEqual([]);
  });

  it('lists an unknown kind last under "Actividades"', () => {
    expect(passActivityLines([entry('Expo', 'exhibition'), entry('Bboy', 'competition')])).toEqual([
      { label: 'Categorías', names: 'Bboy' },
      { label: 'Actividades', names: 'Expo' },
    ]);
  });
});
