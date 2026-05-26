import { useState } from 'react';
import type { Stock, ViewName, BuyTransaction, SellTransaction } from './types';
import { INITIAL_STOCKS } from './data/initialData';
import BottomNav from './components/BottomNav';
import SideNav from './components/SideNav';
import HomeView from './components/HomeView';
import ActivityView from './components/ActivityView';
import HoldingsView from './components/HoldingsView';
import ProfileView from './components/ProfileView';
import AddTransactionSheet from './components/AddTransactionSheet';

const STORAGE_KEY = 'stock-tracker-data';

function loadStocks(): Stock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Stock[];
  } catch {}
  return INITIAL_STOCKS;
}

function saveStocks(stocks: Stock[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks));
}

export default function App() {
  const [stocks, setStocks] = useState<Stock[]>(loadStocks);
  const [view, setView] = useState<ViewName>('home');
  const [showAdd, setShowAdd] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);

  function update(next: Stock[]) {
    setStocks(next);
    saveStocks(next);
  }

  function handleAddBuy(stockId: string, tx: BuyTransaction) {
    update(stocks.map((s) => s.id === stockId ? { ...s, buys: [...s.buys, tx] } : s));
  }

  function handleAddSell(stockId: string, tx: SellTransaction) {
    update(stocks.map((s) => s.id === stockId ? { ...s, sells: [...s.sells, tx] } : s));
  }

  function handleAddStock(stock: Stock) {
    update([...stocks, stock]);
  }

  function handleUpdatePrice(stockId: string, price: number) {
    update(stocks.map((s) => s.id === stockId ? { ...s, currentPrice: price } : s));
  }

  function handleUpdateTarget(stockId: string, price: number) {
    update(stocks.map((s) => s.id === stockId ? { ...s, targetPrice: price } : s));
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
      {/* Desktop side nav */}
      <SideNav active={view} onNavigate={handleNavigate} onAddClick={() => setShowAdd(true)} />

      {/* Main content — offset for sidebar on lg+ */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Mobile/tablet: phone-width container centred; desktop: full width */}
        <div className="mx-auto w-full max-w-[430px] md:max-w-full min-h-screen relative">
          <div className="overflow-y-auto h-screen">
            {view === 'home' && (
              <HomeView
                stocks={stocks}
                onStockClick={handleStockClick}
                onAddClick={() => setShowAdd(true)}
                onViewAllHoldings={() => handleNavigate('holdings')}
              />
            )}
            {view === 'activity' && (
              <ActivityView
                stocks={stocks}
                selectedStockId={selectedStockId}
                onSelectStock={(id) => setSelectedStockId(id)}
                onUpdatePrice={handleUpdatePrice}
                onUpdateTarget={handleUpdateTarget}
              />
            )}
            {view === 'holdings' && (
              <HoldingsView
                stocks={stocks}
                onStockClick={handleStockClick}
              />
            )}
            {view === 'profile' && <ProfileView stocks={stocks} />}
          </div>

          {/* Mobile/tablet bottom nav */}
          <BottomNav
            active={view}
            onNavigate={handleNavigate}
            onAddClick={() => setShowAdd(true)}
          />

          {/* Add Transaction Sheet */}
          {showAdd && (
            <AddTransactionSheet
              stocks={stocks}
              onClose={() => setShowAdd(false)}
              onAddBuy={handleAddBuy}
              onAddSell={handleAddSell}
              onAddStock={handleAddStock}
            />
          )}
        </div>
      </div>
    </div>
  );
}
