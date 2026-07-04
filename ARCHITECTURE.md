# WealthTrack — Architecture

React + Vite PWA for tracking Taiwan stock trades and dividends. Mobile-first, offline-capable, with optional Firebase cloud sync.

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | React 18, TypeScript, Tailwind CSS v3 |
| Build | Vite 5 |
| PWA | `vite-plugin-pwa` + Workbox |
| Auth | Firebase Authentication (Google OAuth) |
| Database | Firestore (cloud), localStorage (offline) |
| API proxy | Vercel serverless functions (`/api/*.ts`) |
| Tests | Vitest (`src/utils/calculations.test.ts`) |
| CI/CD | GitHub Actions → Vercel (`npm ci → tsc → vitest → vercel --prod`) |

---

## Directory Structure

```
src/
├── App.tsx                  # Root: all state, cloud sync, routing
├── components/
│   ├── HomeView.tsx         # Portfolio summary + stock cards
│   ├── ActivityView.tsx     # Per-stock trade history + sparkline
│   ├── HoldingsView.tsx     # All active holdings list
│   ├── DividendView.tsx     # Dividend income tracker (year/month/stock filter)
│   ├── ProfileView.tsx      # Account, import/export, sign in/out
│   ├── NotificationsView.tsx
│   ├── AddTransactionSheet.tsx  # Add buy/sell/new stock (BottomSheet)
│   ├── EditTransactionModal.tsx # Edit existing trade (BottomSheet)
│   ├── SettingsSheet.tsx        # Broker, tax, theme settings (BottomSheet)
│   ├── BottomSheet.tsx      # Shared slide-up modal container
│   ├── BottomNav.tsx        # Mobile tab bar
│   ├── SideNav.tsx          # Desktop sidebar (lg:)
│   ├── SearchOverlay.tsx    # Full-screen search (Cmd+K)
│   ├── AppLock.tsx          # Face ID / biometric lock screen
│   ├── PullToRefreshIndicator.tsx
│   ├── SwipeableRow.tsx     # PointerEvents-based swipe-to-delete
│   ├── DividendCard.tsx
│   ├── DonutChart.tsx
│   ├── Toast.tsx
│   ├── OnboardingModal.tsx
│   └── icons/Icons.tsx
├── hooks/
│   ├── useStockPoller.ts    # Auto-refresh prices every 15 s
│   └── usePullToRefresh.ts  # Pull-to-refresh gesture (touch + scroll)
├── lib/
│   └── firebase.ts          # Firebase init, auth helpers, Firestore load/save
├── utils/
│   ├── calculations.ts      # Fee / tax / profit / dividend math
│   ├── calculations.test.ts # Vitest unit tests for all math
│   ├── fetchPrices.ts       # Fetch current prices (TWSE direct + Vercel proxy)
│   ├── fetchHistory.ts      # Fetch price history for sparklines
│   ├── fetchDividends.ts    # Fetch dividend data from Yahoo Finance
│   └── biometric.ts        # Web Authentication API wrapper
├── types/index.ts           # All TypeScript types + DEFAULT_SETTINGS
└── data/
    ├── initialData.ts       # Seed stock data for new users
    ├── initialNotifications.ts
    └── twStocks.json        # TWSE/TPEx stock name lookup

api/
├── prices.ts    # Vercel proxy → TPEx / Yahoo Finance for non-TWSE stocks
├── history.ts   # Vercel proxy → Yahoo Finance price history
└── dividends.ts # Vercel proxy → Yahoo Finance dividend history
```

---

## State Management

All state lives in `App.tsx` as `useState`. No Redux, no Zustand. Props are passed down to views; views call handler callbacks.

**Core state:**

```
stocks          Stock[]             — all portfolio data
settings        AppSettings         — broker config, tax rate, theme
notifications   AppNotification[]   — in-app notification feed
view            ViewName            — active navigation tab
currentUser     User | null         — Firebase auth user
isLocked        boolean             — biometric lock active
prevClosePrices Record<string,number> — yesterday's close per symbol (for % change)
priceHistory    Record<string,number[]> — sparkline data per symbol
```

**Write pattern:** every mutation goes through `update(next: Stock[])` which calls `setStocks → saveStocks (localStorage) → queueCloudSave`.

---

## Data Persistence

Two layers, kept in sync:

### localStorage (always on)

| Key | Content |
|---|---|
| `stock-tracker-data` | `Stock[]` — all trades and dividends |
| `stock-tracker-settings` | `AppSettings` |
| `stock-tracker-notifications` | `AppNotification[]` |
| `stock-tracker-onboarded` | `'1'` once onboarding is complete |
| `stock-tracker-stocks-dirty` | Set when stocks have local changes not yet confirmed written to Firestore |

### Firestore (when signed in)

Single document per user: `users/{uid}` with fields `stocks`, `settings`, `notifications`.

**Save strategy:** 1.5 s debounce via `queueCloudSave`. Dirty marker (`STOCKS_DIRTY_KEY`) is set on write and cleared only after Firestore confirms. On page hide / `pagehide` event, the debounce is flushed immediately so a quick close doesn't lose the last write.

