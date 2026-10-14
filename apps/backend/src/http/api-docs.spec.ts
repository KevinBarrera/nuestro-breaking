import { isApiDocsEnabled } from './api-docs';

describe('isApiDocsEnabled', () => {
  it.each([{}, { NODE_ENV: 'development' }, { NODE_ENV: 'test' }])(
    'serves the API docs outside production (%p)',
    (env) => {
      expect(isApiDocsEnabled(env)).toBe(true);
    },
  );

  it('hides the API docs in production', () => {
    expect(isApiDocsEnabled({ NODE_ENV: 'production' })).toBe(false);
  });
});
