export interface BuyTransaction {
  id: string;
  date: string;
  price: number;
  shares: number;
  fee: number;
}

export interface SellTransaction {
  id: string;
  date: string;
  price: number;
  shares: number;
  fee: number;
  tax: number;
  profit: number;
  netProceeds: number;
}

export interface Stock {
  id: string;
  name: string;
  symbol: string;
  targetPrice: number;
  currentPrice: number;
  buys: BuyTransaction[];
  sells: SellTransaction[];
}

export type ViewName = 'home' | 'activity' | 'holdings' | 'profile';
