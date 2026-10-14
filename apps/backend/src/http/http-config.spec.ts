import { readCorsOrigins, readPublicRateLimit, readTrustProxyHops } from './http-config';

describe('readCorsOrigins', () => {
  it('defaults the admin origin to the local frontend and adds no public origins', () => {
    expect(readCorsOrigins({})).toEqual({
      admin: 'http://localhost:5173',
      public: ['http://localhost:5173'],
    });
  });

  it('treats a blank admin origin as unset, as an empty line copied from .env.example', () => {
    expect(readCorsOrigins({ AUTH_TRUSTED_ORIGIN: '  ' }).admin).toBe('http://localhost:5173');
  });

  it('allows the admin origin plus each trimmed public origin once', () => {
    expect(
      readCorsOrigins({
        AUTH_TRUSTED_ORIGIN: 'https://admin.example',
        PUBLIC_ALLOWED_ORIGINS:
          ' https://tickets.example ,, https://admin.example,https://www.example ',
      }),
    ).toEqual({
      admin: 'https://admin.example',
      public: ['https://admin.example', 'https://tickets.example', 'https://www.example'],
    });
  });

  it.each([
    '*',
    'https://*.example',
    'tickets.example',
    'https://tickets.example/',
    'https://a.example/path',
  ])('rejects %p as a public origin', (value) => {
    expect(() => readCorsOrigins({ PUBLIC_ALLOWED_ORIGINS: value })).toThrow(
      /PUBLIC_ALLOWED_ORIGINS/,
    );
  });
});

describe('readPublicRateLimit', () => {
  it('defaults to 60 requests per minute', () => {
    expect(readPublicRateLimit({})).toEqual({ limit: 60, ttl: 60_000 });
  });

  it('reads trimmed positive integers', () => {
    expect(
      readPublicRateLimit({ PUBLIC_RATE_LIMIT_LIMIT: ' 5 ', PUBLIC_RATE_LIMIT_TTL_MS: '1000' }),
    ).toEqual({ limit: 5, ttl: 1000 });
  });

  it('treats empty values as unset', () => {
    expect(readPublicRateLimit({ PUBLIC_RATE_LIMIT_LIMIT: '  ' })).toEqual({
      limit: 60,
      ttl: 60_000,
    });
  });

  it.each(['0', '-1', '1.5', 'abc', '10req', '1e3'])('fails fast on limit %p', (value) => {
    expect(() => readPublicRateLimit({ PUBLIC_RATE_LIMIT_LIMIT: value })).toThrow(
      /PUBLIC_RATE_LIMIT_LIMIT/,
    );
  });

  it('fails fast on a bad window', () => {
    expect(() => readPublicRateLimit({ PUBLIC_RATE_LIMIT_TTL_MS: '0' })).toThrow(
      /PUBLIC_RATE_LIMIT_TTL_MS/,
    );
  });
});

describe('readTrustProxyHops', () => {
  it('defaults to 0, trusting no proxy', () => {
    expect(readTrustProxyHops({})).toBe(0);
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: '  ' })).toBe(0);
  });

  it.each([
    ['0', 0],
    ['1', 1],
    [' 2 ', 2],
    ['5', 5],
  ])('reads %p as %p hops', (value, hops) => {
    expect(readTrustProxyHops({ TRUST_PROXY_HOPS: value })).toBe(hops);
  });

  it.each(['6', '-1', '1.5', 'true', 'abc', '1e0', '01x'])('fails fast on %p', (value) => {
    expect(() => readTrustProxyHops({ TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
  });
});
