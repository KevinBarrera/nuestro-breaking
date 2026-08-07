import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workspaceRoot = findWorkspaceRoot(process.cwd()) ?? findWorkspaceRoot(__dirname);

if (workspaceRoot) {
  config({ path: resolve(workspaceRoot, '.env'), quiet: true });
}

export function findWorkspaceRoot(startDirectory: string): string | undefined {
  let directory = resolve(startDirectory);

  while (true) {
    if (existsSync(resolve(directory, 'pnpm-workspace.yaml'))) {
      return directory;
    }

    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      return undefined;
    }

    directory = parentDirectory;
  }
}

export function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    return databaseUrl;
  }

  const user = requireEnvironmentVariable('POSTGRES_USER');
  const password = requireEnvironmentVariable('POSTGRES_PASSWORD');
  const database = requireEnvironmentVariable('POSTGRES_DB');

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@localhost:5432/${encodeURIComponent(database)}`;
}

function requireEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set when DATABASE_URL is not provided.`);
  }

  return value;
}
