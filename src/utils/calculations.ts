import type { BuyTransaction, SellTransaction } from '../types';

// Taiwan brokerage: 0.1425% with 60% discount applied
const FEE_RATE = 0.001425 * 0.6;
// Taiwan securities transaction tax: 0.3% on sell amount
const TAX_RATE = 0.003;

export function calcFee(price: number, shares: number): number {
  return Math.floor(price * shares * FEE_RATE);
}

export function calcTax(price: number, shares: number): number {
  return Math.ceil(price * shares * TAX_RATE);
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
  avgCost: number
): SellTransaction {
  const fee = calcFee(price, shares);
  const tax = calcTax(price, shares);
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
