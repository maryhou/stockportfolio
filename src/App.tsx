import { useState, useCallback, useRef } from 'react';
import type { Stock, ViewName, BuyTransaction, SellTransaction, AppNotification, AppSettings } from './types';
import { DEFAULT_SETTINGS } from './types';
import { INITIAL_STOCKS } from './data/initialData';
import { INITIAL_NOTIFICATIONS } from './data/initialNotifications';
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

const STORAGE_KEY = 'stock-tracker-data';
const NOTIF_KEY = 'stock-tracker-notifications';
const SETTINGS_KEY = 'stock-tracker-settings';

function loadStocks(): Stock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Stock[];
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
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
          <div className="overflow-y-auto h-screen">
            {view === 'home' && (
              <HomeView
                stocks={stocks}
                onStockClick={handleStockClick}
                onAddClick={() => setShowAdd(true)}
                onViewAllHoldings={() => handleNavigate('holdings')}
                onBellClick={() => handleNavigate('notifications')}
                hasUnread={hasUnread}
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
                onSelectStock={(id) => setSelectedStockId(id)}
                onUpdatePrice={handleUpdatePrice}
                onUpdateTarget={handleUpdateTarget}
                onSaveTx={handleSaveTx}
                onDeleteTx={handleDeleteTx}
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
