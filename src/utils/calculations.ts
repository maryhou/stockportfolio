import type { BuyTransaction, SellTransaction, AppSettings } from '../types';

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
  return Math.floor(totalCost / totalShares);
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
  settings?: Pick<AppSettings, 'feeRate' | 'feeDiscount' | 'taxRate'>
): SellTransaction {
  const fee = calcFee(price, shares, settings?.feeRate, settings?.feeDiscount);
  const tax = calcTax(price, shares, settings?.taxRate);
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

/** Format a stock price with exactly 2 decimal places (e.g. 2,310.50). */
export function formatPrice(n: number): string {
  return new Intl.NumberFormat('zh-TW', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
