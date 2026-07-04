import { describe, it, expect } from 'vitest';
import { parseStocksJson } from './validateImport';
import type { Stock } from '../types';

const validStock: Stock = {
  id: 's1',
  name: '台積電',
  symbol: '2330',
  targetPrice: 1200,
  currentPrice: 1050,
  buys: [{ id: 'b1', date: '2026-01-05', price: 1000, shares: 100, fee: 85 }],
  sells: [{
    id: 'x1', date: '2026-03-10', price: 1100, shares: 100,
    fee: 94, tax: 330, profit: 9491, netProceeds: 109576,
  }],
  dividends: [{
    id: 'd1', date: '2026-04-20', exDate: '2026-03-18',
    amountPerShare: 4, shares: 100, grossAmount: 400,
    healthInsuranceFee: 0, transferFee: 10, netAmount: 390,
  }],
};

describe('parseStocksJson', () => {
  it('accepts a full valid export and round-trips it', () => {
    expect(parseStocksJson(JSON.stringify([validStock]))).toEqual([validStock]);
  });

  it('accepts legacy exports without optional fields', () => {
    const legacy = {
      id: 's1', name: '中華電', symbol: '2412',
      targetPrice: 0, currentPrice: 120,
      buys: [{ id: 'b1', date: '2024-01-01', price: 100, shares: 1000, fee: 85 }],
      sells: [],
    };
    expect(parseStocksJson(JSON.stringify([legacy]))).toEqual([legacy]);
  });

  it('accepts an empty array', () => {
    expect(parseStocksJson('[]')).toEqual([]);
  });

  it('strips unknown keys instead of persisting them', () => {
    const dirty = { ...validStock, __proto__hack: 'x', extra: { deep: true } };
    const [result] = parseStocksJson(JSON.stringify([dirty]));
    expect(result).toEqual(validStock);
    expect('extra' in result).toBe(false);
  });

  it.each([
    ['not JSON at all', 'hello'],
    ['non-array root', '{"id":"s1"}'],
    ['non-object element', '[42]'],
    ['missing symbol', JSON.stringify([{ ...validStock, symbol: undefined }])],
    ['numeric field as string', JSON.stringify([{ ...validStock, currentPrice: '1050' }])],
    ['NaN via null price', JSON.stringify([{ ...validStock, targetPrice: null }])],
    ['buys not an array', JSON.stringify([{ ...validStock, buys: {} }])],
    ['bad buy record', JSON.stringify([{ ...validStock, buys: [{ id: 'b1' }] }])],
    ['bad sell record', JSON.stringify([{ ...validStock, sells: [{ ...validStock.sells[0], tax: 'x' }] }])],
    ['bad dividend record', JSON.stringify([{ ...validStock, dividends: [{ id: 'd1' }] }])],
    ['bad optional type', JSON.stringify([{ ...validStock, buys: [{ ...validStock.buys[0], brokerId: 7 }] }])],
  ])('rejects %s', (_label, text) => {
    expect(() => parseStocksJson(text)).toThrow();
  });
});
