# Admin Bootstrap Runbook

This guide covers creating the **first global administrator** of a hosted
environment (staging or production) with `admin:bootstrap`
([#214](https://github.com/KevinBarrera/nuestro-breaking/issues/214)). A
developer runs it **once per environment**. After that, global administrators
add and remove people from the admin panel; see
[Managing the team](support.md#managing-the-team).

`admin:provision` is a different command: it only works against a local
database and takes a password. `admin:bootstrap` works in any environment and
never takes a password: it prints a one-time activation link, and the
administrator chooses their own password from that link.

> The `/activar-cuenta` page that opens the link arrives in a later slice of
> #214. Until it ships, the link is issued and stored but cannot be used yet.

## What it does

All steps run in one database transaction, under a lock, so two runs at the
same time cannot both create an administrator.

1. If an active global administrator who has already set a password exists,
   it changes nothing and exits with code `2`.
2. If a global administrator who has **not activated yet** exists:
   - with the **same email**, it cancels their previous link and issues a new
     one (use this when the first link expired or was lost);
   - with a **different email**, it changes nothing and exits with code `2`.
     The message shows that email masked (for example `f***@example.com`).
3. Otherwise it creates the user (or reuses an existing user with that email,
   clearing any old password and signing out their sessions), gives them one
   global `admin` role, and issues an activation link valid for **72 hours**.

Every issued link is recorded in `admin_team_audit` as `bootstrapped`. Only a
SHA-256 digest of the link's token is stored, never the token itself.

## Required environment variables

| Variable                | Value                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | The environment's PostgreSQL database (already set on the backend service).                          |
| `AUTH_TRUSTED_ORIGIN`   | The admin app's origin, for example `https://staging.[domain]`. Required: the link is built from it. |
| `ADMIN_BOOTSTRAP_EMAIL` | The first administrator's email. It is trimmed and lowercased.                                       |
| `ADMIN_BOOTSTRAP_NAME`  | Their display name (up to 200 characters).                                                           |

Set the two `ADMIN_BOOTSTRAP_*` values only for the run (for example inline on
the command), not as permanent service variables.

## Running it

Run it as a one-off command against the target environment, using the
hosting provider's shell or one-off command for the backend service
([ADR 0008](../adr/0008-hosting-platform.md)), so it reaches the database over
the private network:

```bash
ADMIN_BOOTSTRAP_EMAIL='first.admin@example.com' \
ADMIN_BOOTSTRAP_NAME='First Admin' \
pnpm --filter @nuestro-breaking/backend admin:bootstrap
```

The command runs through `ts-node`, so it needs the backend's development
dependencies installed where it runs.

On success it prints the activation link
(`https://<admin origin>/activar-cuenta#<token>`), its expiry time in
ISO-8601 (UTC), and a reminder that it is shown only once.

## Exit codes

| Code | Meaning                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------- |
| `0`  | A link was issued (new administrator, or a new link for the pending one).                               |
| `1`  | Error: invalid input, or the database could not be reached. Nothing was changed.                        |
| `2`  | Refused: the environment already has a global administrator (activated, or pending with another email). |

Automation can treat `2` as "already bootstrapped" and `1` as a failure.

## If the link expires or is lost

- **Not activated yet:** run the command again with the **same email**. The old
  link stops working and a new one is printed.
- **Already activated:** the command refuses. A global administrator issues a
  new link from the admin panel instead
  ([Managing the team](support.md#managing-the-team)).

## Security notes

- The link is shown **once** and is never stored in readable form. Copy it and
  share it privately with the administrator (not in a public channel, ticket or
  repository). Anyone with the link can set the account's password until it is
  used, cancelled or expires.
- The token sits after `#` in the URL. Browsers never send that part to
  servers, so it does not appear in server or proxy logs.
- The command never prints database errors, the database URL or token digests.
  If it fails, it prints a short message and exits with code `1`.
- Clear the `ADMIN_BOOTSTRAP_*` values from your shell history or one-off
  command settings if your provider keeps them.
