# 股票組合追蹤器 Stock Portfolio Tracker

A mobile-first stock trading tracker built with React + Vite + TypeScript + Tailwind CSS.

## Live

**[mystockportfolio.vercel.app](https://mystockportfolio.vercel.app)**

## Features

- **Portfolio overview** — total value card, realized P&L, net proceeds
- **Activity analysis** — donut chart, per-trade statistics, target price alerts
- **Add transactions** — buy/sell form with auto-calculated fees, taxes, and profit preview
- **Persistent storage** — data saved to localStorage
- **Taiwan market calculations**:
  - Brokerage fee: 0.1425% × 60% discount, floor
  - Transaction tax (sell only): 0.3%, ceiling
  - Average cost: floor(Σ cost+fee / Σ shares)
  - Realized profit: net proceeds − avg cost × shares

## Local development

```bash
npm install
npm run dev       # http://localhost:5174
npm run build     # production build → dist/
```

## Deployment

This repo is connected to Vercel natively via the Vercel GitHub App.

| Event | Result |
|-------|--------|
| Push to `main` | Auto-deploys to [mystockportfolio.vercel.app](https://mystockportfolio.vercel.app) |
| Open a Pull Request | Vercel creates a preview URL for that PR |
| Merge PR to `main` | Preview promoted to production |

No secrets or manual steps needed — Vercel monitors the repo directly.
