import {
  activationLink,
  BOOTSTRAP_EXIT_CODES,
  maskEmail,
  parseAdminBootstrapInput,
} from './admin-bootstrap';

const validEnv = {
  ADMIN_BOOTSTRAP_EMAIL: '  First.Admin@Example.com ',
  ADMIN_BOOTSTRAP_NAME: '  First Admin ',
  AUTH_TRUSTED_ORIGIN: 'https://admin.example.com',
};

describe('parseAdminBootstrapInput', () => {
  it('normalizes the email and name and keeps the trusted origin', () => {
    expect(parseAdminBootstrapInput(validEnv)).toEqual({
      email: 'first.admin@example.com',
      displayName: 'First Admin',
      origin: 'https://admin.example.com',
    });
  });

  it('works in hosted environments (no local-only guards)', () => {
    expect(() =>
      parseAdminBootstrapInput({
        ...validEnv,
        NODE_ENV: 'production',
        RAILWAY_ENVIRONMENT: 'production',
        CI: 'true',
      }),
    ).not.toThrow();
  });

  it.each([
    ['missing', undefined],
    ['without a domain', 'admin@'],
    ['with spaces inside', 'first admin@example.com'],
    ['too long', `${'a'.repeat(250)}@example.com`],
    ['with control characters', 'admin@example.com\n'],
  ])('rejects an email %s', (_label, email) => {
    expect(() => parseAdminBootstrapInput({ ...validEnv, ADMIN_BOOTSTRAP_EMAIL: email })).toThrow(
      'ADMIN_BOOTSTRAP_EMAIL must be a valid email (up to 254 characters).',
    );
  });

  it.each([
    ['missing', undefined],
    ['blank', '   '],
    ['too long', 'a'.repeat(201)],
    ['with control characters', 'First\tAdmin'],
  ])('rejects a display name %s', (_label, name) => {
    expect(() => parseAdminBootstrapInput({ ...validEnv, ADMIN_BOOTSTRAP_NAME: name })).toThrow(
      'ADMIN_BOOTSTRAP_NAME must be a non-empty name (up to 200 characters).',
    );
  });

  it.each([
    ['missing', undefined],
    ['blank', '  '],
    ['not a URL', 'admin.example.com'],
    ['not http(s)', 'ftp://admin.example.com'],
    ['with a path', 'https://admin.example.com/panel'],
    ['a wildcard', 'https://*.example.com'],
  ])('rejects a trusted origin that is %s', (_label, origin) => {
    expect(() => parseAdminBootstrapInput({ ...validEnv, AUTH_TRUSTED_ORIGIN: origin })).toThrow(
      'AUTH_TRUSTED_ORIGIN must be the absolute http(s) origin of the admin app',
    );
  });

  it('never echoes input values in errors', () => {
    const secretLike = 'not-an-email-secret-value';
    let message = '';
    try {
      parseAdminBootstrapInput({ ...validEnv, ADMIN_BOOTSTRAP_EMAIL: secretLike });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/^ADMIN_BOOTSTRAP_EMAIL/);
    expect(message).not.toContain(secretLike);
  });
});

describe('activationLink', () => {
  it('puts the token in the URL fragment', () => {
    expect(activationLink('https://admin.example.com', 'abc123')).toBe(
      'https://admin.example.com/activar-cuenta#abc123',
    );
  });
});

describe('maskEmail', () => {
  it('keeps only the first character of the local part and the domain', () => {
    expect(maskEmail('pending.admin@example.com')).toBe('p***@example.com');
  });

  it('hides a value without a domain entirely', () => {
    expect(maskEmail('weird')).toBe('***');
  });
});

describe('BOOTSTRAP_EXIT_CODES', () => {
  it('separates success, errors, and refusals', () => {
    expect(BOOTSTRAP_EXIT_CODES).toEqual({ issued: 0, error: 1, refused: 2 });
  });
});
