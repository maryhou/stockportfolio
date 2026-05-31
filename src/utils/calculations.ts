import type { BuyTransaction, SellTransaction } from '../types';

export function calcFee(price: number, shares: number, feeRate = 0.001425, feeDiscount = 0.6): number {
  return Math.floor(price * shares * feeRate * feeDiscount);
}

export function calcTax(price: number, shares: number, taxRate = 0.003): number {
  return Math.ceil(price * shares * taxRate);
}

export function calcAvgCost(buys: BuyTransaction[]): number {
  const totalShares = buys.reduce((s, b) => s + b.shares, 0);
  if (totalShares === 0) return 0;
  const totalCost = buys.reduce((s, b) => s + b.price * b.shares + b.fee, 0);
  return totalCost / totalShares;
}

export function calcRemainingShares(buys: BuyTransaction[], sells: SellTransaction[]): number {
  const bought = buys.reduce((s, b) => s + b.shares, 0);
  const sold = sells.reduce((s, b) => s + b.shares, 0);
  return bought - sold;
}

export function calcTotalInvested(buys: BuyTransaction[]): number {
  return buys.reduce((s, b) => s + b.price * b.shares + b.fee, 0);
}

export function calcTotalRealizedProfit(sells: SellTransaction[]): number {
  return sells.reduce((s, b) => s + b.profit, 0);
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
  const netProceeds = price * shares - fee - tax;
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

/**
 * Taiwan ETF detection.
 * All TWSE/TPEx ETFs have symbols starting with '0' (e.g. 0050, 0056, 006208, 00878).
 * Regular stocks use 4-digit codes not starting with '0' (e.g. 2330, 2454).
 * ETF transaction tax rate = 0.1% vs 0.3% for regular stocks.
 */
export function isETFSymbol(symbol: string): boolean {
  return /^0\d{3,}$/.test(symbol.trim());
}

export const ETF_TAX_RATE = 0.001;   // 0.1%
export const STOCK_TAX_RATE = 0.003; // 0.3%

/** Format a stock price with exactly 2 decimal places (e.g. 2,310.50). */
export function formatPrice(n: number): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
