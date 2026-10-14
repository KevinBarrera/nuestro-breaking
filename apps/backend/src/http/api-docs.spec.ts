import { isApiDocsEnabled } from './api-docs';

describe('isApiDocsEnabled', () => {
  it.each([{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }])(
    'serves the API docs outside production (%p)',
    (env) => {
      expect(isApiDocsEnabled(env)).toBe(true);
    },
  );

  it.each(['production', 'Production', ' production ', 'PRODUCTION'])(
    'hides the API docs in production (%p)',
    (NODE_ENV) => {
      expect(isApiDocsEnabled({ NODE_ENV })).toBe(false);
    },
  );
});
