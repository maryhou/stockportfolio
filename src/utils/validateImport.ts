/**
 * Strict validation for portfolio JSON imports (ProfileView 匯入資料).
 *
 * The old check was `Array.isArray(data)` only — any junk objects inside the
 * array would flow into app state and sync to Firestore. This parses and
 * validates every field, and rebuilds each record with only known keys so
 * unknown/extra properties never reach state or the cloud.
 *
 * Optional fields (dividends, brokerId, imported, exDate, note) may be
 * missing — older exports didn't have them.
 */
import type { Stock, BuyTransaction, SellTransaction, DividendTransaction } from '../types';

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseBuy(v: unknown): BuyTransaction | null {
  if (!isObj(v)) return null;
  const { id, date, price, shares, fee, brokerId, imported } = v;
  if (!isStr(id) || !isStr(date) || !isNum(price) || !isNum(shares) || !isNum(fee)) return null;
  if (brokerId !== undefined && !isStr(brokerId)) return null;
  if (imported !== undefined && typeof imported !== 'boolean') return null;
  return {
    id, date, price, shares, fee,
    ...(brokerId !== undefined ? { brokerId } : {}),
    ...(imported !== undefined ? { imported } : {}),
  };
}

function parseSell(v: unknown): SellTransaction | null {
  if (!isObj(v)) return null;
  const { id, date, price, shares, fee, tax, profit, netProceeds, brokerId } = v;
  if (!isStr(id) || !isStr(date) || !isNum(price) || !isNum(shares) || !isNum(fee) ||
      !isNum(tax) || !isNum(profit) || !isNum(netProceeds)) return null;
  if (brokerId !== undefined && !isStr(brokerId)) return null;
  return {
    id, date, price, shares, fee, tax, profit, netProceeds,
    ...(brokerId !== undefined ? { brokerId } : {}),
  };
}

function parseDividend(v: unknown): DividendTransaction | null {
  if (!isObj(v)) return null;
  const { id, date, exDate, amountPerShare, shares, grossAmount,
          healthInsuranceFee, transferFee, netAmount, note } = v;
  if (!isStr(id) || !isStr(date) || !isNum(amountPerShare) || !isNum(shares) ||
      !isNum(grossAmount) || !isNum(healthInsuranceFee) || !isNum(transferFee) ||
      !isNum(netAmount)) return null;
  if (exDate !== undefined && !isStr(exDate)) return null;
  if (note !== undefined && !isStr(note)) return null;
  return {
    id, date, amountPerShare, shares, grossAmount, healthInsuranceFee, transferFee, netAmount,
    ...(exDate !== undefined ? { exDate } : {}),
    ...(note !== undefined ? { note } : {}),
  };
}

function parseAll<T>(v: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseStock(v: unknown): Stock | null {
  if (!isObj(v)) return null;
  const { id, name, symbol, targetPrice, currentPrice, buys, sells, dividends } = v;
  if (!isStr(id) || !isStr(name) || !isStr(symbol) ||
      !isNum(targetPrice) || !isNum(currentPrice)) return null;
  const parsedBuys = parseAll(buys, parseBuy);
  const parsedSells = parseAll(sells, parseSell);
  if (!parsedBuys || !parsedSells) return null;
  const parsedDividends = dividends === undefined ? undefined : parseAll(dividends, parseDividend);
  if (parsedDividends === null) return null;
  return {
    id, name, symbol, targetPrice, currentPrice,
    buys: parsedBuys, sells: parsedSells,
    ...(parsedDividends !== undefined ? { dividends: parsedDividends } : {}),
  };
}

/** Parse exported portfolio JSON. Throws on any malformed record. */
export function parseStocksJson(text: string): Stock[] {
  const data: unknown = JSON.parse(text);
  const stocks = parseAll(data, parseStock);
  if (!stocks) throw new Error('格式錯誤');
  return stocks;
}
