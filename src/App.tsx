import { useState, useCallback, useRef, useEffect } from 'react';
import { useStockPoller } from './hooks/useStockPoller';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { subscribeToAuth, loadCloudData, saveCloudData, signInWithGoogle, signOutUser, type User } from './lib/firebase';
import type { Stock, ViewName, BuyTransaction, SellTransaction, AppNotification, AppSettings, AppTheme } from './types';
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
import OnboardingModal from './components/OnboardingModal';

const STORAGE_KEY  = 'stock-tracker-data';
const ONBOARD_KEY  = 'stock-tracker-onboarded';
const NOTIF_KEY    = 'stock-tracker-notifications';
const SETTINGS_KEY = 'stock-tracker-settings';

/** System announcements injected once per ID — add new entries here for future updates. */
const SYSTEM_ANNOUNCEMENTS: import('./types').AppNotification[] = [
  {
    id: 'sys-v4-dark-mode',
    type: 'system',
    title: '外觀更新：新增暗色模式',
    description: '介面現在支援三種主題：預設紫色、中性灰色、暗色模式。可至「我的」→「設定」→「介面主題」切換。',
    time: '系統公告',
    read: false,
  },
  {
    id: 'sys-v3-cloud-sync',
    type: 'system',
    title: '功能更新：跨裝置資料同步',
    description: '前往「我的」頁面以 Google 帳號登入，即可在所有裝置上同步你的投資資料。',
    time: '系統公告',
    read: false,
  },
  {
    id: 'sys-v2-import-edit-b',
    type: 'system',
    title: '功能更新：匯入持倉編輯優化',
    description: '匯入持倉的交易紀錄現在可以正確編輯了。',
    time: '系統公告',
    read: false,
  },
];

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
  let list: AppNotification[] = INITIAL_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    if (raw) list = JSON.parse(raw) as AppNotification[];
  } catch {}

  // Inject any system announcements the user hasn't seen yet (prepend, newest first)
  const existingIds = new Set(list.map((n) => n.id));
  const unseen = SYSTEM_ANNOUNCEMENTS.filter((a) => !existingIds.has(a.id));
  if (unseen.length > 0) {
    const updated = [...unseen, ...list];
    localStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
    return updated;
  }
  return list;
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
  const [showOnboarding, setShowOnboarding] = useState(() => {
    // Already completed onboarding
    if (localStorage.getItem(ONBOARD_KEY)) return false;
    // Existing user: has saved settings or stock data → skip modal and mark as onboarded
    const hasSettings = !!localStorage.getItem(SETTINGS_KEY);
    const hasStocks   = !!localStorage.getItem(STORAGE_KEY);
    if (hasSettings || hasStocks) {
      localStorage.setItem(ONBOARD_KEY, '1');
      return false;
    }
    return true;
  });
  const [previewTheme, setPreviewTheme] = useState<AppTheme | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const toastId = useRef(0);

  // ── Prev-close prices for "today's change" pill (from TWSE dated history) ──
  const [prevClosePrices, setPrevClosePrices] = useState<Record<string, number>>({});

  // ── Cloud sync ────────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const currentUserRef = useRef<User | null>(null);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pending partial data to batch-write after debounce
  const pendingCloudData = useRef<{ stocks?: Stock[]; settings?: AppSettings; notifications?: AppNotification[] }>({});

  function queueCloudSave(partial: { stocks?: Stock[]; settings?: AppSettings; notifications?: AppNotification[] }) {
    const uid = currentUserRef.current?.uid;
    if (!uid) return;
    pendingCloudData.current = { ...pendingCloudData.current, ...partial };
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
      const data = pendingCloudData.current;
      pendingCloudData.current = {};
      saveCloudData(uid, data);
    }, 1500);
  }

  // Listen to Firebase auth state
  useEffect(() => {
    const unsub = subscribeToAuth(async (user) => {
      setCurrentUser(user);
      currentUserRef.current = user;
      if (!user) return;

      setCloudSyncing(true);
      try {
        const cloudData = await loadCloudData(user.uid);
        if (cloudData) {
          // Use cloud data as source of truth
          const normalizedStocks = normalizeDates(cloudData.stocks ?? []);
          setStocks(normalizedStocks);
          saveStocks(normalizedStocks);
          setSettings({ ...cloudData.settings });
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudData.settings));
          setNotifications(cloudData.notifications ?? []);
          localStorage.setItem(NOTIF_KEY, JSON.stringify(cloudData.notifications ?? []));
        } else {
          // First login — migrate localStorage → Firestore
          const localStocks = loadStocks();
          const localSettings = loadSettings();
          const localNotifications = loadNotifications();
          await saveCloudData(user.uid, {
            stocks: localStocks,
            settings: localSettings,
            notifications: localNotifications,
          });
        }
      } finally {
        setCloudSyncing(false);
      }
    });
    return unsub;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSignIn() {
    try {
      await signInWithGoogle();
    } catch (e) {
      console.error('Sign-in error:', e);
    }
  }

  function handleOnboardingComplete(userName: string) {
    const next = { ...settings, userName };
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    localStorage.setItem(ONBOARD_KEY, '1');
    setShowOnboarding(false);
  }

  async function handleSignOut() {
    await signOutUser();
    setCurrentUser(null);
    currentUserRef.current = null;
  }

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
      fetchStockHistory(s.symbol).then((entries) => {
        if (entries.length > 1) {
          // Sparklines: exclude today's entry so marketHistory[-1] stays as yesterday's close
          // (guards against TWSE publishing today's close after market hours)
          const today = new Date().toISOString().slice(0, 10);
          const sparklineEntries = entries.filter((e) => e.date < today);
          if (sparklineEntries.length > 0) {
            setPriceHistory((prev) => ({ ...prev, [s.symbol]: sparklineEntries.map((e) => e.price) }));
          }
          // Prev-close: last sparkline entry (already excludes today)
          const prevEntry = sparklineEntries[sparklineEntries.length - 1];
          if (prevEntry) {
            const diffDays = Math.floor(
              (Date.now() - new Date(prevEntry.date).getTime()) / 86_400_000,
            );
            if (diffDays <= 5) {
              setPrevClosePrices((prev) => ({ ...prev, [s.symbol]: prevEntry.price }));
            }
          }
        }
      });
    });
  }, [stocks]);

  // Tracks which stock cards are currently in the viewport (reported by HomeView)
  // Still used to seed the initial visible set; poller now fetches all stocks.
  const handleVisibleStocksChange = useCallback((_ids: Set<string>) => {
    // no-op: poller no longer depends on visible subset
  }, []);

  const hasUnread = notifications.some((n) => !n.read);

  function saveNotifications(next: AppNotification[]) {
    setNotifications(next);
    localStorage.setItem(NOTIF_KEY, JSON.stringify(next));
    queueCloudSave({ notifications: next });
  }

  function handleMarkAllRead() {
    saveNotifications(notifications.map((n) => ({ ...n, read: true })));
  }

  function handleDeleteNotification(id: string) {
    saveNotifications(notifications.filter((n) => n.id !== id));
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
      queueCloudSave({ notifications: next });
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
    setPreviewTheme(null);  // clear preview; settings.theme now drives the real value
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    queueCloudSave({ settings: s });
    showToast('設定已儲存');
  }

  function update(next: Stock[]) {
    setStocks(next);
    saveStocks(next);
    queueCloudSave({ stocks: next });
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

  // Auto-polling: refresh prices for ALL stocks every 15 s (desktop + mobile safe)
  useStockPoller(stocks, handleUpdatePrice);

  // Shared refresh — called by pull-to-refresh gesture AND tap buttons
  async function handleRefreshAll() {
    if (isRefreshingRef.current || stocks.length === 0) return;
    isRefreshingRef.current = true;
    setIsRefreshing(true);
    try {
      const symbols = stocks.map((s) => s.symbol); // use symbol, not id
      const prices = await fetchStockPrices(symbols);
      setStocks((prev) => {
        const next = prev.map((s) => {
          const p = prices[s.symbol]; // look up by symbol
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

  // Initial price fetch — run once after mount so prices aren't stale on first load
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current || stocks.length === 0) return;
    initialFetchDone.current = true;
    const timer = setTimeout(() => { handleRefreshAll(); }, 1_500);
    return () => clearTimeout(timer);
  }, [stocks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const ptrEnabled = view === 'home' || view === 'activity' || view === 'holdings' || view === 'profile';
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
    const updated = stocks.map((s) => {
      if (s.id !== stockId) return s;
      if (type === 'buy') return { ...s, buys: s.buys.filter((b) => b.id !== txId) };
      return { ...s, sells: s.sells.filter((sv) => sv.id !== txId) };
    });

    // If the stock is now completely empty, remove it and navigate back
    const target = updated.find((s) => s.id === stockId);
    if (target && target.buys.length === 0 && target.sells.length === 0) {
      update(updated.filter((s) => s.id !== stockId));
      setSelectedStockId(null);
      showToast('最後一筆交易刪除，個股紀錄已移除');
    } else {
      update(updated);
      showToast('交易記錄已刪除');
    }
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
    <div className="min-h-screen bg-gray-50 flex" data-theme={(previewTheme ?? settings.theme) ?? 'default'}>
      <SideNav active={view} onNavigate={handleNavigate} onAddClick={() => setShowAdd(true)} hasUnread={hasUnread} userName={settings.userName} />

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
                priceHistory={priceHistory}
                prevClosePrices={prevClosePrices}
              />
            )}
            {view === 'notifications' && (
              <NotificationsView
                notifications={notifications}
                onMarkAllRead={handleMarkAllRead}
                onNotificationClick={handleNotificationClick}
                onDeleteNotification={handleDeleteNotification}
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
                  // Keep only system announcements (版本更新公告 etc.);
                  // clear trade / target / pnl notifications that reference stock data.
                  saveNotifications(notifications.filter((n) => n.type === 'system'));
                  showToast('所有交易資料已清空');
                }}
                currentUser={currentUser}
                cloudSyncing={cloudSyncing}
                onSignIn={handleSignIn}
                onSignOut={handleSignOut}
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
              onThemePreview={setPreviewTheme}
              onClose={() => setShowSettings(false)}
            />
          )}
        </div>
      </div>

      {/* Toast notifications — outside the constrained container, always on top */}
      <ToastContainer toasts={toasts} />

      {showOnboarding && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onGoogleSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
