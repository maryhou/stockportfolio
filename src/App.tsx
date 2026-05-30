import { useState, useCallback, useRef, useEffect } from 'react';
import { useStockPoller } from './hooks/useStockPoller';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import type { Stock, ViewName, BuyTransaction, SellTransaction, AppNotification, AppSettings } from './types';
import { DEFAULT_SETTINGS, DEFAULT_BROKER } from './types';
import { INITIAL_STOCKS } from './data/initialData';
import { INITIAL_NOTIFICATIONS } from './data/initialNotifications';
import { fetchStockPrices } from './utils/fetchPrices';
import { fetchStockHistory } from './utils/fetchHistory';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';
import HomeView from './components/HomeView';
import ActivityView from './components/ActivityView';
import HoldingsView from './components/HoldingsView';
import ProfileView from './components/ProfileView';
import NotificationsView from './components/NotificationsView';
import AddTransactionSheet from './components/AddTransactionSheet';
import SettingsSheet from './components/SettingsSheet';
import ToastContainer, { type ToastData } from './components/Toast';
import PullToRefreshIndicator from './components/PullToRefreshIndicator';

const STORAGE_KEY = 'stock-tracker-data';
const NOTIF_KEY = 'stock-tracker-notifications';
const SETTINGS_KEY = 'stock-tracker-settings';

