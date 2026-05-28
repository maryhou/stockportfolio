import type { Stock } from '../types';

export const INITIAL_STOCKS: Stock[] = [
  {
    id: '2330',
    name: '台積電',
    symbol: '2330',
    targetPrice: 2300,
    currentPrice: 2310,
    buys: [
      { id: 'b1', date: '2025-04-17', price: 2255, shares: 10, fee: 19 },
      { id: 'b2', date: '2025-04-22', price: 2180, shares: 10, fee: 18 },
      { id: 'b3', date: '2025-04-27', price: 2315, shares: 50, fee: 98 },
    ],
    sells: [
      { id: 's1', date: '2025-05-25', price: 2305, shares: 40, fee: 79,  tax: 277, profit: 284,  netProceeds: 91844 },
      { id: 's2', date: '2025-05-26', price: 2310, shares: 30, fee: 59,  tax: 208, profit: 363,  netProceeds: 69033 },
    ],
  },
];
