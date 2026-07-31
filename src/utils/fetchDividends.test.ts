import { describe, it, expect } from 'vitest';
import { parseEtfDivRows } from './fetchDividends';

// Fixed "now" so year-window filtering is deterministic.
const NOW = new Date('2026-07-31T00:00:00Z');

// row = [代號, 簡稱, 除息交易日, 基準日, 收益分配發放日, 金額, …]
const row = (ex: string, pay: string, amt: string): string[] =>
  ['006208', '富邦台50', ex, '', pay, amt];

describe('parseEtfDivRows', () => {
  it('parses a normal announced dividend (ROC dates → ISO)', () => {
    const out = parseEtfDivRows([row('115年07月16日', '115年08月20日', '4.75')], NOW);
    expect(out).toEqual([{ date: '2026-07-16', payDate: '2026-08-20', cashPerShare: 4.75 }]);
  });

  it('keeps an announced ex-date whose amount is not yet published as cashPerShare=null (regression)', () => {
    // Empty amount and "0" amount both mean 尚未公告 — the row must survive, not be dropped.
    const out = parseEtfDivRows([
      row('115年07月16日', '115年08月20日', ''),
      row('115年04月23日', '115年05月20日', '0'),
    ], NOW);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.cashPerShare === null)).toBe(true);
    expect(out[0].date).toBe('2026-07-16');
  });

  it('drops rows with dirty out-of-range years (「106年」/「-1893年」)', () => {
    const out = parseEtfDivRows([
      row('106年07月16日', '106年08月20日', '2.1'),   // 2017 — too old
      row('-1893年07月16日', '', '2.1'),               // garbage
      row('115年07月16日', '115年08月20日', '4.75'),   // 2026 — valid
    ], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-07-16');
  });

  it('sorts newest-first and caps at 10', () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      row(`115年${String((i % 12) + 1).padStart(2, '0')}月05日`, '', '1.0'));
    const out = parseEtfDivRows(rows, NOW);
    expect(out).toHaveLength(10);
    expect(out[0].date > out[1].date).toBe(true);
  });
});