/** Normalize any legacy slash-format dates (2025/05/26) → dash (2025-05-26). */
function normalizeDates(stocks: Stock[]): Stock[] {
  return stocks.map((s) => ({
    ...s,
    buys:  s.buys.map( (b) => ({ ...b, date: b.date.replace(/\//g, '-') })),
    sells: s.sells.map((sv) => ({ ...sv, date: sv.date.replace(/\//g, '-') })),
  }));
}

function loadStocks(): Stock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stocks = JSON.parse(raw) as Stock[];
      const normalized = normalizeDates(stocks);
      // Persist the migration immediately so it only runs once
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch {}
  return INITIAL_STOCKS;
}

function loadNotifications(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) return JSON.parse(raw) as AppNotification[];
  } catch {}
  return INITIAL_NOTIFICATIONS;
}

function saveStocks(stocks: Stock[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks));
}

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // ── Migration: old format had top-level brokerName / feeRate / feeDiscount ──
      if (!parsed.brokers && parsed.brokerName) {
        const migrated: AppSettings = {
          userName: (parsed.userName as string) ?? DEFAULT_SETTINGS.userName,
          taxRate:  (parsed.taxRate  as number) ?? DEFAULT_SETTINGS.taxRate,
          brokers: [{
            id: 'default',
            name:        (parsed.brokerName  as string) ?? DEFAULT_BROKER.name,
            feeRate:     (parsed.feeRate     as number) ?? DEFAULT_BROKER.feeRate,
            feeDiscount: (parsed.feeDiscount as number) ?? DEFAULT_BROKER.feeDiscount,
          }],
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(migrated));
        return migrated;
      }
      return { ...DEFAULT_SETTINGS, ...parsed } as AppSettings;
    }
  } catch {}
  return DEFAULT_SETTINGS;
}

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>(loadStocks);
  const [notifications, setNotifications] = useState<AppNotification[]>(loadNotifications);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [view, setView] = useState<ViewName>('home');
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);

  // Shared refresh state — used by both button taps and pull-to-refresh
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const isRefreshingRef = useRef(false);

  // Ref for the main scrollable container (used by pull-to-refresh)
  const scrollRef = useRef<HTMLDivElement>(null);

  // Market price history for sparklines: { symbol → close prices oldest→newest }
  const [priceHistory, setPriceHistory] = useState<Record<string, number[]>>({});
  const historyFetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const missing = stocks.filter((s) => !historyFetchedRef.current.has(s.symbol));
    if (missing.length === 0) return;
    missing.forEach((s) => {
      historyFetchedRef.current.add(s.symbol);
      fetchStockHistory(s.symbol).then((prices) => {
        if (prices.length > 1) {
          setPriceHistory((prev) => ({ ...prev, [s.symbol]: prices }));
        }
      });
    });
  }, [stocks]);

  // Tracks which stock cards are currently in the viewport (reported by HomeView)
  const [visibleStockIds, setVisibleStockIds] = useState<Set<string>>(new Set());
  const handleVisibleStocksChange = useCallback((ids: Set<string>) => {
    setVisibleStockIds(ids);
  }, []);

  const hasUnread = notifications.some((n) => !n.read);

  function saveNotifications(next: AppNotification[]) {
    setNotifications(next);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
  }

  function handleMarkAllRead() {
    saveNotifications(notifications.map((n) => ({ ...n, read: true })));
  }

  function handleNotificationClick(n: AppNotification) {
    if (n.actionType === 'stock' && n.actionStockId) {
      setSelectedStockId(n.actionStockId);
      setView('activity');
    } else if (n.actionType === 'activity') {
      if (n.actionStockId) setSelectedStockId(n.actionStockId);
      setView('activity');
    }
  }

  function pushNotification(notif: Omit<AppNotification, 'id' | 'time' | 'read'>) {
    const now = new Date();
    const t = `今天 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const entry: AppNotification = { ...notif, id: `n${Date.now()}`, time: t, read: false };
    setNotifications((prev) => {
      const next = [entry, ...prev];
      localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
      return next;
    });
  }

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  function handleSaveSettings(s: AppSettings) {
    setSettings(s);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    showToast('設定已儲存');
  }

  function update(next: Stock[]) {
    setStocks(next);
    saveStocks(next);
  }

  const ntd = (n: number) => `NT$${Math.round(n).toLocaleString()}`;

  function handleAddBuy(stockId: string, tx: BuyTransaction) {
    const stock = stocks.find((s) => s.id === stockId);
    update(stocks.map((s) => s.id === stockId ? { ...s, buys: [...s.buys, tx] } : s));
    showToast('買入交易已新增');
    if (stock) pushNotification({
      type: 'trade',
      title: '買入成交',
      description: `${stock.name} (${stock.symbol}) 買入 ${tx.shares} 股，成交價 ${ntd(tx.price)}，手續費 ${ntd(tx.fee)}`,
      actionType: 'activity',
      actionStockId: stockId,
    });
  }

  function handleAddSell(stockId: string, tx: SellTransaction) {
    const stock = stocks.find((s) => s.id === stockId);
    update(stocks.map((s) => s.id === stockId ? { ...s, sells: [...s.sells, tx] } : s));
    showToast('賣出交易已新增');
    if (stock) pushNotification({
      type: 'trade',
      title: '賣出成交',
      description: `${stock.name} (${stock.symbol}) 賣出 ${tx.shares} 股，成交價 ${ntd(tx.price)}，損益 ${tx.profit >= 0 ? '+' : ''}${ntd(tx.profit)}`,
      actionType: 'activity',
      actionStockId: stockId,
    });
  }

  function handleAddStock(stock: Stock) {
    update([...stocks, stock]);
    const hasTx = stock.buys.length > 0 || stock.sells.length > 0;
    showToast(hasTx ? `${stock.name} 已新增並記錄交易` : `${stock.name} 已新增`);
    if (stock.buys.length > 0) {
      const tx = stock.buys[0];
      pushNotification({
        type: 'trade',
        title: '買入成交',
        description: `${stock.name} (${stock.symbol}) 買入 ${tx.shares} 股，成交價 ${ntd(tx.price)}`,
        actionType: 'activity',
        actionStockId: stock.id,
      });
    } else if (stock.sells.length > 0) {
      const tx = stock.sells[0];
      pushNotification({
        type: 'trade',
        title: '賣出成交',
        description: `${stock.name} (${stock.symbol}) 賣出 ${tx.shares} 股，成交價 ${ntd(tx.price)}`,
        actionType: 'activity',
        actionStockId: stock.id,
      });
    }
  }

  function handleUpdatePrice(stockId: string, price: number) {
    const stock = stocks.find((s) => s.id === stockId);
    update(stocks.map((s) => s.id === stockId ? { ...s, currentPrice: price } : s));
    if (stock && stock.targetPrice > 0 && price >= stock.targetPrice) {
      pushNotification({
        type: 'target',
        title: `${stock.name}已達目標價`,
        description: `${stock.name} (${stock.symbol}) 目前股價 ${ntd(price)}，已達您設定的目標價 ${ntd(stock.targetPrice)}`,
        actionType: 'stock',
        actionStockId: stockId,
      });
    }
  }

  // Auto-polling: refresh prices for visible cards every 15 s
  useStockPoller(stocks, visibleStockIds, handleUpdatePrice);

  // Shared refresh — called by pull-to-refresh gesture AND tap buttons
  async function handleRefreshAll() {
    if (isRefreshingRef.current || stocks.length === 0) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const symbols = stocks.map((s) => s.id);
      const prices = await fetchStockPrices(symbols); // throws on network/API error
      setStocks((prev) => {
        const next = prev.map((s) => {
          const p = prices[s.id];
          return p !== undefined && p !== s.currentPrice ? { ...s, currentPrice: p } : s;
        });
        saveStocks(next);
        return next;
      });
      setLastUpdated(new Date());
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }

  const ptrEnabled = view === 'home' || view === 'holdings' || view === 'profile';
  const ptrState = usePullToRefresh(scrollRef, handleRefreshAll, ptrEnabled);

  function handleUpdateTarget(stockId: string, price: number) {
    update(stocks.map((s) => s.id === stockId ? { ...s, targetPrice: price } : s));
  }

  function handleSaveTx(stockId: string, type: 'buy' | 'sell', tx: BuyTransaction | SellTransaction) {
    update(stocks.map((s) => {
      if (s.id !== stockId) return s;
      if (type === 'buy') return { ...s, buys: s.buys.map((b) => b.id === tx.id ? tx as BuyTransaction : b) };
      return { ...s, sells: s.sells.map((sv) => sv.id === tx.id ? tx as SellTransaction : sv) };
    }));
    showToast('交易記錄已更新');
  }

  function handleDeleteTx(stockId: string, type: 'buy' | 'sell', txId: string) {
    update(stocks.map((s) => {
      if (s.id !== stockId) return s;
      if (type === 'buy') return { ...s, buys: s.buys.filter((b) => b.id !== txId) };
      return { ...s, sells: s.sells.filter((sv) => sv.id !== txId) };
    }));
    showToast('交易記錄已刪除');
  }

  function handleStockClick(id: string) {
    setSelectedStockId(id);
    setView('activity');
  }

  function handleNavigate(v: ViewName) {
    setView(v);
    setSelectedStockId(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <SideNav active={view} onNavigate={handleNavigate} onAddClick={() => setShowAdd(true)} hasUnread={hasUnread} />

      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen min-w-0 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[430px] md:max-w-full min-h-screen relative">
          <div ref={scrollRef} className="overflow-y-auto h-screen">
            <PullToRefreshIndicator state={ptrState} />
            {view === 'home' && (
              <HomeView
                stocks={stocks}
                settings={settings}
                onStockClick={handleStockClick}
                onAddClick={() => setShowAdd(true)}
                onViewAllHoldings={() => handleNavigate('holdings')}
                onViewAllActivity={() => handleNavigate('activity')}
                onBellClick={() => handleNavigate('notifications')}
                onVisibleStocksChange={handleVisibleStocksChange}
                hasUnread={hasUnread}
                onRefresh={handleRefreshAll}
                isRefreshing={isRefreshing}
                priceHistory={priceHistory}
              />
            )}
            {view === 'notifications' && (
              <NotificationsView
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                onNotificationClick={handleNotificationClick}
              />
            )}
            {view === 'activity' && (
              <ActivityView
                stocks={stocks}
                selectedStockId={selectedStockId}
                settings={settings}
                priceHistory={priceHistory}
                onBack={() => { setSelectedStockId(null); window.scrollTo({ top: 0, behavior: 'instant' }); }}
                onSelectStock={(id) => setSelectedStockId(id)}
                onUpdatePrice={handleUpdatePrice}
                onUpdateTarget={handleUpdateTarget}
                onSaveTx={handleSaveTx}
                onDeleteTx={handleDeleteTx}
                onRefresh={handleRefreshAll}
                isRefreshing={isRefreshing}
                lastUpdated={lastUpdated}
              />
            )}
            {view === 'holdings' && (
              <HoldingsView stocks={stocks} onStockClick={handleStockClick} />
            )}
            {view === 'profile' && (
              <ProfileView
                stocks={stocks}
                settings={settings}
                onSettingsClick={() => setShowSettings(true)}
                onImport={(imported) => {
                  update(imported);
                  showToast('資料已匯入');
                }}
                onClearAll={() => {
                  update([]);
                  showToast('所有資料已清空');
                }}
              />
            )}
          </div>

          <BottomNav active={view} onNavigate={handleNavigate} onAddClick={() => setShowAdd(true)} />

          {showAdd && (
            <AddTransactionSheet
              stocks={stocks}
              settings={settings}
              onClose={() => setShowAdd(false)}
              onAddBuy={handleAddBuy}
              onAddSell={handleAddSell}
              onAddStock={handleAddStock}
            />
          )}

          {showSettings && (
            <SettingsSheet
              settings={settings}
              onSave={handleSaveSettings}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {/* Toast notifications — outside the constrained container, always on top */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}
