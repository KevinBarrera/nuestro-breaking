import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const commandTimeoutMs = 10 * 60 * 1000;
const serviceTimeoutMs = 30 * 1000;
const retryDelayMs = 1000;
const startedServices = [];
let cleanupPromise;

class SetupVerificationError extends Error {}

function redact(output) {
  return output
    .replace(
      /\b(DATABASE_URL|POSTGRES_(?:USER|PASSWORD|DB)|(?:PASSWORD|SECRET|TOKEN|KEY))\b(\s*(?:=|:)\s*)([^\s,;]+)/gi,
      '$1$2[REDACTED]',
    )
    .replace(/\b(postgres(?:ql)?:\/\/)([^\s'"`]+)/gi, '$1[REDACTED]');
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolveStop) => {
      const taskkill = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      taskkill.once('close', resolveStop);
      taskkill.once('error', resolveStop);
    });
    return;
  }

  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }

  await Promise.race([new Promise((resolveStop) => child.once('close', resolveStop)), delay(5000)]);

  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }
}

async function runCommand(command, args, { quiet = false, timeoutMs = commandTimeoutMs } = {}) {
  const label = commandLabel(command, args);
  if (!quiet) {
    console.log(`\n[setup] Running: ${label}`);
  }

  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let timedOut = false;
    const appendOutput = (chunk) => {
      output = `${output}${chunk}`.slice(-20_000);
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      void stopProcess(child);
    }, timeoutMs);

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.once('error', (error) => {
      clearTimeout(timeout);
      rejectCommand(
        new SetupVerificationError(
          `Could not start ${label}: ${error.message}. Confirm the command is installed and available on PATH.`,
        ),
      );
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      const safeOutput = redact(output).trim();
      if (!quiet && safeOutput) {
        console.log(safeOutput);
      }

      if (timedOut) {
        rejectCommand(
          new SetupVerificationError(`${label} timed out after ${timeoutMs / 1000} seconds.`),
        );
        return;
      }

      if (code !== 0) {
        rejectCommand(
          new SetupVerificationError(
            `${label} failed${signal ? ` (${signal})` : ` (exit ${code})`}. ${
              safeOutput ? 'See the command output above.' : 'No diagnostic output was produced.'
            }`,
          ),
        );
        return;
      }

      resolveCommand(safeOutput);
    });
  });
}

async function verifyRuntime() {
  const expected = (await readFile(resolve(root, '.nvmrc'), 'utf8')).trim();
  const actual = process.version.replace(/^v/, '');
  if (actual !== expected) {
    throw new SetupVerificationError(
      `Node ${expected} is required by .nvmrc, but this command is using Node ${actual}. Run "nvm install" and "nvm use", then retry.`,
    );
  }
  console.log(`[setup] Node ${actual} matches .nvmrc.`);
}

async function verifyWorkspaceInstallation() {
  try {
    await access(resolve(root, 'node_modules/.modules.yaml'));
  } catch {
    throw new SetupVerificationError(
      'The pnpm workspace installation is missing or incomplete. Run "pnpm install" from the repository root, then retry.',
    );
  }

  await runCommand(pnpm, ['--version']);
  const output = await runCommand(pnpm, ['list', '--depth', '-1', '--json']);
  try {
    const packages = JSON.parse(output);
    if (!Array.isArray(packages) || packages.length === 0) {
      throw new Error('empty package list');
    }
  } catch {
    throw new SetupVerificationError(
      'pnpm could not inspect the installed workspace. Run "pnpm install" from the repository root, then retry.',
    );
  }
  console.log(
    '[setup] pnpm can inspect the existing workspace without changing dependencies or the lockfile.',
  );
}

async function isPortFree(port) {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', (error) => resolvePort(error.code !== 'EADDRINUSE'));
    server.listen({ host: '127.0.0.1', port }, () => {
      server.close(() => resolvePort(true));
    });
  });
}

async function request(url, expectedContent) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    throw new Error(`received HTTP ${response.status}`);
  }

  const body = await response.text();
  if (expectedContent && !body.includes(expectedContent)) {
    throw new Error('returned an unexpected response');
  }
}

async function waitForEndpoint(name, url, expectedContent) {
  const deadline = Date.now() + serviceTimeoutMs;
  let lastError = 'connection was not established';
  while (Date.now() < deadline) {
    try {
      await request(url, expectedContent);
      console.log(`[setup] ${name} is healthy at ${url}.`);
      return;
    } catch (error) {
      lastError = error.message;
      await delay(retryDelayMs);
    }
  }
  throw new SetupVerificationError(
    `${name} did not become healthy at ${url} within ${serviceTimeoutMs / 1000} seconds (${lastError}).`,
  );
}

