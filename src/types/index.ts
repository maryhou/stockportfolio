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

export type ViewName = 'home' | 'activity' | 'holdings' | 'profile' | 'notifications';

export interface AppSettings {
  portfolioName: string;
  brokerName: string;
  feeRate: number;      // decimal, e.g. 0.001425 (= 0.1425%)
  feeDiscount: number;  // decimal, e.g. 0.6 (= 60折)
  taxRate: number;      // decimal, e.g. 0.003 (= 0.3%)
}

export const DEFAULT_SETTINGS: AppSettings = {
  portfolioName: '我的投資組合',
  brokerName: '元大券商',
  feeRate: 0.001425,
  feeDiscount: 0.6,
  taxRate: 0.003,
};

export type NotificationType = 'target' | 'trade' | 'pnl' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string;
  time: string;
  read: boolean;
  actionType?: 'stock' | 'activity';
  actionStockId?: string;
}
