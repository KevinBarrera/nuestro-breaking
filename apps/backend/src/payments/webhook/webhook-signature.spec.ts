import { createHmac } from 'node:crypto';
import { verifyWebhookSignature } from './webhook-signature';

const SECRET = 'fake-webhook-secret';
const TS = '1704908010000';
const REQUEST_ID = 'req-fake-1';
const DATA_ID = '1234567890';

function sign(manifest: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

const manifestOf = (dataId: string, requestId = REQUEST_ID, ts = TS) =>
  `id:${dataId};request-id:${requestId};ts:${ts};`;
const VALID_V1 = sign(manifestOf(DATA_ID));

const verify = (overrides: Partial<Parameters<typeof verifyWebhookSignature>[0]> = {}) =>
  verifyWebhookSignature({
    signatureHeader: `ts=${TS},v1=${VALID_V1}`,
    requestId: REQUEST_ID,
    dataId: DATA_ID,
    secret: SECRET,
    ...overrides,
  });

describe('verifyWebhookSignature', () => {
  it('accepts a valid signature', () => {
    expect(verify()).toBe(true);
  });

  it('tolerates spaces and any part order in the header', () => {
    expect(verify({ signatureHeader: ` v1=${VALID_V1} , ts=${TS} ` })).toBe(true);
  });

  it('rejects a signature made with another secret', () => {
    const forged = sign(manifestOf(DATA_ID), 'another-fake-secret');
    expect(verify({ signatureHeader: `ts=${TS},v1=${forged}` })).toBe(false);
  });

  it('rejects a tampered data id', () => {
    expect(verify({ dataId: '1234567891' })).toBe(false);
  });

  it('rejects a tampered timestamp', () => {
    expect(verify({ signatureHeader: `ts=1704908010001,v1=${VALID_V1}` })).toBe(false);
  });

  it('rejects a tampered request id', () => {
    expect(verify({ requestId: 'req-fake-2' })).toBe(false);
  });

  it.each([undefined, ''])('rejects a missing header (%p)', (signatureHeader) => {
    expect(verify({ signatureHeader })).toBe(false);
  });

  it.each([
    'garbage',
    `ts=${TS}`,
    `v1=${VALID_V1}`,
    `ts=,v1=${VALID_V1}`,
    `ts=${TS},v1=`,
    `ts=${TS},v1=not-hex-zz`,
    `ts=${TS},v1=${VALID_V1},ts=${TS}x`,
  ])('rejects a malformed header %p without throwing', (signatureHeader) => {
    expect(() => verify({ signatureHeader })).not.toThrow();
    expect(verify({ signatureHeader })).toBe(false);
  });

  it('leaves the request-id part out of the manifest when there is no request id', () => {
    const v1 = sign(`id:${DATA_ID};ts:${TS};`);
    expect(verify({ requestId: undefined, signatureHeader: `ts=${TS},v1=${v1}` })).toBe(true);
  });

  it('leaves the id part out of the manifest when there is no data id', () => {
    const v1 = sign(`request-id:${REQUEST_ID};ts:${TS};`);
    expect(verify({ dataId: undefined, signatureHeader: `ts=${TS},v1=${v1}` })).toBe(true);
  });

  it('lowercases an alphanumeric data id before signing', () => {
    const v1 = sign(manifestOf('abc123def'));
    expect(verify({ dataId: 'ABC123DEF', signatureHeader: `ts=${TS},v1=${v1}` })).toBe(true);
  });

  it('rejects a v1 value of a different length without throwing', () => {
    for (const v1 of [VALID_V1.slice(0, 10), `${VALID_V1}00`]) {
      expect(() => verify({ signatureHeader: `ts=${TS},v1=${v1}` })).not.toThrow();
      expect(verify({ signatureHeader: `ts=${TS},v1=${v1}` })).toBe(false);
    }
  });

  it('rejects everything when the secret is empty', () => {
    const v1 = sign(manifestOf(DATA_ID), '');
    expect(verify({ secret: '', signatureHeader: `ts=${TS},v1=${v1}` })).toBe(false);
  });
});
