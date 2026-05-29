/**
 * Fetch real-time prices for Taiwan stocks.
 *
 * Production  → calls our own Vercel Edge proxy (/api/prices) which talks to
 *               Yahoo Finance server-side, bypassing mobile CORS restrictions.
 * Development → calls Yahoo Finance directly (works from localhost in most
 *               browsers; CORS failures are non-fatal in the dev poller).
 *
 * Symbols are plain TWSE / OTC codes (e.g. "2330", "2412").
 * Returns a { symbol → NT$ price } map.
 * Throws on network / API error so callers can surface the failure.
 */
export async function fetchStockPrices(
  symbols: string[],
): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};

  // ── Production: use server-side proxy (no CORS issues) ──────────────────────
  if (!import.meta.env.DEV) {
    const res = await fetch(
      `/api/prices?symbols=${symbols.join(',')}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) throw new Error(`Price proxy ${res.status}`);
    const data = await res.json() as Record<string, number> & { error?: string };
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── Development: direct Yahoo Finance call ───────────────────────────────────
  const tickers = symbols.map((s) => `${s}.TW`).join(',');
  const url = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${tickers}&fields=regularMarketPrice`;

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
    const code = q.symbol.replace(/\.TWO?$/, '');
    out[code] = q.regularMarketPrice;
  }
  return out;
}
