import { useState, useCallback, useRef, useEffect } from 'react';
import { useStockPoller } from './hooks/useStockPoller';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { subscribeToAuth, loadCloudData, saveCloudData, signInWithGoogle, signOutUser, type User, type UserCloudData } from './lib/firebase';
import type { Stock, ViewName, BuyTransaction, SellTransaction, DividendTransaction, AppNotification, AppSettings, AppTheme } from './types';
import { DEFAULT_SETTINGS, DEFAULT_BROKER } from './types';
import { INITIAL_STOCKS } from './data/initialData';
import { INITIAL_NOTIFICATIONS } from './data/initialNotifications';
import { fetchStockPrices } from './utils/fetchPrices';
import { fetchStockHistory } from './utils/fetchHistory';
import { mergeImportedDividends } from './utils/mergeDividends';
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
import SearchOverlay, { pushRecentId } from './components/SearchOverlay';
import DividendView from './components/DividendView';
import AppLock from './components/AppLock';
import { isBiometricEnabled } from './utils/biometric';

const STORAGE_KEY  = 'stock-tracker-data';
const ONBOARD_KEY  = 'stock-tracker-onboarded';
const NOTIF_KEY    = 'stock-tracker-notifications';
const SETTINGS_KEY = 'stock-tracker-settings';
// Set while local stock changes haven't been confirmed written to Firestore,
// so a reload before the debounced save lands knows local is newer than cloud.
const STOCKS_DIRTY_KEY = 'stock-tracker-stocks-dirty';

