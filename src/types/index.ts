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

export interface DividendTransaction {
  id: string;
  date: string;             // 實際發放日 YYYY-MM-DD（未到此日 = 即將配息）
  exDate?: string;          // 除息日 YYYY-MM-DD（月度統計歸屬以此為準；舊資料可能缺、退回用發放日）
  amountPerShare: number;   // 每股股息 (元)
  shares: number;           // 持有股數
  grossAmount: number;      // 應得股息 = amountPerShare × shares
  healthInsuranceFee: number; // 健保補充費 (2.11% if gross >= 20,000)
  healthFeeExempt?: boolean;  // true = 使用者設定此筆免扣健保補充費（如資本利得配息）
  transferFee: number;       // 匯款手續費
  transferFeeExempt?: boolean; // true = 使用者設定此筆免扣匯款手續費（如入帳銀行為該檔保管銀行）
  netAmount: number;         // 實際入帳
  note?: string;
}

export interface Stock {
  id: string;
  name: string;
  symbol: string;
  targetPrice: number;
  currentPrice: number;
  buys: BuyTransaction[];
  sells: SellTransaction[];
  dividends?: DividendTransaction[];
}

export type ViewName = 'home' | 'activity' | 'holdings' | 'profile' | 'notifications' | 'dividends';

export type AppTheme = 'default' | 'neutral' | 'dark';

export interface AppSettings {
  userName: string;
  brokers: Broker[];    // replaces old brokerName / feeRate / feeDiscount
  taxRate: number;      // universal across brokers, e.g. 0.003 (= 0.3%)
  theme?: AppTheme;
  dividendTransferFee?: number; // 匯款手續費預設值，default 10
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
