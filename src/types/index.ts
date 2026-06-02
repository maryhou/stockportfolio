export interface Broker {
  id: string;
  name: string;
  feeRate: number;      // decimal, e.g. 0.001425 (= 0.1425%)
  feeDiscount: number;  // decimal, e.g. 0.6 (= 60折)
}

export interface BuyTransaction {
  id: string;
  date: string;
  price: number;
  shares: number;
  fee: number;
  brokerId?: string;    // which broker executed this trade
  imported?: boolean;   // true for 匯入初始持倉 (fee already included in price)
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
  brokerId?: string;
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

export type AppTheme = 'default' | 'neutral';

export interface AppSettings {
  userName: string;
  brokers: Broker[];    // replaces old brokerName / feeRate / feeDiscount
  taxRate: number;      // universal across brokers, e.g. 0.003 (= 0.3%)
  theme?: AppTheme;
}

export const DEFAULT_BROKER: Broker = {
  id: 'default',
  name: '元大券商',
  feeRate: 0.001425,
  feeDiscount: 0.6,
};

export const DEFAULT_SETTINGS: AppSettings = {
  userName: 'Mary',
  brokers: [DEFAULT_BROKER],
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
