/**
 * Fetch real-time prices for Taiwan stocks via Yahoo Finance.
 *
 * Symbols are plain TWSE / OTC codes (e.g. "2330", "2412").
 * Returns a { symbol → NT$ price } map; silently returns {} on any error.
 */
export async function fetchStockPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  // Yahoo Finance: TWSE stocks end in .TW, OTC in .TWO.
  // Try .TW first (covers the vast majority of portfolios).
  const tickers = symbols.map((s) => `${s}.TW`).join(',');
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${tickers}&fields=regularMarketPrice`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);

  const json = (await res.json()) as {
    quoteResponse?: {
      result?: Array<{ symbol: string; regularMarketPrice?: number }>;
    };
  };

  const out: Record<string, number> = {};
  for (const q of json?.quoteResponse?.result ?? []) {
    if (!q.regularMarketPrice) continue;
    // Strip .TW / .TWO suffix to get the plain code
    const code = q.symbol.replace(/\.TWO?$/, '');
    out[code] = q.regularMarketPrice;
  }
  return out;
}
