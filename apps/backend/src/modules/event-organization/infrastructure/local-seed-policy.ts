export function assertLocalSeedEnvironment(
  environment: { LOCAL_SEED?: string; NODE_ENV?: string },
  databaseUrl: string,
): void {
  if (environment.LOCAL_SEED !== '1') {
    throw new Error('LOCAL_SEED=1 is required.');
  }

  if (environment.NODE_ENV === 'production') {
    throw new Error('Local seed refuses production.');
  }

  if (!['localhost', '127.0.0.1', '::1'].includes(new URL(databaseUrl).hostname)) {
    throw new Error('Local seed requires a loopback database host.');
  }
}
