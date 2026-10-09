import { keepUnsafeIntegersExact } from './json-reviver';

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
    ['a safe integer', '{"id":183304027058}', { id: 183304027058 }],
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
