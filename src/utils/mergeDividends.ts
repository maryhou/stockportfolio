import type { Stock, DividendTransaction } from '../types';

/**
 * Fold a batch of imported dividends into the stock list in ONE pass.
 *
 * The 自動估算 import adds several records at once. Applying them by calling the
 * single-save handler in a loop was buggy: each call read the same stale
 * `stocks` closure and the resulting setStocks calls clobbered one another, so
 * only the last record survived (a toast still fired per item, so it *looked*
 * like every record saved). Folding everything into one derived array fixes it.
 *
 * Dedupe is by dividend id: an existing id is replaced, a new id is appended.
 */
export function mergeImportedDividends(
  stocks: Stock[],
  items: { stockId: string; dividend: DividendTransaction }[],
): Stock[] {
  if (items.length === 0) return stocks;

  const byStock = new Map<string, DividendTransaction[]>();
  for (const { stockId, dividend } of items) {
    byStock.set(stockId, [...(byStock.get(stockId) ?? []), dividend]);
  }

  return stocks.map((s) => {
    const incoming = byStock.get(s.id);
    if (!incoming) return s;
    const merged = [...(s.dividends ?? [])];
    for (const d of incoming) {
      const idx = merged.findIndex((x) => x.id === d.id);
      if (idx >= 0) merged[idx] = d;
      else merged.push(d);
    }
    return { ...s, dividends: merged };
  });
}
