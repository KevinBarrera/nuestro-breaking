import { buttonClass } from '@/shared/ui';

// Error element of the lazy admin and dancer routes. Their chunk can fail to load, typically in a
// tab opened before a deploy (the old chunk names are gone); a reload fetches the new version.
export function RouteLoadError() {
  return (
    <main className="flex min-h-dvh flex-col items-start gap-3 bg-page px-5 py-10 font-sans text-fg">
      <h1 className="text-2xl font-extrabold text-heading">No pudimos cargar esta página</h1>
      <p>Revisa tu conexión o recarga; si hubo una actualización, se cargará la versión nueva.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className={buttonClass('primary')}
      >
        Recargar
      </button>
    </main>
  );
}
