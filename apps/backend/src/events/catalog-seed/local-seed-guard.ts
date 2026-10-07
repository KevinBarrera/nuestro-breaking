// Mirrors the guards of `identity-access/local-admin-provisioning.ts`: the seed refuses anything
// that is not an explicitly confirmed loopback local/dev/test database. Errors never include
// input values, URLs, or credentials.

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

export const catalogSeedOptIn = 'I_UNDERSTAND_THIS_IS_LOCAL_ONLY';
export const catalogSeedConfirmation = '--confirm-local-only=seed-november-catalog';

/** Validate before opening a database connection. Throws a safe message on any non-local signal. */
export function parseNovemberCatalogSeedInput(
  args: string[],
  env: NodeJS.ProcessEnv,
  resolvedDatabaseUrl: string | undefined = env.DATABASE_URL,
): void {
  if (env.LOCAL_CATALOG_SEED !== catalogSeedOptIn) {
    throw new Error('Local-only catalog seed opt-in is required (LOCAL_CATALOG_SEED).');
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
      throw new Error(`${name} must not be set for the local catalog seed.`);
    }
  }
  if (args.length !== 1 || args[0] !== catalogSeedConfirmation) {
    throw new Error(`Exactly ${catalogSeedConfirmation} is required and no other flags.`);
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
}
