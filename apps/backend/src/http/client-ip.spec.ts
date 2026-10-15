import { readClientIpSource, resolveClientIp, type ClientIpRequest } from './client-ip';

const SECRET = 'a'.repeat(32);

const request = (
  headers: Record<string, string | string[] | undefined>,
  ip = '10.0.0.1',
): ClientIpRequest => ({
  ip,
  headers,
});

describe('readClientIpSource', () => {
  it.each(['x-real-ip', 'cloudflare'])(
    'refuses %p together with TRUST_PROXY_HOPS, whose fallback a client could forge',
    (CLIENT_IP_SOURCE) => {
      expect(() =>
        readClientIpSource({
          CLIENT_IP_SOURCE,
          CLOUDFLARE_ORIGIN_SECRET: SECRET,
          TRUST_PROXY_HOPS: '1',
        }),
      ).toThrow(
        `TRUST_PROXY_HOPS must be unset or 0 when CLIENT_IP_SOURCE is "${CLIENT_IP_SOURCE}".`,
      );
    },
  );

  it('allows TRUST_PROXY_HOPS=0 with a header source', () => {
    expect(readClientIpSource({ CLIENT_IP_SOURCE: 'x-real-ip', TRUST_PROXY_HOPS: '0' })).toEqual({
      kind: 'x-real-ip',
    });
  });

  it.each([{}, { CLIENT_IP_SOURCE: '' }, { CLIENT_IP_SOURCE: '  ' }])(
    'defaults to the request address (%p)',
    (env) => {
      expect(readClientIpSource(env)).toEqual({ kind: 'request' });
    },
  );

  it('reads the Railway header source', () => {
    expect(readClientIpSource({ CLIENT_IP_SOURCE: 'x-real-ip' })).toEqual({ kind: 'x-real-ip' });
  });

  it('reads the Cloudflare source with its origin secret', () => {
    expect(
      readClientIpSource({ CLIENT_IP_SOURCE: 'cloudflare', CLOUDFLARE_ORIGIN_SECRET: SECRET }),
    ).toEqual({ kind: 'cloudflare', originSecret: SECRET });
  });

  it.each(['X-Real-IP', 'forwarded', 'cf-connecting-ip'])(
    'refuses an unknown source (%p)',
    (value) => {
      expect(() => readClientIpSource({ CLIENT_IP_SOURCE: value })).toThrow(
        `CLIENT_IP_SOURCE must be "request", "x-real-ip" or "cloudflare" (got "${value}").`,
      );
    },
  );

  it.each([undefined, '', 'short-secret'])(
    'refuses the Cloudflare source without a 32-character origin secret (%p)',
    (CLOUDFLARE_ORIGIN_SECRET) => {
      expect(() =>
        readClientIpSource({ CLIENT_IP_SOURCE: 'cloudflare', CLOUDFLARE_ORIGIN_SECRET }),
      ).toThrow(
        'CLOUDFLARE_ORIGIN_SECRET must be at least 32 characters when CLIENT_IP_SOURCE is "cloudflare".',
      );
    },
  );

  it('never echoes the origin secret in its error', () => {
    let message = '';
    try {
      readClientIpSource({ CLIENT_IP_SOURCE: 'cloudflare', CLOUDFLARE_ORIGIN_SECRET: 'leaky' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('CLOUDFLARE_ORIGIN_SECRET');
    expect(message).not.toContain('leaky');
  });
});

describe('resolveClientIp', () => {
  it('groups IPv6 request addresses by /64 and unwraps IPv4-mapped ones, like the default tracker', () => {
    expect(resolveClientIp({ kind: 'request' }, request({}, '2001:db8:1:2:aaaa::1'))).toBe(
      resolveClientIp({ kind: 'request' }, request({}, '2001:db8:1:2:bbbb::2')),
    );
    expect(resolveClientIp({ kind: 'request' }, request({}, '::ffff:203.0.113.7'))).toBe(
      '203.0.113.7',
    );
  });

  it('groups IPv6 header addresses by /64', () => {
    const first = resolveClientIp(
      { kind: 'x-real-ip' },
      request({ 'x-real-ip': '2001:db8:1:2::1' }),
    );
    const second = resolveClientIp(
      { kind: 'x-real-ip' },
      request({ 'x-real-ip': '2001:db8:1:2:ffff::9' }),
    );

    expect(first).toBe(second);
    expect(first).not.toBe(
      resolveClientIp({ kind: 'x-real-ip' }, request({ 'x-real-ip': '2001:db8:1:3::1' })),
    );
  });

  it('uses the request address by default and ignores forwarding headers', () => {
    expect(
      resolveClientIp(
        { kind: 'request' },
        request({ 'x-real-ip': '203.0.113.5', 'cf-connecting-ip': '203.0.113.6' }),
      ),
    ).toBe('10.0.0.1');
  });

  it('uses X-Real-IP on Railway', () => {
    expect(resolveClientIp({ kind: 'x-real-ip' }, request({ 'x-real-ip': ' 203.0.113.5 ' }))).toBe(
      '203.0.113.5',
    );
  });

  it.each([
    {},
    { 'x-real-ip': '' },
    { 'x-real-ip': 'not-an-ip' },
    { 'x-real-ip': ['203.0.113.5'] },
  ])('falls back to the request address without one valid X-Real-IP (%p)', (headers) => {
    expect(resolveClientIp({ kind: 'x-real-ip' }, request(headers))).toBe('10.0.0.1');
  });

  it('accepts an IPv6 X-Real-IP, counted by its /64 network', () => {
    expect(resolveClientIp({ kind: 'x-real-ip' }, request({ 'x-real-ip': '2001:db8::7' }))).toBe(
      '2001:db8::/64',
    );
  });

  const cloudflare = { kind: 'cloudflare', originSecret: SECRET } as const;

  it('uses CF-Connecting-IP when the Cloudflare origin secret matches', () => {
    expect(
      resolveClientIp(
        cloudflare,
        request({
          'x-origin-secret': SECRET,
          'cf-connecting-ip': '203.0.113.9',
          'x-real-ip': '172.64.0.1',
        }),
      ),
    ).toBe('203.0.113.9');
  });

  it.each([
    { name: 'no secret', secret: undefined },
    { name: 'a wrong secret', secret: 'b'.repeat(32) },
    { name: 'a shorter secret', secret: 'a' },
  ])('ignores CF-Connecting-IP with $name and uses X-Real-IP', ({ secret }) => {
    const headers: Record<string, string> = {
      'cf-connecting-ip': '198.51.100.66',
      'x-real-ip': '203.0.113.5',
    };
    if (secret !== undefined) headers['x-origin-secret'] = secret;

    expect(resolveClientIp(cloudflare, request(headers))).toBe('203.0.113.5');
  });

  it('falls back to X-Real-IP when the secret matches but CF-Connecting-IP is invalid', () => {
    expect(
      resolveClientIp(
        cloudflare,
        request({
          'x-origin-secret': SECRET,
          'cf-connecting-ip': 'nope',
          'x-real-ip': '203.0.113.5',
        }),
      ),
    ).toBe('203.0.113.5');
  });
});
