import { hash, argon2id } from 'argon2';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { userRoles, users } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';

export type ProvisioningDatabase = DatabaseService['db'];

export type LocalAdminInput = {
  email: string;
  displayName: string;
  password: string;
};

const localEnvironments = new Set(['local', 'dev', 'development', 'test']);
const environmentNames = ['APP_ENV', 'ENVIRONMENT', 'VERCEL_ENV', 'RAILWAY_ENVIRONMENT'];
const hostedMarkers = [
  'RENDER',
  'FLY_APP_NAME',
  'K_SERVICE',
  'K_REVISION',
  'DYNO',
  'HEROKU_APP_NAME',
  'AWS_EXECUTION_ENV',
  'AWS_LAMBDA_FUNCTION_NAME',
  'ECS_CONTAINER_METADATA_URI',
  'WEBSITE_SITE_NAME',
  'FUNCTIONS_WORKER_RUNTIME',
  'VERCEL',
  'NETLIFY',
  'CF_PAGES',
];
const ciMarkers = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'JENKINS_URL',
  'TF_BUILD',
  'TEAMCITY_VERSION',
  'BITBUCKET_BUILD_NUMBER',
];

/** Validate before opening a database connection or hashing a password. Never include input values in errors. */
export function parseLocalAdminInput(
  args: string[],
  env: NodeJS.ProcessEnv,
  resolvedDatabaseUrl: string | undefined = env.DATABASE_URL,
): LocalAdminInput {
  if (env.LOCAL_ADMIN_PROVISIONING !== 'I_UNDERSTAND_THIS_IS_LOCAL_ONLY') {
    throw new Error('Local-only provisioning opt-in is required.');
  }
  if (env.NODE_ENV && !localEnvironments.has(env.NODE_ENV.toLowerCase())) {
    throw new Error('NODE_ENV must be local, dev, development, or test.');
  }
  for (const name of environmentNames) {
    if (env[name] && !localEnvironments.has(env[name].toLowerCase())) {
      throw new Error(`${name} is not a local environment.`);
    }
  }
  for (const name of [...hostedMarkers, ...ciMarkers]) {
    if (env[name] !== undefined) {
      throw new Error(`${name} must not be set for local provisioning.`);
    }
  }
  const flags = new Map<string, string>();
  for (const argument of args) {
    const match = /^(--confirm-local-only|--email|--display-name)=(.*)$/s.exec(argument);
    if (!match || flags.has(match[1])) {
      throw new Error(
        'Only unique --confirm-local-only, --email, and --display-name flags are allowed.',
      );
    }
    flags.set(match[1], match[2]);
  }
  if (flags.size !== 3 || flags.get('--confirm-local-only') !== 'provision-local-admin') {
    throw new Error(
      'Exact --confirm-local-only=provision-local-admin confirmation and identity flags are required.',
    );
  }
  let url: URL;
  try {
    url = new URL(resolvedDatabaseUrl ?? '');
  } catch {
    throw new Error('A valid local PostgreSQL database URL is required.');
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase()) ||
    url.search ||
    url.hash ||
    !/(^|[_-])(local|dev|test)([_-]|$)/i.test(databaseName) ||
    /(prod|production|staging|stage|live)/i.test(databaseName)
  ) {
    throw new Error(
      'Database URL must identify a loopback PostgreSQL local/dev/test database without overrides.',
    );
  }
  const rawEmail = flags.get('--email') ?? '';
  const rawDisplayName = flags.get('--display-name') ?? '';
  const email = rawEmail.trim().toLowerCase();
  const displayName = rawDisplayName.trim();
  const password = env.LOCAL_ADMIN_PASSWORD ?? '';
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    hasControlCharacters(rawEmail)
  ) {
    throw new Error('A valid email is required.');
  }
  if (!displayName || displayName.length > 200 || hasControlCharacters(rawDisplayName)) {
    throw new Error('A non-empty display name (up to 200 characters) is required.');
  }
  if (
    password.length < 12 ||
    password.length > 1024 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^a-zA-Z0-9\s]/.test(password) ||
    hasControlCharacters(password)
  ) {
    throw new Error('A strong password is required via LOCAL_ADMIN_PASSWORD.');
  }
  return { email, displayName, password };
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

export async function provisionLocalAdmin(
  db: ProvisioningDatabase,
  input: LocalAdminInput,
): Promise<void> {
  const passwordHash = await hash(input.password, { type: argon2id });
  await db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        email: input.email,
        displayName: input.displayName,
        active: true,
        passwordHash,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: { displayName: input.displayName, active: true, passwordHash },
      })
      .returning({ id: users.id });

    const activeRoles = await tx
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(
        and(
          eq(userRoles.userId, user.id),
          eq(userRoles.role, 'admin'),
          eq(userRoles.scopeType, 'global'),
          isNull(userRoles.scopeId),
          eq(userRoles.active, true),
          isNull(userRoles.revokedAt),
        ),
      );
    if (activeRoles.length === 0) {
      await tx.insert(userRoles).values({ userId: user.id, role: 'admin', scopeType: 'global' });
    } else if (activeRoles.length > 1) {
      await tx
        .update(userRoles)
        .set({ active: false, revokedAt: new Date() })
        .where(
          and(
            eq(userRoles.userId, user.id),
            eq(userRoles.role, 'admin'),
            eq(userRoles.scopeType, 'global'),
            isNull(userRoles.scopeId),
            eq(userRoles.active, true),
            isNull(userRoles.revokedAt),
            ne(userRoles.id, activeRoles[0].id),
          ),
        );
    }
  });
}
