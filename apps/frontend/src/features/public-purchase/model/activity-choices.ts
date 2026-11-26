import type { PublicActivity } from '@/entities/public-event';

// How the purchase flow names what a buyer picks (#411): "categoría" means a competition only
// (#385), so workshops and social activities use their own nouns, and a mix reads "actividades".
export type ChoiceKind = 'competition' | 'workshop' | 'social' | 'mixed';

type KindedActivity = Pick<PublicActivity, 'kind'>;

const kindOrder = ['competition', 'workshop', 'social'] as const;
type KnownKind = (typeof kindOrder)[number];

const isKnownKind = (kind: string): kind is KnownKind => kindOrder.some((known) => known === kind);

// Singular and plural nouns, the article of "Una de tus…", and the step 2 verb phrase.
const words: Record<ChoiceKind, { one: string; many: string; oneOf: string; pick: string }> = {
  competition: {
    one: 'categoría',
    many: 'categorías',
    oneOf: 'Una',
    pick: 'Marca en las que quieres competir',
  },
  workshop: { one: 'taller', many: 'talleres', oneOf: 'Uno', pick: 'Marca los que quieres tomar' },
  social: {
    one: 'actividad social',
    many: 'actividades sociales',
    oneOf: 'Una',
    pick: 'Marca a las que quieres asistir',
  },
  mixed: {
    one: 'actividad',
    many: 'actividades',
    oneOf: 'Una',
    pick: 'Marca en las que quieres participar',
  },
};

const sectionLabels: Record<KnownKind, string> = {
  competition: 'Categorías',
  workshop: 'Talleres',
  social: 'Actividades sociales',
};

// The shared kind of the choices, or "mixed" when they differ or the kind is unknown.
export function choiceKind(activities: readonly KindedActivity[]): ChoiceKind {
  const kinds = new Set(activities.map((activity) => activity.kind));
  const [only] = [...kinds];
  return kinds.size === 1 && isKnownKind(only) ? only : 'mixed';
}

// The Pases screen hint, such as "8 categorías para elegir" or "3 actividades para elegir".
export function choiceCountHint(activities: readonly KindedActivity[]): string {
  const { one, many } = words[choiceKind(activities)];
  return `${activities.length} ${activities.length === 1 ? one : many} para elegir`;
}

// The step 2 title and intro, and the review link back to it.
export function choicesStepCopy(kind: ChoiceKind) {
  const { many, pick } = words[kind];
  return {
    title: `Elige tus ${many}`,
    intro: `Es opcional. ${pick}; si cambias de opinión, la organización puede ajustarlo después.`,
    change: `Cambiar mis ${many}`,
  };
}

// The failure when a picked activity stopped being available.
export function choiceUnavailableMessage(kind: ChoiceKind): string {
  const { many, oneOf } = words[kind];
  return `${oneOf} de tus ${many} ya no está disponible. Vuelve a elegir tus ${many}.`;
}

export type KindSection<T> = { label: string | null; items: T[] };

// Step 2 choices of one pass: one unlabeled section for a single kind, else one labeled section
// per kind (competitions, workshops, social, then any other), keeping catalog order inside.
export function kindSections<T extends { activity: KindedActivity }>(
  items: readonly T[],
): KindSection<T>[] {
  if (new Set(items.map((item) => item.activity.kind)).size <= 1)
    return [{ label: null, items: [...items] }];
  const sections = kindOrder.map((kind) => ({
    label: sectionLabels[kind],
    items: items.filter((item) => item.activity.kind === kind),
  }));
  const other = items.filter((item) => !isKnownKind(item.activity.kind));
  return [...sections, { label: 'Otras actividades', items: other }].filter(
    (section) => section.items.length > 0,
  );
}