/** System announcements injected once per ID — add new entries here for future updates. */
const SYSTEM_ANNOUNCEMENTS: import('./types').AppNotification[] = [
  {
    id: 'sys-v6-dividend-month-filter',
    type: 'system',
    title: '功能更新：股息月度篩選',
    description: '點擊月份長條圖即可篩選當月股息紀錄與總額。',
    time: '系統公告',
    read: false,
  },
  {
    id: 'sys-v6-bond-etf-sync-fix',
    type: 'system',
    title: '問題修正：債券 ETF 報價與雲端同步',
    description: '債券 ETF 現價已可正常顯示；股息紀錄現在會正確同步到所有裝置。',
    time: '系統公告',
    read: false,
  },
  {
    id: 'sys-v5-search',
    type: 'system',
    title: '功能更新：搜尋功能讓你查紀錄不用一秒鐘',
    description: '點右上角放大鏡，輸入名稱、代號或日期，馬上找到任何持股或交易紀錄。',
    time: '系統公告',
    read: false,
  },
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

/**
 * Merge local dividends into cloud stocks for stocks whose cloud copy has no
 * dividends field at all — i.e. cloud data written before the dividends
 * feature existed. Once the cloud copy carries a dividends array (even an
 * empty one, after a deletion), it is authoritative and local is left alone.
 */
function mergeLegacyLocalDividends(
  cloudStocks: Stock[],
  localStocks: Stock[],
): { stocks: Stock[]; changed: boolean } {
  const localById = new Map(localStocks.map((s) => [s.id, s]));
  let changed = false;
  const stocks = cloudStocks.map((cs) => {
    if (cs.dividends !== undefined) return cs;
    const localDivs = localById.get(cs.id)?.dividends;
    if (!localDivs?.length) return cs;
    changed = true;
    return { ...cs, dividends: localDivs };
  });
  return { stocks, changed };
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
  const [showSearch, setShowSearch] = useState(false);
  const [isLocked, setIsLocked] = useState(() => {
    if (!isBiometricEnabled()) return false;
    // sessionStorage is cleared when the app/tab is closed, so closing = always re-lock
    return !sessionStorage.getItem('bio-unlocked');
  });
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

  // Writes pending data and clears the stocks-dirty marker once Firestore
  // confirms the write, so reloads know whether local stocks are ahead of cloud.
  function writeCloudData(uid: string, data: Partial<UserCloudData>) {
    saveCloudData(uid, data).then((ok) => {
      if (ok && data.stocks) localStorage.removeItem(STOCKS_DIRTY_KEY);
    });
  }

  function queueCloudSave(partial: { stocks?: Stock[]; settings?: AppSettings; notifications?: AppNotification[] }) {
    const uid = currentUserRef.current?.uid;
    if (!uid) return;
    if (partial.stocks) localStorage.setItem(STOCKS_DIRTY_KEY, '1');
    pendingCloudData.current = { ...pendingCloudData.current, ...partial };
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
      const data = pendingCloudData.current;
      pendingCloudData.current = {};
      writeCloudData(uid, data);
    }, 1500);
  }

  // Flush the pending debounced save immediately when the page is hidden or
  // unloading, so a quick reload/close doesn't lose the last 1.5s of changes.
  useEffect(() => {
    function flushCloudSave() {
      const uid = currentUserRef.current?.uid;
      if (!uid) return;
      const data = pendingCloudData.current;
      if (Object.keys(data).length === 0) return;
      if (cloudSaveTimer.current) {
        clearTimeout(cloudSaveTimer.current);
        cloudSaveTimer.current = null;
      }
      pendingCloudData.current = {};
      writeCloudData(uid, data);
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') flushCloudSave();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', flushCloudSave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flushCloudSave);
    };
  }, []);

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
          const localStocks = loadStocks();
          if (localStorage.getItem(STOCKS_DIRTY_KEY)) {
            // Local stock changes never reached Firestore (reload beat the
            // debounced save) — local is newer, push it up instead of
            // letting stale cloud data overwrite it.
            setStocks(localStocks);
            writeCloudData(user.uid, { stocks: localStocks });
          } else {
            // Cloud is source of truth, but recover dividends that only
            // exist locally because the cloud copy predates the feature.
            const normalizedStocks = normalizeDates(cloudData.stocks ?? []);
            const { stocks: mergedStocks, changed } = mergeLegacyLocalDividends(normalizedStocks, localStocks);
            setStocks(mergedStocks);
            saveStocks(mergedStocks);
            if (changed) writeCloudData(user.uid, { stocks: mergedStocks });
          }
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

  async function handleSignIn(): Promise<{ isNewUser: boolean; displayName: string }> {
    try {
      return await signInWithGoogle();
    } catch (e) {
      console.error('Sign-in error:', e);
      return { isNewUser: false, displayName: '' };
    }
  }

  function handleOnboardingComplete(userName: string) {
    const next = { ...settings, ...(userName ? { userName } : {}) };
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
    setLastUpdated(new Date());
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

  // Re-lock only after 5 minutes in background
  useEffect(() => {
    const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes
    let hiddenAt: number | null = null;

    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt !== null && isBiometricEnabled()) {
          if (Date.now() - hiddenAt >= LOCK_AFTER_MS) {
            setIsLocked(true);
          }
        }
        hiddenAt = null;
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  // Cmd+K / Ctrl+K global shortcut to open search
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  function handleSaveDividend(stockId: string, dividend: DividendTransaction) {
    update(stocks.map((s) => {
      if (s.id !== stockId) return s;
      const existing = s.dividends ?? [];
      const idx = existing.findIndex((d) => d.id === dividend.id);
      const dividends = idx >= 0
        ? existing.map((d) => d.id === dividend.id ? dividend : d)
        : [...existing, dividend];
      return { ...s, dividends };
    }));
    showToast('股息記錄已儲存');
  }

  // Batch import (自動估算) — fold every item into ONE update. Looping the
  // single-save handler read the same stale `stocks` closure per call and each
  // setStocks clobbered the previous, so only the last dividend survived (a
  // toast still fired per item, so it looked like all saved). See mergeDividends.
  function handleImportDividends(items: { stockId: string; dividend: DividendTransaction }[]) {
    if (items.length === 0) return;
    update(mergeImportedDividends(stocks, items));
    showToast(`已匯入 ${items.length} 筆股息`);
  }

  function handleDeleteDividend(stockId: string, dividendId: string) {
    update(stocks.map((s) =>
      s.id !== stockId ? s : { ...s, dividends: (s.dividends ?? []).filter((d) => d.id !== dividendId) }
    ));
    showToast('股息記錄已刪除');
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
    pushRecentId(id);
    setSelectedStockId(id);
    setView('activity');
  }

  function handleNavigate(v: ViewName) {
    setView(v);
    setSelectedStockId(null);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex" data-theme={(previewTheme ?? settings.theme) ?? 'default'}>
      {isLocked && <AppLock onUnlocked={() => {
        sessionStorage.setItem('bio-unlocked', '1');
        setIsLocked(false);
      }} />}
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
                onSearchClick={() => setShowSearch(true)}
                onDividendClick={() => setView('dividends')}
                onDeleteTx={handleDeleteTx}
                onSaveTx={handleSaveTx}
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
            {view === 'dividends' && (
              <DividendView
                stocks={stocks}
                settings={settings}
                onBack={() => setView('home')}
                onSaveDividend={handleSaveDividend}
                onImportDividends={handleImportDividends}
                onDeleteDividend={handleDeleteDividend}
                onRefresh={handleRefreshAll}
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
                onImport={(backup) => {
                  update(backup.stocks);
                  if (backup.settings) {
                    setSettings(backup.settings);
                    setPreviewTheme(null);
                    localStorage.setItem(SETTINGS_KEY, JSON.stringify(backup.settings));
                    queueCloudSave({ settings: backup.settings });
                  }
                  showToast(backup.settings ? '資料與設定已匯入' : '資料已匯入');
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

      {showSearch && (
        <SearchOverlay
          stocks={stocks}
          onStockClick={handleStockClick}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showOnboarding && (
        <OnboardingModal
          onComplete={handleOnboardingComplete}
          onGoogleSignIn={handleSignIn}
        />
      )}
    </div>
  );
}
