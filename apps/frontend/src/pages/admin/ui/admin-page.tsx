const sampleActivities = [
  {
    name: 'Batalla individual',
    kind: 'Batalla',
    schedule: '14 de noviembre, 10:00',
    location: 'Pista principal',
    price: 'Por confirmar',
    capacity: 'Por confirmar',
  },
  {
    name: 'Taller de equipos',
    kind: 'Taller',
    schedule: '14 de noviembre, 14:00',
    location: 'Sala de talleres',
    price: 'Por confirmar',
    capacity: 'Por confirmar',
  },
];

export function AdminPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-8 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-700 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
              Nuestro Breaking
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Administración</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Vista preliminar del espacio de administración para el equipo organizador y los
              jueces.
            </p>
          </div>
          <span className="rounded-full border border-cyan-700 bg-cyan-950 px-3 py-1 text-xs font-medium text-cyan-200">
            Vista de planificación · Datos de ejemplo
          </span>
        </header>

        <p className="mt-6 rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
          La propuesta del MVP de noviembre sigue en borrador; no está aprobada.
        </p>

        <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <section aria-label="Evento de ejemplo" className="min-w-0 space-y-5">
            <article
              aria-labelledby="event-title"
              className="rounded-xl border border-slate-700 bg-slate-900 p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-orange-300">
                    Evento de ejemplo
                  </p>
                  <h2
                    id="event-title"
                    className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl"
                  >
                    Fin de semana de breaking
                  </h2>
                </div>
                <span className="rounded-full border border-amber-700 bg-amber-950 px-2.5 py-1 text-xs font-medium text-amber-200">
                  Borrador
                </span>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-slate-700 pt-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-400">Fecha ilustrativa</dt>
                  <dd className="mt-1 font-medium">14 de noviembre</dd>
                </div>
                <div>
                  <dt className="text-slate-400">Sede</dt>
                  <dd className="mt-1 font-medium">Por confirmar</dd>
                </div>
              </dl>
            </article>

            <section aria-labelledby="activities-title">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id="activities-title" className="text-lg font-semibold">
                  Actividades de ejemplo
                </h3>
                <span className="text-xs text-slate-400">Dentro del evento · 2 actividades</span>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {sampleActivities.map((activity) => (
                  <article
                    key={activity.name}
                    aria-label={activity.name}
                    className="rounded-xl border border-slate-700 bg-slate-900 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h4 className="text-base font-semibold">{activity.name}</h4>
                      <span className="rounded-full border border-amber-700 bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                        Borrador
                      </span>
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-slate-700 pt-4 text-sm">
                      <div>
                        <dt className="text-slate-400">Tipo</dt>
                        <dd className="mt-0.5 font-medium text-fuchsia-200">{activity.kind}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Horario</dt>
                        <dd className="mt-0.5 font-medium">{activity.schedule}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-slate-400">Lugar</dt>
                        <dd className="mt-0.5 font-medium">{activity.location}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Precio</dt>
                        <dd className="mt-0.5 font-medium">{activity.price}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Cupo</dt>
                        <dd className="mt-0.5 font-medium">{activity.capacity}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <section
            aria-labelledby="planning-title"
            className="rounded-xl border border-slate-700 bg-slate-900 p-5"
          >
            <h2 id="planning-title" className="text-base font-semibold">
              Estado de planificación
            </h2>
            <p className="mt-2 text-sm text-slate-300">2 actividades de ejemplo</p>
            <div className="mt-4 border-t border-slate-700 pt-4">
              <span className="inline-flex rounded-full border border-amber-700 bg-amber-950 px-2.5 py-1 text-xs font-medium text-amber-200">
                Pendiente de definir
              </span>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Los campos que dependen de la organización siguen siendo configurables o quedan
                pendientes de definir.
              </p>
            </div>
            <p className="mt-4 border-t border-slate-700 pt-4 text-xs leading-5 text-cyan-200">
              Información de muestra para planificar, no datos en vivo.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
