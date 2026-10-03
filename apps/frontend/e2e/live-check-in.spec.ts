import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { expect, test, type Request } from '@playwright/test';

const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
const server = resolve(backend, 'test/support/live-check-in-server.ts');
const api = `http://127.0.0.1:${process.env.NB_LIVE_API_PORT}`;

type Ready = {
  type: 'ready';
  event: string;
  otherEvent: string;
  registration: string;
  deniedRegistration: string;
};
type Snapshot = {
  type: 'snapshot';
  rows: { event_registration_id: string }[];
  registrations: { id: string; status: string }[];
};

function waitFor<T extends { type: string }>(child: ChildProcess, type: T['type']): Promise<T> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for ${type}`)), 120_000);
    function finish(error?: Error, message?: T) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolveMessage(message!);
    }
    function onMessage(message: unknown) {
      if (message && typeof message === 'object' && 'type' in message && message.type === type)
        finish(undefined, message as T);
    }
    function onExit(code: number | null) {
      finish(new Error(`Live backend exited before ${type} (code ${code})`));
    }
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

async function exitedWithin(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, ms);
    function onExit() {
      clearTimeout(timer);
      resolveExit(true);
    }
    child.once('exit', onExit);
  });
}

async function stopChild(child: ChildProcess) {
  if (child.connected) child.disconnect();
  if (await exitedWithin(child, 30_000)) return;
  child.kill('SIGTERM');
  if (await exitedWithin(child, 10_000)) return;
  // Last resort if the child cannot finish Docker cleanup; never leave a live child behind.
  child.kill('SIGKILL');
  if (!(await exitedWithin(child, 5_000))) throw new Error('Live backend could not be stopped');
  throw new Error('Live backend required forced termination; inspect disposable container cleanup');
}

test.setTimeout(240_000);
test('browser session searches, admits only authorized registration and persists no denied fact', async ({
  page,
}) => {
  const child = fork(server, [], {
    cwd: backend,
    execArgv: [
      '-r',
      'ts-node/register',
      '-r',
      resolve(backend, 'scripts/register-tsconfig-paths.cjs'),
    ],
    env: {
      ...process.env,
      TS_NODE_PROJECT: resolve(backend, 'tsconfig.json'),
      AUTH_TRUSTED_ORIGIN: process.env.NB_LIVE_ORIGIN,
      // Even an accidental un-overridden database provider cannot reach a configured DB.
      DATABASE_URL: 'postgresql://invalid:invalid@127.0.0.1:1/invalid',
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  try {
    const ready = await waitFor<Ready>(child, 'ready');
    const requests: Request[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(api)) requests.push(request);
    });
    await page.goto('/admin');
    await page.getByRole('textbox', { name: 'Correo electrónico' }).fill('live@example.test');
    await page.getByLabel('Contraseña').fill('disposable-password');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    const eventLink = page
      .getByRole('region', { name: 'Eventos para el control de acceso' })
      .getByRole('link', { name: /Live event/ });
    await expect(eventLink).toBeVisible();
    await eventLink.click();
    await page.getByRole('textbox', { name: 'Buscar inscripción' }).fill('Allowed');
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.getByRole('button', { name: /Allowed Guest/ }).click();
    await expect(page.getByText('Inscripción confirmada')).toBeVisible();
    await page.getByRole('button', { name: 'Registrar entrada al evento' }).click();
    await expect(page.getByText('Entrada al evento registrada')).toBeVisible();
    expect(requests.some((r) => r.url().includes('/participants?q=Allowed'))).toBe(true);
    const admitted = requests.find((r) => r.method() === 'POST' && r.url().endsWith('/check-in'));
    expect(admitted?.url()).toBe(
      `${api}/admin/events/${ready.event}/registrations/${ready.registration}/check-in`,
    );
    const headers = await admitted!.allHeaders();
    expect(headers.origin).toBe(process.env.NB_LIVE_ORIGIN);
    expect(headers['x-csrf-token']).toMatch(/^[a-f0-9]{64}$/);
    const cookies = await page.context().cookies();
    expect(
      cookies.map(({ name, domain, secure, httpOnly }) => ({ name, domain, secure, httpOnly })),
    ).toContainEqual({
      name: 'nb_admin_session',
      domain: '127.0.0.1',
      secure: true,
      httpOnly: true,
    });

    // An authenticated browser request with the real CSRF token must not admit another event.
    const denial = await page.evaluate(
      async ({ endpoint, csrf }) => {
        const response = await fetch(endpoint, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
          body: '{}',
        });
        return response.status;
      },
      {
        endpoint: `${api}/admin/events/${ready.otherEvent}/registrations/${ready.deniedRegistration}/check-in`,
        csrf: headers['x-csrf-token'],
      },
    );
    expect(denial).toBe(401);
    const deniedRequest = requests.find(
      (r) =>
        r.method() === 'POST' &&
        r.url().endsWith(`/registrations/${ready.deniedRegistration}/check-in`),
    );
    expect(deniedRequest?.url()).toBe(
      `${api}/admin/events/${ready.otherEvent}/registrations/${ready.deniedRegistration}/check-in`,
    );
    const deniedHeaders = await deniedRequest!.allHeaders();
    expect(deniedHeaders.origin).toBe(process.env.NB_LIVE_ORIGIN);
    expect(deniedHeaders['x-csrf-token']).toBe(headers['x-csrf-token']);
    expect(deniedHeaders.cookie).toMatch(/(?:^|; )nb_admin_session=[a-f0-9]{64}(?:;|$)/);
    const wrongOrigin = await page
      .context()
      .request.post(
        `${api}/admin/events/${ready.event}/registrations/${ready.deniedRegistration}/check-in`,
        {
          headers: { Origin: 'https://untrusted.example', 'X-CSRF-Token': headers['x-csrf-token'] },
        },
      );
    expect(wrongOrigin.status()).toBe(403);
    child.send('snapshot');
    const snapshot = await waitFor<Snapshot>(child, 'snapshot');
    expect(snapshot.rows.map((row) => row.event_registration_id)).toEqual([ready.registration]);
    expect(snapshot.registrations).toHaveLength(2);
    expect(snapshot.registrations.every((row) => row.status === 'confirmed')).toBe(true);
    expect(snapshot.registrations.some((row) => row.id === ready.deniedRegistration)).toBe(true);
  } finally {
    await stopChild(child);
  }
});
