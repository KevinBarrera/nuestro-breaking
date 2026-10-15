/** Source text access passed to a `JSON.parse` reviver for primitive values (Node 21+). */
interface ReviverContext {
  source?: string;
}

const INTEGER_SOURCE = /^-?\d+$/;

/**
 * `JSON.parse` reviver that keeps any integer beyond `Number.MAX_SAFE_INTEGER` as its exact source
 * digits, in a string. Mercado Pago notification ids (#177 D12) exceed that range, and the default
 * parse rounds them, so two distinct notifications could share one idempotency key. Everything
 * else, floats included, is returned unchanged.
 */
export function keepUnsafeIntegersExact(
  _key: string,
  value: unknown,
  context?: ReviverContext,
): unknown {
  if (typeof value !== 'number' || Number.isSafeInteger(value)) return value;
  const source = context?.source;
  return source !== undefined && INTEGER_SOURCE.test(source) ? source : value;
}

type JsonParse = (
  text: string,
  reviver: (key: string, value: unknown, context?: ReviverContext) => unknown,
) => unknown;

/**
 * Throws at startup when `JSON.parse` gives revivers no source text (Node before 21), because
 * `keepUnsafeIntegersExact` would then silently round large notification ids again.
 */
export function assertJsonSourceAccess(parse: JsonParse = JSON.parse as JsonParse): void {
  let source: string | undefined;
  parse('1', (_key, value, context) => {
    source = context?.source;
    return value;
  });
  if (source !== '1') {
    throw new Error(
      'JSON.parse reviver source access is unavailable on this runtime; Node 21 or later is ' +
        'required to keep large Mercado Pago notification ids exact.',
    );
  }
}
