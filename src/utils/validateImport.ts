/**
 * Strict validation for portfolio JSON imports (ProfileView 匯入資料).
 *
 * The old check was `Array.isArray(data)` only — any junk objects inside the
 * array would flow into app state and sync to Firestore. This parses and
 * validates every field, and rebuilds each record with only known keys so
 * unknown/extra properties never reach state or the cloud.
 *
 * Optional fields (dividends, brokerId, imported, exDate, healthFeeExempt,
 * transferFeeExempt, dividendAdjustment, note) may be missing — older exports didn't have them.
 */
import type { Stock, BuyTransaction, SellTransaction, DividendTransaction, AppSettings, Broker } from '../types';

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
          healthInsuranceFee, healthFeeExempt, transferFee, transferFeeExempt,
          dividendAdjustment, netAmount, note } = v;
  if (!isStr(id) || !isStr(date) || !isNum(amountPerShare) || !isNum(shares) ||
      !isNum(grossAmount) || !isNum(healthInsuranceFee) || !isNum(transferFee) ||
      !isNum(netAmount)) return null;
  if (exDate !== undefined && !isStr(exDate)) return null;
  if (healthFeeExempt !== undefined && typeof healthFeeExempt !== 'boolean') return null;
  if (transferFeeExempt !== undefined && typeof transferFeeExempt !== 'boolean') return null;
  if (dividendAdjustment !== undefined && !isNum(dividendAdjustment)) return null;
  if (note !== undefined && !isStr(note)) return null;
  return {
    id, date, amountPerShare, shares, grossAmount, healthInsuranceFee, transferFee, netAmount,
    ...(exDate !== undefined ? { exDate } : {}),
    ...(healthFeeExempt !== undefined ? { healthFeeExempt } : {}),
    ...(transferFeeExempt !== undefined ? { transferFeeExempt } : {}),
    ...(dividendAdjustment !== undefined ? { dividendAdjustment } : {}),
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

function parseBroker(v: unknown): Broker | null {
  if (!isObj(v)) return null;
  const { id, name, feeRate, feeDiscount } = v;
  if (!isStr(id) || !isStr(name) || !isNum(feeRate) || !isNum(feeDiscount)) return null;
  return { id, name, feeRate, feeDiscount };
}

function parseSettings(v: unknown): AppSettings | null {
  if (!isObj(v)) return null;
  const { userName, brokers, taxRate, theme, dividendTransferFee } = v;
  if (!isStr(userName) || !isNum(taxRate)) return null;
  const parsedBrokers = parseAll(brokers, parseBroker);
  if (!parsedBrokers || parsedBrokers.length === 0) return null;
  if (theme !== undefined && theme !== 'default' && theme !== 'neutral' && theme !== 'dark') return null;
  if (dividendTransferFee !== undefined && !isNum(dividendTransferFee)) return null;
  return {
    userName, brokers: parsedBrokers, taxRate,
    ...(theme !== undefined ? { theme } : {}),
    ...(dividendTransferFee !== undefined ? { dividendTransferFee } : {}),
  };
}

/** Parse exported portfolio JSON (stocks only). Throws on any malformed record. */
export function parseStocksJson(text: string): Stock[] {
  const data: unknown = JSON.parse(text);
  const stocks = parseAll(data, parseStock);
  if (!stocks) throw new Error('格式錯誤');
  return stocks;
}

export interface PortfolioBackup {
  stocks: Stock[];
  settings?: AppSettings;
}

/**
 * Parse a portfolio backup. Handles both formats:
 *  - legacy: a bare array of stocks (settings not included)
 *  - full backup: `{ version, exportedAt, stocks, settings }`
 * Throws on any malformed record so junk never reaches state / Firestore.
 */
export function parsePortfolioJson(text: string): PortfolioBackup {
  const data: unknown = JSON.parse(text);

  // Legacy format: bare array of stocks
  if (Array.isArray(data)) {
    const stocks = parseAll(data, parseStock);
    if (!stocks) throw new Error('格式錯誤');
    return { stocks };
  }

  // Full-backup format: object with a stocks array (+ optional settings)
  if (isObj(data) && Array.isArray(data.stocks)) {
    const stocks = parseAll(data.stocks, parseStock);
    if (!stocks) throw new Error('格式錯誤');
    if (data.settings === undefined) return { stocks };
    const settings = parseSettings(data.settings);
    if (!settings) throw new Error('設定格式錯誤');
    return { stocks, settings };
  }

  throw new Error('格式錯誤');
}
