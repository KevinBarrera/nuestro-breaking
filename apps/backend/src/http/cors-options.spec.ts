import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { corsOptionsFor, createCorsDelegate, isPublicPath } from './cors-options';

const origins = {
  admin: 'https://admin.example',
  public: ['https://admin.example', 'https://tickets.example'],
};

describe('isPublicPath', () => {
  it.each([
    '/public/events/x/catalog',
    '/public',
    '/public?x=1',
    '/PUBLIC/events/x/catalog',
    '/public/events/x/catalog?y=/admin',
  ])('treats %p as public', (url) => {
    expect(isPublicPath(url)).toBe(true);
  });

  it.each(['/', '/admin/events', '/auth/admin/sign-in', '/publicity', '/api/public', ''])(
    'treats %p as not public',
    (url) => {
      expect(isPublicPath(url)).toBe(false);
    },
  );
});

describe('corsOptionsFor', () => {
  it('keeps admin routes on the single trusted origin with credentials and the CSRF header', () => {
    expect(corsOptionsFor('/admin/events/1/sales', origins)).toEqual({
      origin: 'https://admin.example',
      credentials: true,
      exposedHeaders: ['X-CSRF-Token'],
    });
  });

  it('allows only the configured list on public routes and never credentials', () => {
    const options = corsOptionsFor('/public/events/x/catalog', origins);

    expect(options).toEqual({ origin: origins.public, credentials: false });
    expect(options.exposedHeaders).toBeUndefined();
  });
});

describe('createCorsDelegate', () => {
  it('hands the per-path options to the cors middleware', () => {
    const delegate = createCorsDelegate(origins);
    const results: (CorsOptions | undefined)[] = [];
    const collect = (error: Error | null, options?: CorsOptions) => {
      expect(error).toBeNull();
      results.push(options);
    };

    delegate({ url: '/public/events/x/catalog' }, collect);
    delegate({ originalUrl: '/admin/events', url: '/admin/events' }, collect);
    delegate({}, collect);

    expect(results).toEqual([
      corsOptionsFor('/public/events/x/catalog', origins),
      corsOptionsFor('/admin/events', origins),
      corsOptionsFor('/', origins),
    ]);
  });
});
