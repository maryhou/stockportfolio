# 股票組合追蹤器 Stock Portfolio Tracker

A responsive stock trading tracker built with React + Vite + TypeScript + Tailwind CSS.

## Live

**[mystockportfolio.vercel.app](https://mystockportfolio.vercel.app)**

## Features

- **Portfolio overview** — gradient value card, realized P&L, net proceeds
- **Holdings page (持倉)** — stock cards emphasising remaining shares, with P&L %, avg cost, current price
- **Activity analysis** — donut chart, per-trade stats, target price alerts (tap to update inline)
- **Add transactions** — buy/sell form with auto-calculated brokerage fee, transaction tax, and live profit preview
- **Responsive layout** — mobile bottom nav, tablet 2-column grids, desktop sidebar (lg+)
- **Persistent storage** — data saved to `localStorage`

## Taiwan market calculations

| Item | Formula |
|------|---------|
| Brokerage fee | `⌊ price × shares × 0.001425 × 0.6 ⌋` |
| Transaction tax (sell) | `⌈ price × shares × 0.003 ⌉` |
| Average cost | `⌊ Σ(price×shares+fee) / Σshares ⌋` |
| Realized profit | `net proceeds − avg cost × shares` |
| Net proceeds | `price × shares − fee − tax` |

## Local development

```bash
npm install
npm run dev       # http://localhost:5174
npm run build     # production build → dist/
```

## Deployment

Connected to Vercel via the native GitHub App integration.

| Event | Result |
|-------|--------|
| Push to `main` | Auto-deploys to [mystockportfolio.vercel.app](https://mystockportfolio.vercel.app) |
| Open a Pull Request | Vercel posts a preview URL on the PR |
| Merge PR | Preview promoted to production |

## Releases

| Version | Highlights |
|---------|-----------|
| [v1.1.0](https://github.com/maryhou/stockportfolio/releases/tag/v1.1.0) | RWD layout, 持倉 holdings page, desktop sidebar |
| [v1.0.0](https://github.com/maryhou/stockportfolio/releases/tag/v1.0.0) | Initial release — TSMC data, buy/sell tracker |