**Load strategy on sign-in:**
1. If `STOCKS_DIRTY_KEY` is set → local is newer (reload beat the debounce); push local up to Firestore.
2. Else → Firestore is authoritative. Merge legacy local dividends for stocks whose cloud copy predates the dividend feature (`dividends === undefined`).
3. If no Firestore doc exists → first login; migrate all localStorage data up.

---

## Component Patterns

### Modals — `BottomSheet`
All add/edit flows render through the shared `BottomSheet` component which provides a slide-up bottom sheet with backdrop. Individual sheets (`AddTransactionSheet`, `EditTransactionModal`, `SettingsSheet`, `DividendCard`) are children.

### Swipe-to-delete — `SwipeableRow`
Built on PointerEvents (not touch events) for unified mouse + touch handling. Threshold-based: crossing 40% width reveals the delete button; crossing 80% auto-triggers delete.

### Pull-to-refresh — `usePullToRefresh`
Attached to the main `scrollRef` container in `App`. Works in both flat views and views with their own inner scroll container (e.g. `DividendView`). Amber arc indicator via `PullToRefreshIndicator`.

### Navigation
- Mobile: `BottomNav` (fixed bottom bar), 6 tabs + floating add button.
- Desktop (`lg:`): `SideNav` (fixed left sidebar, 64 px wide), content constrained to 430 px centered or full-width depending on view.

---

## Price Data

### Auto-polling (`useStockPoller`)
Polls every 15 seconds for **all** stocks regardless of viewport visibility. Calls `handleUpdatePrice` per stock, which also triggers a target-price notification if `currentPrice >= targetPrice`.

### Manual refresh
`handleRefreshAll` — fetches all symbols in one batch call, used by pull-to-refresh and the refresh button in views. Also runs once 1.5 s after mount.

### Data sources

| Market | Source | Via |
|---|---|---|
| TWSE 上市 (e.g. 2330) | TWSE API | Browser direct |
| TPEx 上櫃 | Yahoo Finance | Vercel `/api/prices.ts` |
| Bond ETFs (e.g. 00679B) | Yahoo Finance | Vercel `/api/prices.ts` |
| Price history / sparklines | Yahoo Finance | Vercel `/api/history.ts` |
| Dividend data | Yahoo Finance | Vercel `/api/dividends.ts` |

Prev-close price (for today's % change pill): taken from price history, excluding today's entry, within the last 5 trading days.

---

## Business Logic (`src/utils/calculations.ts`)

### Trade fees and tax

```
buyFee  = Math.floor(price × shares × broker.feeRate × broker.feeDiscount)
sellFee = same formula
sellTax = Math.ceil(price × shares × settings.taxRate)   // default 0.003
```

**Bond ETF exception:** tax = 0 (免稅). Detected by symbol ending in `B` or matching leveraged ETF patterns.

### Portfolio math

```
avgCost     = Math.floor(Σ(price × shares + fee) / Σshares)
netProceeds = sellPrice × shares − sellFee − sellTax
profit      = netProceeds − avgCost × sharesSOLD
```

### Dividends

```
grossAmount        = amountPerShare × shares
healthInsuranceFee = grossAmount >= 20,000 ? Math.round(grossAmount × 0.0211) : 0
netAmount          = grossAmount − healthInsuranceFee − transferFee
```

Monthly attribution uses `exDate` (除息日) when present; falls back to `date` (發放日) for old records.

---

## Authentication & Security

- Google OAuth via Firebase popup flow (`signInWithPopup`).
- Onboarding: Google sign-in first; name input only shown to new accounts (`isNewUser` from `getAdditionalUserInfo`).
- Biometric lock: Web Authentication API (`src/utils/biometric.ts`). Lock state tracked in `sessionStorage` (cleared on tab close = always re-lock). Re-locks after 5 min in background (`visibilitychange`). Unlock session lasts 30 min.

---

## CI/CD

GitHub Actions workflow (`.github/workflows/deploy.yml`) runs on every push to `main`:

1. `npm ci --legacy-peer-deps`
2. `npx tsc --noEmit` — type check
3. `npm test` — Vitest unit tests
4. `npx vercel --prod --yes` — deploy to Vercel production

Deploy is blocked if either type check or tests fail.

---

## Data Types (summary)

```ts
Stock             { id, name, symbol, targetPrice, currentPrice, buys, sells, dividends? }
BuyTransaction    { id, date, price, shares, fee, brokerId?, imported? }
SellTransaction   { id, date, price, shares, fee, tax, profit, netProceeds, brokerId? }
DividendTransaction { id, date, exDate?, amountPerShare, shares, grossAmount,
                      healthInsuranceFee, transferFee, netAmount, note? }
AppSettings       { userName, brokers: Broker[], taxRate, theme?, dividendTransferFee? }
Broker            { id, name, feeRate, feeDiscount }
AppTheme          'default' | 'neutral' | 'dark'
ViewName          'home' | 'activity' | 'holdings' | 'profile' | 'notifications' | 'dividends'
```
