/**
 * TWSE / TPEx regular trading session: Mon–Fri 09:00–13:30 Taiwan time
 * (UTC+8, no DST). Used only as a data-freshness hint next to prices:
 *   open   → figures are live (real-time trade or bid/ask midpoint)
 *   closed → figures are the latest closing price
 *
 * Caveat: national holidays / typhoon days are NOT handled — on those the badge
 * can read 盤中 even though the exchange is shut (prices simply won't move, so
 * the figures are still the last close). Good enough for a hint; wire in a
 * holiday calendar if this ever needs to be exact.
 */
export type MarketStatus = 'open' | 'closed';

const OPEN_MIN = 9 * 60;         // 09:00
const CLOSE_MIN = 13 * 60 + 30;  // 13:30

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  // Shift any device timezone to Taiwan time (UTC+8) before reading the clock.
  const tw = new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60_000);
  const day = tw.getDay(); // 0 Sun … 6 Sat
  if (day === 0 || day === 6) return 'closed';
  const mins = tw.getHours() * 60 + tw.getMinutes();
  return mins >= OPEN_MIN && mins <= CLOSE_MIN ? 'open' : 'closed';
}
