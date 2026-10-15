/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API origin; defaults to http://localhost:3000 (`src/shared/api/client.ts`).
  readonly VITE_API_BASE_URL?: string;
  // Slug of the event shown at `/`; unset shows "No hay evento a la venta".
  readonly VITE_PUBLIC_EVENT_SLUG?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
