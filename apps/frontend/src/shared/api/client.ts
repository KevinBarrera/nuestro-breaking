// The backend allows the local Vite origin; deployments can override the API origin.
const apiBaseUrl =
  (import.meta.env as { VITE_API_BASE_URL?: string }).VITE_API_BASE_URL ?? 'http://localhost:3000';

export function apiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}
