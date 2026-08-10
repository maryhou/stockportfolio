/**
 * Look up a Taiwan stock's name by code from the live TWSE feed.
 *
 * The bundled twStocks.json is a static snapshot, so freshly-listed stocks
 * (< ~1 week old, e.g. 009826) are missing from the add-stock search. This
 * asks the live mis feed, which knows the name as soon as the symbol trades.
 *
 * Production → same-origin /api/lookup proxy (mis blocks browser CORS + CSP).
 * Development → direct mis call (works locally; may fail silently under CORS,
 *   in which case the user just types the name manually — same as before).
 *
 * Returns { code, name } on success, or null when unknown / unreachable.
 * Never throws — callers treat null as "no suggestion".
 */
function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

// 與 api/*.ts 的股號 regex 保持一致(見 HANDOFF.md 維護規則)。
const SYMBOL_RE = /^[0-9]{4,6}[A-Z]?[0-9]?$/;

export interface StockLookup { code: string; name: string }

export async function lookupStockName(symbol: string): Promise<StockLookup | null> {
  const sym = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(sym)) return null;

  try {
    // ── Production: same-origin proxy ──────────────────────────────────────────
    if (!import.meta.env.DEV) {
      const res = await fetch(`/api/lookup?symbol=${sym}`, { signal: timeoutSignal(10_000) });
      if (!res.ok) return null;
      const data = await res.json() as { code?: string; name?: string; error?: string };
      if (data.code && data.name) return { code: data.code, name: data.name };
      return null;
    }

    // ── Development: direct mis call ───────────────────────────────────────────
    const exCh = [`tse_${sym}.tw`, `otc_${sym}.tw`].join('|');
    const url = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exCh)}&json=1&delay=0`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', Referer: 'https://mis.twse.com.tw/' },
      signal: timeoutSignal(8_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { msgArray?: { c?: string; n?: string }[] };
    for (const item of json?.msgArray ?? []) {
      if (item.c && item.n) return { code: item.c, name: item.n };
    }
    return null;
  } catch {
    return null;
  }
}
