# Legal documents and buyer acceptance — issue #180

Objective: publish the three legal documents of the purchase flow as versioned in-app pages and store each buyer's acceptance (document key, version, timestamp) with the registration.
Branch: chained `feat/180-NN-*` from `dev` at `cb8d555`. Delivery: `auto-chain`, stacked to `dev`; `Closes #180` on the last PR, no `Co-Authored-By`.
Test runner: backend Jest unit and PostgreSQL e2e (`pnpm --filter @nuestro-breaking/backend test` / `test:e2e`), frontend Vitest and Playwright (`pnpm verify:pr`). Engram mirror: `odd/legal-acceptance/tasks`.

## Specs

- S1 — Issue scope: "Versioned documents (pages or links) for the three texts, with a placeholder version until the organizer delivers the final text." Documents: "Reglamento oficial, Aviso de privacidad, Política de cancelación. The MVP has no refunds." User decision (L2): in-app pages. Assumption: routes `/legal/reglamento`, `/legal/privacidad`, `/legal/cancelacion`; placeholder version `borrador-2026-10-13`, the same constant in both apps.
- S2 — Issue scope: "Three required checkboxes in the review screen (#176), each linking its document." Acceptance: "The three documents are reachable from the purchase flow and show their version."
- S3 — Issue scope: "Store acceptance per registration: document key, version and timestamp; reject a public registration without all three." Acceptance: "A registration cannot be created without the three acceptances." and "Each registration stores document key, version and acceptance timestamp." Assumption: the request carries `legalAcceptances: { rules, privacy, cancellation }` with the accepted version of each; a missing one is 400 `required`, a version other than the current one is 400 `outdated`. A reused pending registration (D5) gets new acceptance rows; earlier rows stay.
- S4 — Issue acceptance: "Changing a document version does not alter past acceptances."
- S5 — Issue acceptance: "Jest/PostgreSQL e2e specs cover acceptance storage; Playwright covers the checkboxes."
- S6 — Issue scope: "Only the final text is blocked on the organizer; the mechanism is not." Acceptance "Final organizer texts are published before launch (#182)" stays open for #182.

## Tasks

| ID  | Specs          | Route  | Status | Evidence  |
| --- | -------------- | ------ | ------ | --------- |
| T1  | S3, S4, S5     | inline | done   | `8fb877e` |
| T2  | S1, S2, S5, S6 | inline | done   | `0b195fb` |

- T1 — Backend: legal document versions constant, request parsing, `registration_legal_acceptances` table (migration 0026), insert in the registration transaction (new and reused), unit + PostgreSQL e2e, contract doc.
- T2 — Frontend: legal pages and routes with version, review links and home links, payload with `legalAcceptances`, `outdated` message, Vitest + Playwright, docs.

Routes: inline (sequential units; no Writer trigger). Risk: T1 item 1 (new migration) and item 3 (public request contract gains a required field) → independent verifier. T2: item 3 shared with T1.

## Log

- L1 (user, 2026-10-13): "retomando el proyecto con foco en el mvp vamos a arrancar con el issue #180"
- 2026-10-13: mapping. The review page already has the three checkboxes (`rules`, `privacy`, `cancellation`) with `href="#"` links and blocks "Pagar" until all are checked; the POST body is `{buyer, passes}` and the parser rejects other keys (`unknown_field`). The service runs in one transaction with a reuse path (D5). Migrations after 0002 are hand-written with manual journal entries; next is 0026. Frontend and backend share no code, so the version constant lives in both.
- L2 (user, 2026-10-13): documents as "Páginas en la app (Recomendado)".
- 2026-10-13: T1 done (`8fb877e`, branch `feat/180-01-legal-acceptance-storage`). `events/legal-documents` (keys from the schema, versions `borrador-2026-10-13`), parser requires `legalAcceptances: { rules, privacy, cancellation }` (`required` / `invalid` / new code `outdated` / `unknown_field`), table `registration_legal_acceptances` (migration 0026, journal entry), one row per document appended in the registration transaction on both the new and reused paths. Contract updated. RED (module missing; e2e relation missing) then GREEN: backend unit 501/501, e2e 402/402 (the migration-count check in `event-activity-foundation` bumped to 27), lint and `tsc` clean. A first commit `e1190fe` carried an accidental Prettier reformat of snapshots 0000–0002; amended away.
- 2026-10-13: T1 independent verifier: S3, S4, S5 (backend) PASS, no blockers. Accepted advisories: A1 append-only is enforced by code only (other audit tables reject `DELETE` in the database; nothing deletes registrations or acceptances today); A2 `LEGAL_DOCUMENT_VERSIONS` is a mutable record (the e2e changes it and restores it in `finally`).
- 2026-10-13: T2 done (`0b195fb`, branch `feat/180-02-legal-documents-pages`). `shared/config/legal-documents.ts` (titles, paths, versions), `pages/legal-document` (title, "Versión: …", "Texto provisional" notice, placeholder paragraphs that only say what each document will cover, "Ir al inicio"), routes `/legal/reglamento|privacidad|cancelacion`, review checkbox links open the pages in another tab, home footer links, `legalAcceptances` in the POST body, `serverErrors.legal` → "Actualizamos los documentos legales. Recarga la página, revísalos y acéptalos de nuevo para pagar.". Docs: frontend architecture. Evidence: RED (Vitest 3 failed; Playwright 6 failed) then GREEN; `verify:pr` exit 0: Vitest 373/373, Playwright 395/395.
- Open for #182: final organizer texts and their versions (S6), in both apps.
