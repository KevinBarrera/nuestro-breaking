# Event-day check-in — issue #112

## Tracking

- Issue: https://github.com/KevinBarrera/nuestro-breaking/issues/112
- Branch: `feat/112-event-day-check-in` from clean `dev` at `dcff1a6fde19d38c319a580496c16c00e62ebe63`.
- Status: T1 in progress; no source edits yet.
- Delivery strategy: feature/tracker branch chain (user-selected); forecast ~700–1000 authored changed lines across two work units (tests included). Prepare backend projection and screen as separate review slices; no push or PR without user approval. Record actual slice boundaries after commits.

## Objective and boundaries

Give authenticated, event-authorized admins a usable event-day search and check-in surface. #64 check-in commands and #102 protected participant search are integrated; the outstanding technical dependency is current attendance status. Extend the existing event-scoped, bounded participant-search response with the smallest status projection: event check-in timestamp or null and per-enrolled-activity check-in timestamp or null, never actor/session data. The server joins only within the authorized event. The frontend must distinguish registration confirmation from attendance, permit activity admission only after event admission and matching eligible enrollment, and announce success only after a durable successful POST response. Duplicates, stale/concurrent requests, denials, loading, and errors get truthful states and safe handoff. No overrides, refunds, payment or registration writes, QR/PIN, exports or offline sync; #65 owns printable fallback and #104 owns corrections.

## Tasks

- [ ] T1 — Add minimal event-scoped attendance projection to protected paginated registration search; test event/activity status, authorization, isolation and no sensitive metadata. Test-first RED/GREEN where PostgreSQL E2E runner works; verify backend checks. Route: delegated writer (multi-file write and preparation). Commit as one backend work unit. Status: in progress.
- [ ] T2 — Build authenticated event-specific operator search and check-in screen consuming T1; test status distinctions, ordering, matching eligibility, response-confirmed success, duplicates, denied/error/loading and mobile access. Test-first RED/GREEN where browser runner works; verify frontend checks. Route: delegated writer (multi-file write and preparation). Commit as one frontend work unit. Status: pending.
- [ ] T3 — Cross-slice verification and review workload readback; run applicable integration/browser checks, record limitations and next delivery decision. Route: delegated verifier if risk plan requires; no push or PR. Status: pending.

## Acceptance and evidence

- Authorized event admin can search registrations and read only that event's current attendance; wrong-event, unauthenticated and wrong-role requests leak nothing. Status response excludes check-in actor/session and payment data.
- UI shows confirmed registration, event attendance, and per-eligible-enrollment activity attendance separately; activity command is offered only after event attendance. General admission does not imply activity admission.
- Success requires backend confirmation; duplicate/denied/error responses do not falsely claim a new success. Re-fetch status after POST to resolve stale/concurrent state; no implicit mutation of registration/payment.
- Desktop/mobile loading, empty, denied, error, and handoff states covered by backend and browser checks.
- T1 evidence: pending. Commit: pending.
- T2 evidence: pending. Commit: pending.
- T3 evidence: pending.

## Next step

Delegate T1 test-first backend projection and verify it before T2 begins.
