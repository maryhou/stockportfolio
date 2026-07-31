import { describe, it, expect } from 'vitest';
import { pickPrice, type MisItem } from './fetchPrices';

// Real-world mis.twse rows (2330 at 2026-07-31 10:00, market open) as the
// baseline: `z` (last trade) is "-" mid-session, so the price must come from
// the live bid/ask, NOT from `y` (previous close = 2205).
const bidAsk = {
  b: '2380.0000_2375.0000_2370.0000_2365.0000_2360.0000_',
  a: '2385.0000_2390.0000_2395.0000_2400.0000_2405.0000_',
} satisfies Partial<MisItem>;

describe('pickPrice', () => {
  it('prefers the last-trade price (z) when present', () => {
    expect(pickPrice({ c: '2330', z: '2380.0000', ...bidAsk, y: '2205' })).toBe(2380);
  });

  it('uses bid/ask midpoint when z is "-" (regression: was showing 昨收)', () => {
    // Would previously have returned y=2205; correct live value ≈ 2382.5.
    expect(pickPrice({ c: '2330', z: '-', ...bidAsk, y: '2205' })).toBe(2382.5);
  });

  it('uses the single available side at limit up/down', () => {
    expect(pickPrice({ c: '2330', z: '-', b: '2425.0000_', a: '-', y: '2205' })).toBe(2425);
    expect(pickPrice({ c: '2330', z: '-', b: '-', a: '1985.0000_', y: '2205' })).toBe(1985);
  });

  it('falls back to previous close (y) only when market is closed / no quotes', () => {
    expect(pickPrice({ c: '2330', z: '-', b: '-', a: '-', y: '2205.0000' })).toBe(2205);
    expect(pickPrice({ c: '2330', z: '-', y: '2205.0000' })).toBe(2205);
  });

  it('returns null when nothing usable is present', () => {
    expect(pickPrice({ c: '2330', z: '-', b: '-', a: '-', y: '-' })).toBeNull();
    expect(pickPrice({ c: '2330' })).toBeNull();
  });

  it('ignores zero / non-positive garbage values', () => {
    expect(pickPrice({ c: '2330', z: '0', b: '0_', a: '0_', y: '2205' })).toBe(2205);
  });
});