async function startOrReuseService({ name, port, command, args, environment, checks }) {
  if (!(await isPortFree(port))) {
    console.log(`[setup] Reusing the process already listening on 127.0.0.1:${port}.`);
    try {
      for (const check of checks) {
        await waitForEndpoint(name, check.url, check.expectedContent);
      }
    } catch {
      throw new SetupVerificationError(
        `Port ${port} is already in use, but it is not a healthy ${name} service. Stop or repair that process, then retry.`,
      );
    }
    return;
  }

  console.log(`\n[setup] Starting ${name} on 127.0.0.1:${port}.`);
  const child = spawn(command, args, {
    cwd: root,
    detached: process.platform !== 'win32',
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const appendOutput = (chunk) => {
    output = `${output}${chunk}`.slice(-4000);
  };
  child.stdout.on('data', appendOutput);
  child.stderr.on('data', appendOutput);
  startedServices.push({ child, name });

  try {
    for (const check of checks) {
      await waitForEndpoint(name, check.url, check.expectedContent);
    }
  } catch (error) {
    const diagnostic = redact(output).trim();
    if (diagnostic) {
      console.log(`[setup] ${name} startup output:\n${diagnostic}`);
    }
    throw error;
  }
}

async function ensureDatabase() {
  const running = await runCommand(
    'docker',
    ['compose', 'ps', '--status', 'running', '--services'],
    {
      quiet: true,
    },
  );
  if (!running.split(/\r?\n/).includes('postgres')) {
    console.log('\n[setup] Starting the persistent PostgreSQL Compose service.');
    await runCommand('docker', ['compose', 'up', '-d', 'postgres']);
  } else {
    console.log('\n[setup] Reusing the running persistent PostgreSQL Compose service.');
  }

  const deadline = Date.now() + serviceTimeoutMs;
  while (Date.now() < deadline) {
    try {
      await runCommand(
        'docker',
        [
          'compose',
          'exec',
          '-T',
          'postgres',
          'sh',
          '-lc',
          'pg_isready -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
        ],
        { quiet: true, timeoutMs: 10_000 },
      );
      console.log('[setup] PostgreSQL is ready. Migrations are not run.');
      return;
    } catch {
      await delay(retryDelayMs);
    }
  }
  throw new SetupVerificationError(
    'PostgreSQL did not become ready. Run "docker compose ps" and inspect the postgres service logs, then retry.',
  );
}

async function cleanup() {
  if (cleanupPromise) {
    return cleanupPromise;
  }
  cleanupPromise = Promise.all(
    startedServices.reverse().map(async ({ child, name }) => {
      await stopProcess(child);
      console.log(`[setup] Stopped runner-owned ${name}.`);
    }),
  );
  return cleanupPromise;
}

for (const [signal, exitCode] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.once(signal, async () => {
    console.error(`\n[setup] Received ${signal}; cleaning up runner-owned services.`);
    await cleanup();
    process.exit(exitCode);
  });
}

async function main() {
  await verifyRuntime();
  await verifyWorkspaceInstallation();
  await ensureDatabase();

  await runCommand(pnpm, ['format:check']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/frontend', 'lint']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/frontend', 'build']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/backend', 'lint']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/backend', 'build']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/backend', 'test']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/backend', 'test:e2e']);
  await runCommand(pnpm, ['--filter', '@nuestro-breaking/frontend', 'test:e2e']);

  await startOrReuseService({
    name: 'backend',
    port: 3000,
    command: pnpm,
    args: ['--filter', '@nuestro-breaking/backend', 'start:dev'],
    environment: { HOST: '127.0.0.1', PORT: '3000' },
    checks: [{ url: 'http://127.0.0.1:3000/api/doc', expectedContent: 'swagger-ui' }],
  });
  await startOrReuseService({
    name: 'frontend',
    port: 5173,
    command: pnpm,
    args: [
      '--filter',
      '@nuestro-breaking/frontend',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      '5173',
    ],
    environment: {},
    checks: [
      { url: 'http://127.0.0.1:5173/admin', expectedContent: '<div id="root">' },
      { url: 'http://127.0.0.1:5173/dancer', expectedContent: '<div id="root">' },
    ],
  });

  console.log(
    '\n[setup] Setup verification passed. PostgreSQL remains running; runner-owned web services will now stop.',
  );
}

try {
  await main();
} catch (error) {
  console.error(`\n[setup] Setup verification failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await cleanup();
}
