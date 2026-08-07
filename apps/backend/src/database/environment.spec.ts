jest.mock('dotenv', () => ({ config: jest.fn() }));

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { findWorkspaceRoot } from '@/database/environment';

describe('database environment', () => {
  it('loads the root environment file for source and compiled module locations', () => {
    const sourceWorkspaceRoot = findWorkspaceRoot(__dirname);
    const compiledWorkspaceRoot = findWorkspaceRoot(resolve(__dirname, '../../dist/src/database'));

    expect(sourceWorkspaceRoot).toBeDefined();
    expect(compiledWorkspaceRoot).toBe(sourceWorkspaceRoot);
    expect(config).toHaveBeenCalledWith({
      path: resolve(sourceWorkspaceRoot!, '.env'),
      quiet: true,
    });
  });
});
