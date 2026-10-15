import { createHmac, timingSafeEqual } from 'node:crypto';

export interface WebhookSignatureInput {
  /** Raw `x-signature` header: `ts=<ms>,v1=<hex>`, parts in any order. */
  signatureHeader: string | undefined;
  /** Raw `x-request-id` header. */
  requestId: string | undefined;
  /** The notified `data.id` (from the query string). */
  dataId: string | undefined;
  secret: string;
}

const HEX = /^[0-9a-f]+$/i;

/**
 * Checks a Mercado Pago webhook `x-signature` (#177 D11): HMAC-SHA256 over the manifest
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (missing parts left out), compared in
 * constant time. Returns false, never throws, on any missing or malformed input.
 */
export function verifyWebhookSignature(input: WebhookSignatureInput): boolean {
  if (!input.secret) return false;
  const parts = parseSignatureHeader(input.signatureHeader);
  if (!parts) return false;
  let manifest = '';
  if (input.dataId) manifest += `id:${input.dataId.toLowerCase()};`;
  if (input.requestId) manifest += `request-id:${input.requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = createHmac('sha256', input.secret).update(manifest).digest();
  const received = Buffer.from(parts.v1, 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function parseSignatureHeader(header: string | undefined): { ts: string; v1: string } | null {
  if (!header) return null;
  const values = new Map<string, string>();
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) return null;
    const key = part.slice(0, separator).trim();
    if (values.has(key)) return null;
    values.set(key, part.slice(separator + 1).trim());
  }
  const ts = values.get('ts');
  const v1 = values.get('v1');
  if (!ts || !v1 || !HEX.test(v1) || v1.length % 2 !== 0) return null;
  return { ts, v1 };
}
