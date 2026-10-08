import { and, asc, eq, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventPassTypeActivities,
  eventPassTypes,
  eventVenues,
  events,
  organizations,
  venues,
} from '@/database/schema';
import { type CatalogSeedDefinition, novemberCatalog } from './november-catalog';

export type SeedDatabase = DatabaseService['db'];

const entities = [
  'organizations',
  'venues',
  'events',
  'eventVenues',
  'activities',
  'passTypes',
  'passTypeActivities',
] as const;
export type SeedEntity = (typeof entities)[number];
export type SeedSummary = {
  created: Record<SeedEntity, number>;
  existing: Record<SeedEntity, number>;
};

export type SeedOptions = { definition?: CatalogSeedDefinition };

// Serializes concurrent local runs so natural-key lookups and inserts cannot interleave.
const seedLockKey = 'nuestro-breaking:november-catalog-seed';

const sameName = (column: AnyPgColumn, name: string): SQL =>
  sql`lower(btrim(${column})) = lower(btrim(${name}))`;

/**
 * Create missing November catalog records, matched by natural keys (organization, venue, event,
 * activity, and pass type names, case-insensitive). Existing records are never updated, so admin
 * edits, archives, and access lists survive re-runs; the one exception is giving an existing event
 * its public slug when it only has a generated one. Access links are only written for pass types
 * created in this run. Seed data is local bootstrap data, not an admin operation, so no
 * `event_catalog_audit` rows are written (that table requires an admin user and session).
 */
export async function seedNovemberCatalog(
  db: SeedDatabase,
  options: SeedOptions = {},
): Promise<SeedSummary> {
  const definition = options.definition ?? novemberCatalog;
  const summary: SeedSummary = {
    created: Object.fromEntries(entities.map((key) => [key, 0])) as SeedSummary['created'],
    existing: Object.fromEntries(entities.map((key) => [key, 0])) as SeedSummary['existing'],
  };
  const count = (entity: SeedEntity, created: boolean) =>
    (created ? summary.created : summary.existing)[entity]++;

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${seedLockKey}))`);

    let [organization] = await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(sameName(organizations.name, definition.organizationName))
      .orderBy(asc(organizations.id))
      .limit(1);
    count('organizations', !organization);
    organization ??= (
      await tx
        .insert(organizations)
        .values({ name: definition.organizationName })
        .returning({ id: organizations.id })
    )[0];

    let [venue] = await tx
      .select({ id: venues.id })
      .from(venues)
      .where(
        and(
          eq(venues.organizationId, organization.id),
          sameName(venues.name, definition.venueName),
        ),
      )
      .orderBy(asc(venues.id))
      .limit(1);
    count('venues', !venue);
    venue ??= (
      await tx
        .insert(venues)
        .values({ organizationId: organization.id, name: definition.venueName })
        .returning({ id: venues.id })
    )[0];

    let [event] = await tx
      .select({ id: events.id, slug: events.slug })
      .from(events)
      .where(
        and(
          eq(events.organizationId, organization.id),
          sameName(events.name, definition.event.name),
        ),
      )
      .orderBy(asc(events.id))
      .limit(1);
    count('events', !event);
    event ??= (
      await tx
        .insert(events)
        .values({
          organizationId: organization.id,
          name: definition.event.name,
          slug: definition.event.slug,
          timeZone: definition.event.timeZone,
          startsAt: new Date(definition.event.startsAt),
          endsAt: new Date(definition.event.endsAt),
        })
        .returning({ id: events.id, slug: events.slug })
    )[0];
    await assignSlug(tx, event, definition.event.slug);

    const linkedVenue = await tx
      .insert(eventVenues)
      .values({ organizationId: organization.id, eventId: event.id, venueId: venue.id })
      .onConflictDoNothing()
      .returning({ venueId: eventVenues.venueId });
    count('eventVenues', linkedVenue.length > 0);

    // Activity name → id and status, including archived ones so admin archives are respected.
    const activityByName = new Map<string, { id: string; status: string }>();
    for (const activity of definition.activities) {
      const [existing] = await tx
        .select({ id: activities.id, status: activities.status })
        .from(activities)
        .where(and(eq(activities.eventId, event.id), sameName(activities.name, activity.name)))
        .orderBy(asc(activities.id))
        .limit(1);
      count('activities', !existing);
      const record =
        existing ??
        (
          await tx
            .insert(activities)
            .values({
              eventId: event.id,
              venueId: venue.id,
              kind: activity.kind,
              name: activity.name,
              startsAt: new Date(activity.startsAt),
              endsAt: new Date(activity.endsAt),
            })
            .returning({ id: activities.id, status: activities.status })
        )[0];
      activityByName.set(normalize(activity.name), record);
    }

    for (const passType of definition.passTypes) {
      const [existing] = await tx
        .select({ id: eventPassTypes.id })
        .from(eventPassTypes)
        .where(
          and(eq(eventPassTypes.eventId, event.id), sameName(eventPassTypes.name, passType.name)),
        )
        .limit(1);
      count('passTypes', !existing);
      if (existing) {
        // Left untouched: the admin owns the access list of an existing pass type.
        const [{ links }] = await tx
          .select({ links: sql<number>`count(*)::int` })
          .from(eventPassTypeActivities)
          .where(eq(eventPassTypeActivities.passTypeId, existing.id));
        summary.existing.passTypeActivities += links;
        continue;
      }

      const [created] = await tx
        .insert(eventPassTypes)
        .values({
          eventId: event.id,
          name: passType.name,
          passClass: passType.passClass,
          priceCents: passType.priceCents,
          requiresPassClass: passType.requiresPassClass,
        })
        .returning({ id: eventPassTypes.id });
      // The admin API only links active activities; skip any the admin archived.
      const links = passType.access.flatMap(({ activity, access }) => {
        const record = activityByName.get(normalize(activity));
        return record?.status === 'active'
          ? [{ eventId: event.id, passTypeId: created.id, activityId: record.id, access }]
          : [];
      });
      if (links.length > 0) await tx.insert(eventPassTypeActivities).values(links);
      summary.created.passTypeActivities += links.length;
    }
  });

  return summary;
}

// Matches the slug migration 0014 and the column default generate; anything else is a chosen slug.
const generatedSlug = /^event-[0-9a-f]{32}$/;

// An event created before migration 0014 only has a generated slug. Give it the definition's public
// slug unless another event already holds it; a chosen slug is never overwritten.
async function assignSlug(
  tx: Parameters<Parameters<SeedDatabase['transaction']>[0]>[0],
  event: { id: string; slug: string },
  slug: string,
) {
  if (event.slug === slug || !generatedSlug.test(event.slug)) return;
  const [taken] = await tx
    .select({ id: events.id })
    .from(events)
    .where(eq(events.slug, slug))
    .limit(1);
  if (!taken) await tx.update(events).set({ slug }).where(eq(events.id, event.id));
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}
