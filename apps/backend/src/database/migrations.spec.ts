import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { findMigrationsFolder } from './migrations';

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
