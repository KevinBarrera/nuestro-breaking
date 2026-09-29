# Local admin provisioning

## Tracking

- GitHub issue: #92 — Add strict local admin provisioning command
- Branch: `feat/local-admin-provisioning`
- Follows: #90 — Polish admin sign-in UI

## Goal

Add a strict local-only backend command so developers can create or update a local admin user without manual SQL or a user-management UI.

## Tasks

- [x] Map existing auth/database/script conventions.
- [x] Create approved GitHub issue and ODD tracking.
- [x] Add RED tests for production-safety guards and provisioning behavior.
- [x] Implement the local admin provisioning command.
- [x] Verify focused backend checks and repository formatting.
- [x] Run RDD review and prepare delivery summary.

## Constraints

- Be extremely strict about production safety: fail closed before any write unless all local-only guard conditions are satisfied.
- Require an explicit local-only environment flag and an exact confirmation phrase.
- Refuse production-like environment names and common hosted/CI environment markers.
- Refuse non-loopback database hosts.
- Refuse database names that do not look local/dev/test.
- Never log or expose plaintext passwords or password hashes.
- Do not add user-management UI, public registration, password recovery, broader role administration, or production provisioning policy.

## Evidence

- Existing auth supports manually provisioned Argon2id password hashes in `users.password_hash` and active `user_roles.role` values of `admin` or `judge`.
- `docs/contracts/admin-auth-boundary.md` explicitly says the first implementation may seed or manually provision admin identities while public self-registration and user-management UI are out of scope.
- Current database URL resolution comes from `apps/backend/src/database/environment.ts`, using `DATABASE_URL` or `.env` `POSTGRES_*` variables.
- RED: focused Jest run failed because `./local-admin-provisioning` did not exist (suite could not load); GREEN: focused Jest passed 33 tests after implementation and guard hardening.
- The command is `corepack pnpm --filter @nuestro-breaking/backend admin:provision --confirm-local-only=provision-local-admin --email=admin@example.test --display-name="Local Admin"`. Set `LOCAL_ADMIN_PROVISIONING=I_UNDERSTAND_THIS_IS_LOCAL_ONLY` and `LOCAL_ADMIN_PASSWORD` in the environment beforehand; never put the password on the command line. Requires a local/dev/test PostgreSQL database on loopback and rejects hosted/CI markers. The DB mutation runs in a transaction and the password is hashed with Argon2id; driver errors are not printed.
- Verification: `corepack pnpm --filter @nuestro-breaking/backend test -- local-admin-provisioning.spec.ts --runInBand` (33 passing), `corepack pnpm --filter @nuestro-breaking/backend lint` (pass), `corepack pnpm --filter @nuestro-breaking/backend build` (pass), and `corepack pnpm format:check` (pass). Initial lint/format runs failed on new-file style and were corrected. Independent verification and RDD flagged additional strictness gaps; fixes added rejection for `VERCEL`, production-like local database names such as `production_local` and `production2025_local`, raw control-character emails including trim-masked controls, and control-character display names. All commands warned that the current Node 24.19.0 differs from the manifest's 24.18.1.
- Not yet exercised against a real local database; focused provisioning tests use a transactional mock.
- RDD initially found the numeric-suffix production-name gap (`production2025_local`); the correction tightened production-token detection, added a focused regression test, and the final native review approved and was acknowledged: `review-28b2fd28ca189836`. It left one non-blocking informational advisory in the transactional mock test area.
