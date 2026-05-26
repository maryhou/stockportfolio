import { useState } from 'react';
import type { Stock, ViewName, BuyTransaction, SellTransaction } from './types';
import { INITIAL_STOCKS } from './data/initialData';
import BottomNav from './components/BottomNav';
import HomeView from './components/HomeView';
import ActivityView from './components/ActivityView';
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Phone frame wrapper */}
      <div className="mx-auto w-full max-w-[430px] min-h-screen bg-gray-50 relative overflow-hidden">
        {/* Content area */}
        <div className="overflow-y-auto" style={{ height: '100dvh' }}>
          {view === 'home' && (
            <HomeView
              stocks={stocks}
              onStockClick={handleStockClick}
              onAddClick={() => setShowAdd(true)}
            />
          )}
          {view === 'activity' && (
            <ActivityView
              stocks={selectedStockId ? stocks.filter((s) => s.id === selectedStockId) : stocks}
              onUpdatePrice={handleUpdatePrice}
              onUpdateTarget={handleUpdateTarget}
            />
          )}
          {view === 'detail' && (
            <ActivityView
              stocks={stocks}
              onUpdatePrice={handleUpdatePrice}
              onUpdateTarget={handleUpdateTarget}
            />
          )}
          {view === 'profile' && <ProfileView stocks={stocks} />}
        </div>

        {/* Bottom Nav */}
        <BottomNav
          active={view}
          onNavigate={(v) => { setView(v); setSelectedStockId(null); }}
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
  );
}
