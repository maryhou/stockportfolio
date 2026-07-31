import { describe, it, expect } from 'vitest';
import { mergeImportedDividends } from './mergeDividends';
import type { Stock, DividendTransaction } from '../types';

function stock(id: string, dividends?: DividendTransaction[]): Stock {
  return { id, name: id, symbol: id, targetPrice: 0, currentPrice: 0, buys: [], sells: [], dividends };
}

function div(id: string, net: number): DividendTransaction {
  return {
    id, date: '2026-07-16', amountPerShare: 1, shares: net, grossAmount: net,
    healthInsuranceFee: 0, transferFee: 0, netAmount: net,
  };
}

describe('mergeImportedDividends', () => {
  it('adds records to THREE different stocks in one pass (regression: only 1 survived)', () => {
    const stocks = [stock('0056'), stock('006208'), stock('00919')];
    const items = [
      { stockId: '0056',   dividend: div('d-0056', 6) },
      { stockId: '006208', dividend: div('d-006208', 465) },
      { stockId: '00919',  dividend: div('d-00919', 990) },
    ];
    const result = mergeImportedDividends(stocks, items);
    expect(result.find((s) => s.id === '0056')!.dividends).toHaveLength(1);
    expect(result.find((s) => s.id === '006208')!.dividends).toHaveLength(1);
    expect(result.find((s) => s.id === '00919')!.dividends).toHaveLength(1);
    // Every imported record is present — not just the last one.
    const allIds = result.flatMap((s) => (s.dividends ?? []).map((d) => d.id));
    expect(allIds.sort()).toEqual(['d-0056', 'd-006208', 'd-00919']);
  });

  it('appends to a stock that already has dividends (keeps the old one)', () => {
    const stocks = [stock('00919', [div('existing', 100)])];
    const result = mergeImportedDividends(stocks, [{ stockId: '00919', dividend: div('new', 990) }]);
    expect(result[0].dividends!.map((d) => d.id)).toEqual(['existing', 'new']);
  });

  it('adds multiple records to the SAME stock', () => {
    const stocks = [stock('0056')];
    const result = mergeImportedDividends(stocks, [
      { stockId: '0056', dividend: div('a', 6) },
      { stockId: '0056', dividend: div('b', 7) },
    ]);
    expect(result[0].dividends!.map((d) => d.id)).toEqual(['a', 'b']);
  });

  it('replaces an existing record with the same id instead of duplicating', () => {
    const stocks = [stock('0056', [div('dup', 6)])];
    const result = mergeImportedDividends(stocks, [{ stockId: '0056', dividend: div('dup', 999) }]);
    expect(result[0].dividends).toHaveLength(1);
    expect(result[0].dividends![0].netAmount).toBe(999);
  });

  it('leaves stocks untouched when there are no items, and ignores unknown stockIds', () => {
    const stocks = [stock('0056')];
    expect(mergeImportedDividends(stocks, [])).toBe(stocks);
    const result = mergeImportedDividends(stocks, [{ stockId: 'ZZZZ', dividend: div('x', 1) }]);
    expect(result[0].dividends).toBeUndefined();
  });
});
