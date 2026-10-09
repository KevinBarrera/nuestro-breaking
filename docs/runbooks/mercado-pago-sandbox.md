# Mercado Pago Sandbox Purchase Runbook

This guide walks through one complete test purchase on your own computer: a
buyer picks passes, pays on Mercado Pago's test checkout, and our backend
confirms the registration from Mercado Pago's notification. No real money
moves. It was first run end to end on 2026-10-09 for
[#177](https://github.com/KevinBarrera/nuestro-breaking/issues/177).

Never put real tokens, secrets, account ids or tunnel URLs in this repository:
it is public. Real values live only in your local `.env`.

## How it fits together

1. The buyer clicks "pay" on our site. The backend asks Mercado Pago for a
   checkout page (a "preference") and sends the buyer there.
2. The buyer pays with a test card on Mercado Pago's page.
3. Mercado Pago sends a signed notification (a "webhook") to our backend. The
   backend checks the signature, reads the payment back from Mercado Pago and,
   if it is approved for the right amount, confirms the registration and
   assigns a folio.

The buyer coming back to our site is a convenience only. Confirmation never
depends on it.

## 1. One-time setup in Mercado Pago

You do this once. It gives you a fake seller and a fake buyer.

1. In the [Mercado Pago developers panel](https://www.mercadopago.com.mx/developers/panel/app),
   create an application. Choose **API de Preferences** and **Checkout Pro**.
   Creating it also creates a **test seller** account automatically.
2. Under **Cuentas de prueba**, create a **test buyer** (country Mexico). The
   prefilled balance is fine.
3. Write down, in a private place (not the repository), each test account's
   user name, password and User ID. When a test account logs in and Mercado
   Pago asks for a verification code, the code is the **last 6 digits of that
   account's User ID**.

## 2. Credentials and environment variables

The backend reads these from the repository-root `.env` at startup. Only the
names appear here; see the README section "Mercado Pago credentials" for what
each one means.

| Variable                        | Value for a sandbox run                                         |
| ------------------------------- | --------------------------------------------------------------- |
| `MERCADO_PAGO_MODE`             | `sandbox`                                                       |
| `MERCADO_PAGO_ACCESS_TOKEN`     | The test **Access Token** of your application                   |
| `MERCADO_PAGO_WEBHOOK_SECRET`   | The **test seller's** webhook secret (see step 4)               |
| `PUBLIC_APP_URL`                | Your local frontend origin, for example `http://localhost:5173` |
| `MERCADO_PAGO_NOTIFICATION_URL` | `<tunnel-url>/public/payments/mercado-pago/webhook`             |

- The test Access Token starts with `APP_USR-`. That is normal: Mercado Pago's
  Checkout Pro test credentials use the same prefix as live ones.
- Only the Access Token is needed. Our flow does not use the Public Key.
- A line left empty, such as `PORT=`, counts as "not set" and falls back to the
  default.
- The frontend reads `VITE_API_BASE_URL` and `VITE_PUBLIC_EVENT_SLUG` from
  `apps/frontend/.env` (there is no template file; create it if you need it).

After any change to `.env`, **restart the backend**. Watch mode only reloads
code, not environment variables.

## 3. Open a tunnel so Mercado Pago can reach you

Mercado Pago can only send notifications to a public HTTPS address. A tunnel
gives your local backend (port 3000) such an address.

```bash
ngrok http 3000
```

Copy the `https://...` forwarding URL it prints. That is `<tunnel-url>`. Put
`<tunnel-url>/public/payments/mercado-pago/webhook` into
`MERCADO_PAGO_NOTIFICATION_URL` and restart the backend.

Free tunnel URLs change every time ngrok restarts. When that happens, update
both `.env` (then restart the backend) and the webhook URL in the Mercado Pago
panel (step 4).

## 4. Configure the webhook with the right secret

**Webhook secrets belong to one account.** Real test payments belong to the
test seller, so Mercado Pago signs their notifications with the **test
seller's** secret, not the secret of the account that created the application.
Using the wrong one makes every real notification fail with 401.

1. Open a private (incognito) browser window and log into the developers panel
   **as the test seller**.
2. Open its application and go to **Webhooks**.
3. In the test configuration, set the URL to
   `<tunnel-url>/public/payments/mercado-pago/webhook` and select the
   **Pagos** event. Save.
4. Copy the secret shown there into `MERCADO_PAGO_WEBHOOK_SECRET` and restart
   the backend.

## 5. Optional: try the panel's simulator

The panel's **Simular notificación** button sends a fake notification. It is
useful only to check that the tunnel and URL work:

- **500** is the expected answer. The signature was valid, but the simulator
  uses a made-up payment id that Mercado Pago cannot find. For the first hour
  our backend answers 500 so Mercado Pago retries, in case a real payment is
  simply not readable yet.
- **401** means the signature did not match the secret.

The simulator is signed with the application owner's secret, while real test
payments use the test seller's secret (step 4). So the simulator can show 401
even when real payments will work, or the other way round. Trust the real
purchase below.

## 6. Make the test purchase

1. Start the database, backend and frontend:

   ```bash
   docker compose up -d postgres
   pnpm dev:backend
   pnpm dev:frontend
   ```

2. Open the event page (`/e/<slug>`), choose passes, fill in the participant
   and continue to payment. You land on Mercado Pago's sandbox checkout
   (`sandbox.mercadopago.com.mx`).
3. Log in there **as the test buyer**.
4. Pay with a test card from the
   [official Mexico test cards page](https://www.mercadopago.com.mx/developers/es/docs/checkout-pro/integration-test/test-cards).
   Use **`APRO`** as the cardholder name to approve the payment. Other names
   on that page simulate rejections.

Locally you may not see a "Volver al sitio" button after paying. That is
expected: Mercado Pago only returns buyers automatically to an `https` site,
so the backend asks for it only when `PUBLIC_APP_URL` is `https`. Confirmation
still happens through the webhook.

## 7. Check the result

These queries run inside the database container and use its own credentials,
so nothing secret is printed. Replace `<postgres-container>` with the name
shown by `docker compose ps`.

```bash
# Latest registrations: expect status confirmed, approved_payment and a folio.
docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, status, confirmation_source, folio, confirmed_at FROM event_registrations ORDER BY updated_at DESC LIMIT 3;"'

# Payments: expect status approved with the right amount (in cents).
docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT provider_payment_id, status, amount_cents, currency, updated_at FROM registration_payments ORDER BY updated_at DESC LIMIT 3;"'

# Notifications: expect outcome confirmed for the payment.
docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT provider_payment_id, outcome, received_at, processed_at FROM payment_webhook_notifications ORDER BY received_at DESC LIMIT 5;"'

# Audit: expect payment_approval by actor system.
docker exec <postgres-container> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT operation_type, actor_kind, amount_cents, reference, created_at FROM registration_operation_audit ORDER BY created_at DESC LIMIT 3;"'
```

Mercado Pago often sends several notifications for one payment. Only the first
one does the work; the others are recorded and acknowledged.

To resend a notification on purpose, open the ngrok inspector
(`http://127.0.0.1:4040`) and click **Replay** on a captured request. It keeps
the original signature, and the backend processes each notification once, so
a replay is safe.

## Troubleshooting

| What you see                                                                             | What it means and what to do                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Webhook answers **401**                                                                  | The secret does not match the account that owns the payment. Use the test seller's webhook secret (step 4), then restart the backend.                                                                               |
| Webhook answers **500** for the simulator                                                | Expected: the simulator's payment id does not exist (step 5).                                                                                                                                                       |
| Webhook answers **500** for a real payment                                               | The payment could not be read yet, or our access token was rejected. Check the backend log; Mercado Pago retries on its own.                                                                                        |
| Checkout fails and the log shows `WARN [PublicCheckoutService] ... status 400: <reason>` | Mercado Pago rejected the checkout request; `<reason>` is its short explanation. For example, `auto_return invalid. back_url.success must be defined` means an automatic return was requested for a non-https site. |
| No "Volver al sitio" button after paying                                                 | Expected with an `http` `PUBLIC_APP_URL`. The registration is still confirmed by the webhook.                                                                                                                       |
| Nothing arrives after restarting ngrok                                                   | The tunnel URL changed. Update `MERCADO_PAGO_NOTIFICATION_URL` in `.env`, restart the backend, and update the URL in the test seller's Webhooks page.                                                               |
| Backend refuses to start                                                                 | A Mercado Pago variable is missing or invalid. The error names the variable (never its value).                                                                                                                      |
| A change to `.env` has no effect                                                         | Restart the backend; watch mode does not reload environment variables.                                                                                                                                              |

## Going to production

Before switching a deployment to real payments:

- [ ] Use the **organizer's** Mercado Pago account production credentials for
      `MERCADO_PAGO_ACCESS_TOKEN`.
- [ ] Configure Webhooks in **that same account** (production URL, **Pagos**
      event) and use **its** secret as `MERCADO_PAGO_WEBHOOK_SECRET`.
- [ ] Set `MERCADO_PAGO_MODE=production`.
- [ ] Set `PUBLIC_APP_URL` to the public `https` site, and
      `MERCADO_PAGO_NOTIFICATION_URL` to the public `https` webhook URL.
- [ ] Never mix sets: the access token and webhook secret must come from the
      same account, and a deployment holds only one set (sandbox or
      production).
- [ ] Store the values in the deployment's secret store, never in the
      repository.
