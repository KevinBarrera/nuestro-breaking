import { assertJsonSourceAccess, keepUnsafeIntegersExact } from './json-reviver';

const parse = (text: string): unknown => JSON.parse(text, keepUnsafeIntegersExact);

describe('keepUnsafeIntegersExact', () => {
  it('keeps the exact digits of an integer beyond the safe range as a string', () => {
    expect(parse('{"id":40841700226111564}')).toEqual({ id: '40841700226111564' });
  });

  it('keeps unsafe integers exact at any depth, including negative ones', () => {
    expect(parse('{"data":{"ids":[40841700226111565,-40841700226111565]}}')).toEqual({
      data: { ids: ['40841700226111565', '-40841700226111565'] },
    });
  });

  it.each([
    ['a safe integer', '{"id":123456789012}', { id: 123456789012 }],
    ['the largest safe integer', '{"n":9007199254740991}', { n: 9007199254740991 }],
    ['a float', '{"amount":1500.5}', { amount: 1500.5 }],
    ['a large float', '{"amount":40841700226111564.5}', { amount: Number('40841700226111564.5') }],
    ['an exponent', '{"n":1e21}', { n: 1e21 }],
    ['a string', '{"id":"40841700226111564"}', { id: '40841700226111564' }],
    ['booleans and null', '{"live":true,"ref":null}', { live: true, ref: null }],
  ])('leaves %s unchanged', (_label, text, expected) => {
    expect(parse(text)).toEqual(expected);
  });
});

describe('assertJsonSourceAccess', () => {
  type Reviver = (key: string, value: unknown, context?: { source?: string }) => unknown;
  const parseWithContext =
    (context?: { source?: string }) =>
    (text: string, reviver: Reviver): unknown =>
      reviver('', Number(text), context);

  it('passes on this runtime, which gives revivers the source text', () => {
    expect(() => assertJsonSourceAccess()).not.toThrow();
  });

  it('passes when the reviver context carries the source text', () => {
    expect(() => assertJsonSourceAccess(parseWithContext({ source: '1' }))).not.toThrow();
  });

  it.each([
    ['no context', undefined],
    ['a context without source', {}],
  ])('fails loudly when JSON.parse gives the reviver %s', (_label, context) => {
    expect(() => assertJsonSourceAccess(parseWithContext(context))).toThrow(
      /JSON\.parse reviver source access/,
    );
  });
});
