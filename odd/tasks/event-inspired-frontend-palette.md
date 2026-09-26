# Event-inspired frontend palette

## Tracking

- GitHub issue: #71 — style(frontend): define event-inspired color palette
- Branch: `style/71-event-inspired-palette`

## Goal

Add a small, reversible frontend palette inspired by the provided Los Más Pesados logo and event publicity images so existing UI routes show visible progress without claiming final branding approval.

## Tasks

- [x] Create traceable GitHub issue and work branch.
- [x] Define event-inspired CSS color tokens.
- [x] Apply tokens to shared page shell for existing routes.
- [x] Fix inherited not-found route link contrast.
- [x] Verify frontend checks and changed files.

## Constraints

- Frontend-only visual change.
- No logo asset ingestion.
- No product behavior, routing, backend, or data model changes.
- Treat palette as draft/event-inspired, not final approved branding.

## Evidence

- `apps/frontend/src/app/styles/index.css` defines draft event colors and a dusk/indigo background gradient.
- `apps/frontend/src/shared/ui/page-shell.tsx` uses cream text and cyan, magenta, and orange accents for shared routes.
- `apps/frontend/src/pages/not-found/ui/not-found-page.tsx` uses palette-aware link colors so inherited dark backgrounds remain readable.
- `corepack pnpm --filter @nuestro-breaking/frontend lint` passed; pnpm emitted the existing Node engine warning because this host is on Node v24.19.0 while the repo wants v24.18.1.
- `git diff --check` passed.
- `corepack pnpm --filter @nuestro-breaking/frontend build` passed with the same existing Node engine warning.
