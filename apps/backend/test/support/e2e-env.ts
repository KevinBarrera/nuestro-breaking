// Fake Mercado Pago and email settings so every e2e spec can boot `AppModule`, whose payments
// and notifications providers validate them at startup (#177 D9, #179). These are obviously fake:
// no spec may call the real Mercado Pago or Brevo API.
const FAKE_ENV: Record<string, string> = {
  MERCADO_PAGO_MODE: 'sandbox',
  MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fake-token',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fake-webhook-secret',
  PUBLIC_APP_URL: 'https://example.test',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://api.example.test/public/payments/mercado-pago/webhook',
  EMAIL_SENDER_ADDRESS: 'boletos@example.test',
  EMAIL_SENDER_NAME: 'Los más pesados (e2e)',
};

// Always overwritten, even when the shell exports real values: e2e must never deliver real email,
// and the periodic sweep stays off so specs drive dispatch themselves.
const FORCED_ENV: Record<string, string> = {
  BREVO_API_KEY: 'xkeysib-fake-key',
  EMAIL_SANDBOX: 'true',
  EMAIL_DISPATCH_INTERVAL_MS: '0',
};

for (const [name, value] of Object.entries(FAKE_ENV)) {
  if (!process.env[name]?.trim()) process.env[name] = value;
}
Object.assign(process.env, FORCED_ENV);
