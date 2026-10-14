// Build-time checks for Cloudflare Workers Builds, which sets WORKERS_CI=1. Vite inlines
// VITE_* values at build time, so a missing API origin would silently ship the local default.
export interface HostedBuildEnv {
  WORKERS_CI?: string;
  VITE_API_BASE_URL?: string;
}

export function assertHostedBuildEnv(env: HostedBuildEnv): void {
  if (env.WORKERS_CI !== '1') return;

  const apiBaseUrl = env.VITE_API_BASE_URL?.trim();
  if (!apiBaseUrl) {
    throw new Error(
      'VITE_API_BASE_URL must be set for Cloudflare builds; without it the site calls http://localhost:3000.',
    );
  }
  if (!isBareHttpsOrigin(apiBaseUrl)) {
    throw new Error(
      `VITE_API_BASE_URL must be an HTTPS origin with no path or trailing slash, like https://api.example.com (got "${env.VITE_API_BASE_URL}").`,
    );
  }
}

// `apiUrl` appends paths that start with "/", so the value must be exactly an origin.
function isBareHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === value;
  } catch {
    return false;
  }
}
