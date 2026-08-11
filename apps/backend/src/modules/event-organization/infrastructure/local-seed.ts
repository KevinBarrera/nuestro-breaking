import { type Sql } from 'postgres';

export const LOCAL_SEED_IDS = {
  userId: '40000000-0000-0000-0000-000000000001',
  organizationId: '50000000-0000-0000-0000-000000000001',
  venueId: '60000000-0000-0000-0000-000000000001',
  eventId: '70000000-0000-0000-0000-000000000001',
};

export async function seedLocalDatabase(client: Sql): Promise<void> {
  await client`INSERT INTO users (id, email, display_name) VALUES (${LOCAL_SEED_IDS.userId}, 'local-organizer@example.com', 'Local Organizer') ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, display_name = EXCLUDED.display_name`;
  await client`INSERT INTO organizations (id, name) VALUES (${LOCAL_SEED_IDS.organizationId}, 'Local Breaking Organization') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`;
  await client`INSERT INTO venues (id, organization_id, name) VALUES (${LOCAL_SEED_IDS.venueId}, ${LOCAL_SEED_IDS.organizationId}, 'Local Main Hall') ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, name = EXCLUDED.name`;
  await client`INSERT INTO events (id, organization_id, organizer_user_id, venue_id, name, lifecycle, starts_at, ends_at) VALUES (${LOCAL_SEED_IDS.eventId}, ${LOCAL_SEED_IDS.organizationId}, ${LOCAL_SEED_IDS.userId}, ${LOCAL_SEED_IDS.venueId}, 'Local Breaking Jam', 'draft', '2026-06-10T15:30:00.000Z', NULL) ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, organizer_user_id = EXCLUDED.organizer_user_id, venue_id = EXCLUDED.venue_id, name = EXCLUDED.name, lifecycle = EXCLUDED.lifecycle, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at`;
}
