# 🚚 TransitOps — Smart Transport Operations Platform

A responsive, modern, **strict dark-mode** web application for fleet, drivers, trips, maintenance, fuel/expenses, analytics, and RBAC control.

Built by **Vaelos** · 2026

---

## ▶ Quick Start

The frontend is a static SPA — no build step required.

### Option A — Open directly
Open `public/index.html` in any modern browser.

### Option B — Serve with a simple HTTP server (recommended)
```bash
# Python 3
cd public
python -m http.server 5500
# then open http://localhost:5500
```
or
```bash
# Node (npx)
npx serve public -l 5500
```

---

## 🔐 Demo Login

| Field    | Value                  |
|----------|------------------------|
| Email    | `raven@transitops.com` |
| Password | `demo123`              |
| Role     | any of the 4 options   |

Wrong credentials trigger the red-dotted "Error state: Invalid credentials" alert box.

---

## 🎨 Theme Tokens

| Token            | Value      | Use                                      |
|------------------|------------|------------------------------------------|
| `--bg-canvas`    | `#121212`  | App canvas (deep charcoal)               |
| `--bg-panel`     | `#1E1E1E`  | Cards, tables, sidebar, topbar           |
| `--primary`      | `#E07A5F`  | Primary buttons, active nav border       |
| `--success`      | `#81B29A`  | Available, Completed, On Duty            |
| `--info`         | `#3D5A80`  | On Trip, Dispatched, view-permission     |
| `--warning`      | `#F2A65A`  | Suspended, In Shop                       |
| `--error`        | `#E63946`  | Retired, alert banners                   |

---

## 🗂 Implemented Views

| # | View                     | Highlights                                                                       |
|---|--------------------------|----------------------------------------------------------------------------------|
| 0 | **Auth (split-screen)**  | Light-gray brand panel · dark login card · role dropdown · red dotted error      |
| 1 | **Dashboard**            | 7 KPI cards · Recent Trips table · Vehicle Status horizontal multi-color bars    |
| 2 | **Fleet Registry**       | Type/Status filters · search · "+ Add Vehicle" · 7-column table                  |
| 3 | **Drivers**              | License expiry with red "EXPIRED" · 4 color-coded toggle blocks                  |
| 4 | **Trips (Dispatcher)**   | Capacity alert blocks dispatch when weight > vehicle max · Live Board stepper    |
| 5 | **Maintenance**          | Left form · right service log table with dynamic row badges                      |
| 6 | **Fuel & Expenses**      | Fuel logs + other expenses + auto "Total Operational Cost" summary line         |
| 7 | **Analytics**            | 4 metric cards · Monthly Revenue vertical bars · Top Costliest horizontal stacked |
| 8 | **Settings + RBAC**      | General settings form · RBAC matrix grid (5 features × 4 roles)                  |

---

## 📁 Project Layout

```
TransitOps/
├── public/
│   ├── index.html    # single-page app shell
│   ├── style.css     # strict dark-mode theme + all view styles
│   └── app.js        # SPA logic, mock data, all 8 view renderers
└── README.md
```

---

## 🧠 Architectural Notes

- **Vanilla JS, no build step** — drop-in ready for any backend.
- **Mock data lives in `DATA`** inside `app.js`. Swap each `DATA.*` fetch with real `fetch('/api/...')` calls when wiring a backend.
- **Role-aware session** — topbar pill (`Dispatcher [RX]`, `Fleet Manager [RX]`, etc.) reflects the role chosen at login.
- **RBAC matrix** is rendered from a single source of truth (`DATA.rbac`) — easy to update without touching layout.
- **Responsive** — sidebar collapses below 720 px; KPI grids reflow 7→4→2 columns; analytics grid reflows to single column.

---

## 🔌 Wiring a Real Backend (optional)

Replace each mock reference with a `fetch` call, e.g.:

```js
const vehicles = await fetch('/api/vehicles').then(r => r.json());
```

The table renderers accept any object with the same shape (`reg`, `name`, `type`, `capacity`, `odometer`, `cost`, `status`).

---

© 2026 Vaelos · TransitOps
