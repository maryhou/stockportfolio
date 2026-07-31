import { describe, it, expect } from 'vitest';
import { getMarketStatus } from './marketStatus';

// Build a Date for a given Taiwan wall-clock time, expressed as a real UTC
// instant, so the test is independent of the machine's timezone.
// Taiwan is UTC+8, so 09:00 TST = 01:00 UTC.
function twInstant(year: number, month: number, day: number, hh: number, mm: number): Date {
  return new Date(Date.UTC(year, month - 1, day, hh - 8, mm));
}

describe('getMarketStatus', () => {
  // 2026-07-31 is a Friday (weekday).
  it('is open during 09:00–13:30 on a weekday', () => {
    expect(getMarketStatus(twInstant(2026, 7, 31, 9, 0))).toBe('open');
    expect(getMarketStatus(twInstant(2026, 7, 31, 11, 30))).toBe('open');
    expect(getMarketStatus(twInstant(2026, 7, 31, 13, 30))).toBe('open');
  });

  it('is closed before open and after close on a weekday', () => {
    expect(getMarketStatus(twInstant(2026, 7, 31, 8, 59))).toBe('closed');
    expect(getMarketStatus(twInstant(2026, 7, 31, 13, 31))).toBe('closed');
    expect(getMarketStatus(twInstant(2026, 7, 31, 20, 0))).toBe('closed');
  });

  it('is closed all weekend even during trading hours', () => {
    // 2026-08-01 Sat, 2026-08-02 Sun
    expect(getMarketStatus(twInstant(2026, 8, 1, 10, 0))).toBe('closed');
    expect(getMarketStatus(twInstant(2026, 8, 2, 10, 0))).toBe('closed');
  });
});
