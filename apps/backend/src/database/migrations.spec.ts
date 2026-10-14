import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describeMigrationError, findMigrationsFolder } from './migrations';

describe('findMigrationsFolder', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'migrations-folder-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('finds the backend drizzle folder from the source tree', () => {
    expect(findMigrationsFolder(__dirname)).toBe(resolve(__dirname, '../../drizzle'));
  });

  it('finds the drizzle folder from a compiled script directory', () => {
    mkdirSync(join(root, 'drizzle/meta'), { recursive: true });
    writeFileSync(join(root, 'drizzle/meta/_journal.json'), '{"entries":[]}');
    mkdirSync(join(root, 'dist/scripts'), { recursive: true });

    expect(findMigrationsFolder(join(root, 'dist/scripts'))).toBe(join(root, 'drizzle'));
  });

  it('refuses when no migration journal exists above the start directory', () => {
    expect(() => findMigrationsFolder(root)).toThrow('No drizzle/meta/_journal.json found');
  });
});

describe('describeMigrationError', () => {
  const withCode = (message: string, code: string) => Object.assign(new Error(message), { code });

  it('reports the PostgreSQL cause of a failed migration query, not its SQL', () => {
    const error = new Error('Failed query: CREATE TABLE "users" (...)\nparams: ', {
      cause: withCode('relation "users" already exists', '42P07'),
    });

    expect(describeMigrationError(error)).toBe('[42P07] relation "users" already exists');
  });

  it('reports the first connection attempt when every address refused the connection', () => {
    const error = Object.assign(
      new AggregateError([withCode('connect ECONNREFUSED ::1:5432', 'ECONNREFUSED')], ''),
      { code: 'ECONNREFUSED' },
    );

    expect(describeMigrationError(error)).toBe('[ECONNREFUSED] connect ECONNREFUSED ::1:5432');
  });

  it('reports a driver error with its code', () => {
    expect(
      describeMigrationError(withCode('password authentication failed for user "app"', '28P01')),
    ).toBe('[28P01] password authentication failed for user "app"');
  });

  it('reports only the first line of an error without a cause', () => {
    expect(describeMigrationError(new Error('Failed query: select 1\nparams: secret'))).toBe(
      'Failed query: select 1',
    );
  });

  it('reports a value that is not an error as unknown', () => {
    expect(describeMigrationError('boom')).toBe('unknown error');
  });
});
