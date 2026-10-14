import { describe, expect, it } from 'vitest';
import { assertHostedBuildEnv } from './hosted-build-env';

const hosted = { WORKERS_CI: '1' };

describe('assertHostedBuildEnv', () => {
  it('accepts an HTTPS API origin on Cloudflare builds', () => {
    expect(() =>
      assertHostedBuildEnv({ ...hosted, VITE_API_BASE_URL: 'https://api.example.com' }),
    ).not.toThrow();
  });

  it('skips the checks outside Cloudflare builds, so local and CI builds keep the default', () => {
    expect(() => assertHostedBuildEnv({})).not.toThrow();
    expect(() => assertHostedBuildEnv({ WORKERS_CI: '0' })).not.toThrow();
  });

  it.each([undefined, '', '   '])('refuses a missing API origin (%p)', (VITE_API_BASE_URL) => {
    expect(() => assertHostedBuildEnv({ ...hosted, VITE_API_BASE_URL })).toThrow(
      'VITE_API_BASE_URL must be set for Cloudflare builds; without it the site calls http://localhost:3000.',
    );
  });

  it.each([
    'http://api.example.com',
    'api.example.com',
    'https://api.example.com/',
    'https://api.example.com/v1',
    'https://api.example.com?x=1',
  ])('refuses an API origin that is not a bare HTTPS origin (%p)', (VITE_API_BASE_URL) => {
    expect(() => assertHostedBuildEnv({ ...hosted, VITE_API_BASE_URL })).toThrow(
      `VITE_API_BASE_URL must be an HTTPS origin with no path or trailing slash, like https://api.example.com (got "${VITE_API_BASE_URL}").`,
    );
  });
});
