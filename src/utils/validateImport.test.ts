import { describe, it, expect } from 'vitest';
import { parseStocksJson, parsePortfolioJson } from './validateImport';
import type { Stock, AppSettings } from '../types';

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

  it('round-trips a fee-exempt dividend', () => {
    const exempt = {
      ...validStock,
      dividends: [{ ...validStock.dividends![0], healthFeeExempt: true, transferFeeExempt: true }],
    };
    expect(parseStocksJson(JSON.stringify([exempt]))).toEqual([exempt]);
  });

  it('round-trips a dividend with a signed dividendAdjustment', () => {
    const adjusted = {
      ...validStock,
      dividends: [{ ...validStock.dividends![0], dividendAdjustment: -1 }],
    };
    expect(parseStocksJson(JSON.stringify([adjusted]))).toEqual([adjusted]);
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
    ['non-boolean healthFeeExempt', JSON.stringify([{ ...validStock, dividends: [{ ...validStock.dividends![0], healthFeeExempt: 'yes' }] }])],
    ['non-boolean transferFeeExempt', JSON.stringify([{ ...validStock, dividends: [{ ...validStock.dividends![0], transferFeeExempt: 1 }] }])],
    ['non-number dividendAdjustment', JSON.stringify([{ ...validStock, dividends: [{ ...validStock.dividends![0], dividendAdjustment: '-1' }] }])],
  ])('rejects %s', (_label, text) => {
    expect(() => parseStocksJson(text)).toThrow();
  });
});

const validSettings: AppSettings = {
  userName: 'Mary',
  brokers: [{ id: 'default', name: '元大券商', feeRate: 0.001425, feeDiscount: 0.6 }],
  taxRate: 0.003,
  theme: 'default',
  fontScale: 'large',
  dividendTransferFee: 10,
};

describe('parsePortfolioJson', () => {
  it('reads the full-backup format (stocks + settings)', () => {
    const backup = { version: 1, exportedAt: '2026-07-30T00:00:00.000Z', stocks: [validStock], settings: validSettings };
    expect(parsePortfolioJson(JSON.stringify(backup))).toEqual({ stocks: [validStock], settings: validSettings });
  });

  it('accepts a full backup with settings omitting optional fields', () => {
    const minimal = { userName: 'A', brokers: validSettings.brokers, taxRate: 0.003 };
    const backup = { stocks: [validStock], settings: minimal };
    expect(parsePortfolioJson(JSON.stringify(backup))).toEqual({ stocks: [validStock], settings: minimal });
  });

  it('falls back to stocks-only when settings is absent from the object form', () => {
    expect(parsePortfolioJson(JSON.stringify({ stocks: [validStock] }))).toEqual({ stocks: [validStock] });
  });

  it('still reads legacy bare-array exports (stocks only, no settings)', () => {
    expect(parsePortfolioJson(JSON.stringify([validStock]))).toEqual({ stocks: [validStock] });
  });

  it('strips unknown keys from imported settings', () => {
    const backup = { stocks: [], settings: { ...validSettings, hacked: true } };
    const result = parsePortfolioJson(JSON.stringify(backup));
    expect(result.settings && 'hacked' in result.settings).toBe(false);
  });

  it.each([
    ['bad stocks in object form', JSON.stringify({ stocks: [{ id: 's1' }] })],
    ['settings not an object', JSON.stringify({ stocks: [], settings: 42 })],
    ['settings missing brokers', JSON.stringify({ stocks: [], settings: { userName: 'A', taxRate: 0.003 } })],
    ['settings empty brokers', JSON.stringify({ stocks: [], settings: { userName: 'A', brokers: [], taxRate: 0.003 } })],
    ['bad broker record', JSON.stringify({ stocks: [], settings: { userName: 'A', brokers: [{ id: 'x' }], taxRate: 0.003 } })],
    ['invalid theme', JSON.stringify({ stocks: [], settings: { ...validSettings, theme: 'blue' } })],
    ['invalid fontScale', JSON.stringify({ stocks: [], settings: { ...validSettings, fontScale: 'huge' } })],
    ['taxRate as string', JSON.stringify({ stocks: [], settings: { ...validSettings, taxRate: '0.003' } })],
    ['neither array nor stocks object', JSON.stringify({ foo: 1 })],
  ])('rejects %s', (_label, text) => {
    expect(() => parsePortfolioJson(text)).toThrow();
  });
});
