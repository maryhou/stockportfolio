import type { BuyTransaction, SellTransaction, DividendTransaction } from '../types';

// How many shares the user held on a specific date (YYYY-MM-DD)
export function calcSharesHeldAtDate(
  buys: BuyTransaction[],
  sells: SellTransaction[],
  date: string,
): number {
  const bought = buys.filter((b) => b.date <= date).reduce((s, b) => s + b.shares, 0);
  const sold   = sells.filter((sv) => sv.date <= date).reduce((s, sv) => s + sv.shares, 0);
  return Math.max(0, bought - sold);
}

// ── Dividend constants ──────────────────────────────────────────────────────
export const HEALTH_INSURANCE_RATE      = 0.0211;
export const HEALTH_INSURANCE_THRESHOLD = 20_000;

export function calcDividendHealthInsurance(gross: number): number {
  if (gross < HEALTH_INSURANCE_THRESHOLD) return 0;
  return Math.floor(gross * HEALTH_INSURANCE_RATE);
}

export function calcDividendGross(amountPerShare: number, shares: number): number {
  return Math.round(amountPerShare * shares);
}

// adjustment 為帶正負號的配息調整（元）：ETF 實際發放是各所得類別分別四捨五入後加總，
// 與「每股×股數」估算常差 ±1 元。使用者從收益分配通知書填入差額，讓實際入帳一致。
export function calcDividendNet(
  gross: number,
  healthFee: number,
  transferFee: number,
  adjustment = 0,
): number {
  return Math.max(0, gross - healthFee - transferFee + adjustment);
}

export function calcTotalDividendNet(dividends: DividendTransaction[]): number {
  return dividends.reduce((s, d) => s + d.netAmount, 0);
}

// 統計歸屬日：以除息日為準，舊資料沒有除息日則用發放日
export function dividendStatDate(d: DividendTransaction): string {
  return d.exDate ?? d.date;
}

// Dividends in a given year (YYYY string)
export function calcYearDividends(dividends: DividendTransaction[], year: string): number {
  return dividends
    .filter((d) => dividendStatDate(d).startsWith(year))
    .reduce((s, d) => s + d.netAmount, 0);
}

// Dividends in a given month (YYYY-MM string)
export function calcMonthDividends(dividends: DividendTransaction[], yearMonth: string): number {
  return dividends
    .filter((d) => dividendStatDate(d).startsWith(yearMonth))
    .reduce((s, d) => s + d.netAmount, 0);
}

// Monthly totals for a given year → array[0..11]
export function calcMonthlyDividends(dividends: DividendTransaction[], year: string): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = `${year}-${String(i + 1).padStart(2, '0')}`;
    return calcMonthDividends(dividends, ym);
  });
}

// Annualised yield: (sum of past-12-month net dividends / total invested) × 100
export function calcDividendYield(
  dividends: DividendTransaction[],
  totalInvested: number,
): number {
  if (totalInvested <= 0 || dividends.length === 0) return 0;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const past12m = dividends
    .filter((d) => dividendStatDate(d) >= cutoffStr)
    .reduce((s, d) => s + d.netAmount, 0);
  return (past12m / totalInvested) * 100;
}

export function calcFee(price: number, shares: number, feeRate = 0.001425, feeDiscount = 0.6): number {
  return Math.floor(price * shares * feeRate * feeDiscount);
}

export function calcTax(price: number, shares: number, taxRate = 0.003): number {
  return Math.ceil(price * shares * taxRate);
}

export function calcAvgCost(buys: BuyTransaction[]): number {
  const totalShares = buys.reduce((s, b) => s + b.shares, 0);
  if (totalShares === 0) return 0;
  const totalCost = buys.reduce((s, b) => s + Math.floor(b.price * b.shares) + b.fee, 0);
  return totalCost / totalShares;
}

export function calcRemainingShares(buys: BuyTransaction[], sells: SellTransaction[]): number {
  const bought = buys.reduce((s, b) => s + b.shares, 0);
  const sold = sells.reduce((s, b) => s + b.shares, 0);
  return bought - sold;
}

export function calcTotalInvested(buys: BuyTransaction[]): number {
  return buys.reduce((s, b) => s + Math.floor(b.price * b.shares) + b.fee, 0);
}

export function calcTotalRealizedProfit(sells: SellTransaction[]): number {
  return sells.reduce((s, b) => s + b.profit, 0);
}

/**
 * Exact realized profit using integer math.
 * For fully closed positions: netProceeds - totalInvested (no float rounding).
 * For partially closed positions: falls back to sum of stored profits (proportional).
 */
export function calcExactRealizedProfit(buys: BuyTransaction[], sells: SellTransaction[]): number {
  const remaining = calcRemainingShares(buys, sells);
  if (remaining === 0 && buys.length > 0) {
    return calcTotalNetProceeds(sells) - calcTotalInvested(buys);
  }
  return calcTotalRealizedProfit(sells);
}

export function calcTotalNetProceeds(sells: SellTransaction[]): number {
  return sells.reduce((s, b) => s + b.netProceeds, 0);
}

export function buildSellTransaction(
  id: string,
  date: string,
  price: number,
  shares: number,
  avgCost: number,
  rates?: { feeRate?: number; feeDiscount?: number; taxRate?: number }
): SellTransaction {
  const fee = calcFee(price, shares, rates?.feeRate, rates?.feeDiscount);
  const tax = calcTax(price, shares, rates?.taxRate);
  const netProceeds = Math.floor(price * shares) - fee - tax;
  const profit = netProceeds - avgCost * shares;
  return { id, date, price, shares, fee, tax, profit, netProceeds };
}

export function formatNTD(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('zh-TW').format(n);
}

// 與 formatNTD 相同的整數化千分位,但不帶貨幣符號($)。
// 用於首頁 Hero 三欄金額(金額本身已很長,省去 $ 讓視覺更乾淨、更好支援字體放大)。
export function formatAmount(amount: number): string {
  return new Intl.NumberFormat('zh-TW', {
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Signed NTD, e.g. +NT$2 / -NT$1（0 也顯示 +）。用於配息調整這類帶正負的金額。 */
export function formatSignedNTD(amount: number): string {
  return `${amount < 0 ? '-' : '+'}${formatNTD(Math.abs(amount))}`;
}

/**
 * Taiwan ETF detection.
 * All TWSE/TPEx ETFs have symbols starting with '0' followed by at least 3 digits,
 * optionally ending with a letter (e.g. 0050, 006208, 00631L, 00632R).
 * Regular stocks use 4-digit codes not starting with '0' (e.g. 2330, 2454).
 * ETF transaction tax rate = 0.1% vs 0.3% for regular stocks.
 */
export function isETFSymbol(symbol: string): boolean {
  return /^0\d{3,}[A-Za-z]?$/.test(symbol.trim());
}

/** Bond ETFs end with 'B' (e.g. 00679B, 00680B). Sell transaction tax = 0. */
export function isBondETFSymbol(symbol: string): boolean {
  return /^0\d{3,}[Bb]$/.test(symbol.trim());
}

export const BOND_ETF_TAX_RATE = 0;    // 0%
export const ETF_TAX_RATE = 0.001;     // 0.1%
export const STOCK_TAX_RATE = 0.003;   // 0.3%

/** Format a stock price with exactly 2 decimal places (e.g. 2,310.50). */
export function formatPrice(n: number): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
