// Fake Mercado Pago settings so every e2e spec can boot `AppModule`, whose payments provider
// validates them at startup (#177 D9). Values already set in the environment win. These are
// obviously fake: no spec may call the real Mercado Pago API.
const FAKE_ENV: Record<string, string> = {
  MERCADO_PAGO_MODE: 'sandbox',
  MERCADO_PAGO_ACCESS_TOKEN: 'TEST-fake-token',
  MERCADO_PAGO_WEBHOOK_SECRET: 'fake-webhook-secret',
  PUBLIC_APP_URL: 'https://example.test',
  MERCADO_PAGO_NOTIFICATION_URL: 'https://api.example.test/public/payments/mercado-pago/webhook',
};

for (const [name, value] of Object.entries(FAKE_ENV)) {
  if (!process.env[name]?.trim()) process.env[name] = value;
}
