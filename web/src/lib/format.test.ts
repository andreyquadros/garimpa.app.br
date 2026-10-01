import { describe, it, expect } from 'vitest';
import { parseBrlToCents } from './format';

describe('parseBrlToCents', () => {
  it('aceita vírgula ou ponto como decimal quando há um único separador', () => {
    expect(parseBrlToCents('24,90')).toBe(2490);
    expect(parseBrlToCents('24.90')).toBe(2490);
    expect(parseBrlToCents('24.9')).toBe(2490);
    expect(parseBrlToCents('24')).toBe(2400);
    expect(parseBrlToCents('0,5')).toBe(50);
  });
  it('aceita milhar com ponto e prefixo R$', () => {
    expect(parseBrlToCents('1.249,90')).toBe(124990);
    expect(parseBrlToCents('1.249')).toBe(124900);
    expect(parseBrlToCents('24.999')).toBe(2499900);
    expect(parseBrlToCents('R$ 24,90')).toBe(2490);
    expect(parseBrlToCents(' 24,90 ')).toBe(2490);
  });
  it('rejeita vazio, negativos, letras e formatos ambíguos', () => {
    expect(parseBrlToCents('')).toBeUndefined();
    expect(parseBrlToCents('   ')).toBeUndefined();
    expect(parseBrlToCents('-5')).toBeUndefined();
    expect(parseBrlToCents('abc')).toBeUndefined();
    expect(parseBrlToCents('24.9999')).toBeUndefined();
    expect(parseBrlToCents('24,999')).toBeUndefined();
    expect(parseBrlToCents('1,249.90')).toBeUndefined();
  });
});
