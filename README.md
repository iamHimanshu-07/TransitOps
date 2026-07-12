# 🚚 TransitOps

> Smart Transport Operations Platform — fleet, drivers, trips, maintenance, fuel, expenses, and ROI analytics in one self-contained Node.js app.

[![Tests](https://img.shields.io/badge/tests-30%20passing-brightgreen)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-blue)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stack](https://img.shields.io/badge/stack-Express%20%2B%20SQLite-lightgrey)]()

---

## ⚡ 60-Second Quick Start

```bash
# 1. Get the code
git clone https://github.com/iamHimanshu-07/TransitOps-Smart-Transport-Operations-Platform.git
cd TransitOps-Smart-Transport-Operations-Platform

# 2. Install
npm install

# 3. Run
npm start
```

Open **http://localhost:3000** and sign in with one of the demo accounts below. That's it.

> The SQLite database (`transitops.db`) is auto-created and seeded on first run — no extra setup.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| 🛠️ Fleet Manager | `admin@transitops.com` | `admin123` |
| 🚗 Driver | `alex@transitops.com` | `driver123` |
| 🦺 Safety Officer | `sarah@transitops.com` | `safety123` |
| 💰 Financial Analyst | `felix@transitops.com` | `finance123` |

---

## ✨ What You Get

| Module | Highlights |
|---|---|
| **Auth & RBAC** | JWT in `httpOnly` cookie · 4 roles · password hashing with bcrypt |
| **Dashboard** | Live KPIs: vehicles on trip, available, in shop, drivers on duty, fleet utilization % |
| **Vehicles** | CRUD with unique reg, max load, odometer, region, cost, status |
| **Drivers** | License, expiry, safety score, status, auto-flagged expired licenses |
| **Trips** | Draft → Dispatched → Completed → Cancelled with transactional state changes |
| **Maintenance** | Auto-flips vehicle *In Shop* on open, restores *Available* on close |
| **Fuel & Expenses** | Per-vehicle logs, auto-rollup of operational cost |
| **Analytics** | Fuel efficiency, operational cost, **Vehicle ROI = (Revenue − Maint − Fuel) ÷ Acquisition** |
| **Notifications** | License expiry: already-expired + within 60 days |
| **Exports** | CSV for metrics, print-to-PDF for any view |
| **UI** | Light/dark mode, persisted in `localStorage`, single-page, no build step |

---

## 🛡️ Business Rules — Enforced Server-Side

1. Vehicle registration number is **unique**.
2. *Retired* or *In Shop* vehicles never appear in dispatch selection.
3. Drivers with **expired licenses** or *Suspended* status cannot be assigned.
4. A driver or vehicle already *On Trip* cannot take another trip.
5. Cargo weight must **not exceed** the vehicle's max load.
6. Dispatching → both vehicle & driver become *On Trip*.
7. Completing → both become *Available*.
8. Cancelling a dispatched trip → both restored to *Available*.
9. Creating maintenance → vehicle becomes *In Shop*.
10. Closing maintenance → vehicle becomes *Available* (unless *Retired*).

---

## 🧪 Verify It Works

```bash
npm test
```

Output:

```
============================================================
 TransitOps Business-Rules Smoke Test (Node.js)
============================================================
[A]  Auth                                      ✅ ✅ ✅
[1]  Happy-path Van-05 / Alex / 450 kg         ✅ × 9
[2]  Reject cargo > max load                   ✅
[3]  Reject expired-license driver             ✅
[4]  Reject suspended driver                   ✅
[5]  Reject In-Shop vehicle                    ✅
[6]  Reject On-Trip driver                     ✅ ✅
[7]  Maintenance → In Shop                     ✅
[8]  Close maintenance → Available             ✅
[9]  Cancel Dispatched trip                    ✅ × 4
[10] Duplicate reg_no rejected                 ✅
[11] Dashboard KPIs                            ✅ ✅
[12] Vehicle metrics                           ✅ ✅
[13] License-expiry notifications              ✅

 Results: 30 passed, 0 failed
============================================================
```

The suite rebuilds the DB from scratch, then exercises every business rule end-to-end.

---

## 🧱 Tech Stack

- **Node.js** ≥ 18 (CommonJS) · **Express 4**
- **SQLite** via `better-sqlite3` (WAL mode, foreign keys on)
- **JWT** in `httpOnly` cookie + **bcryptjs** password hashing
- **Frontend:** vanilla HTML/CSS/JS — no bundler, no build step

---

## 🔧 Configuration

Set via environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `JWT_SECRET` | `transitops-dev-secret-change-me` | **Set this in production** |

Example:

```bash
PORT=8080 JWT_SECRET=$(openssl rand -hex 32) npm start
```

---

## 📂 Project Structure

```
TransitOps-Smart-Transport-Operations-Platform/
├── server.js              # Express server + REST API
├── database.js            # better-sqlite3 schema, auth, seed
├── operations.js          # Business logic + validations
├── test_business_rules.js # 30-case end-to-end smoke test
├── public/                # Static frontend
│   ├── index.html
│   ├── style.css
│   └── app.js
├── package.json
├── .gitignore             # node_modules, transitops.db, .env
└── LICENSE                # MIT
```

`transitops.db` (and its `-wal` / `-shm` sidecars) are created at runtime and git-ignored.

---

## 🔁 Walk-Through: A Complete Trip

1. **Sign in** as Fleet Manager.
2. Open **Vehicles** → confirm `VAN-05` exists, status *Available*, max load 500 kg.
3. Open **Drivers** → confirm `Alex Kumar` exists, license valid.
4. **Trips** → New → Source `Mumbai`, Destination `Pune`, Vehicle `VAN-05`, Driver `Alex`, Cargo `450` kg → Save (status: *Draft*).
5. **Dispatch** → vehicle and driver flip to *On Trip*.
6. **Complete** with end odometer `12680`, fuel `23` L, revenue `13000` → both flip back to *Available*, odometer updated.
7. **Maintenance** → New for `VAN-05` → vehicle flips to *In Shop*.
8. **Close maintenance** → vehicle flips back to *Available*.
9. **Reports** → VAN-05 now shows distance, fuel efficiency, operational cost, and ROI.

---

## 🔌 REST API

All endpoints (except `POST /api/auth/login`) require auth via the `token` cookie
or `Authorization: Bearer <token>` header.

### Auth
| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/login` | `{ email, password }` → `{ user, token }` + sets cookie |
| `POST` | `/api/auth/logout` | Clears cookie |
| `GET`  | `/api/auth/me` | Current user |

### Users (Fleet Manager only)
`GET /api/users` · `POST /api/users` · `DELETE /api/users/:id`

### Vehicles
`GET /api/vehicles?type=&status=&region=` · `GET /api/vehicles/:id` · `POST /api/vehicles` · `PUT /api/vehicles/:id` · `DELETE /api/vehicles/:id`

### Drivers
`GET /api/drivers?status=` · `GET /api/drivers/:id` · `POST /api/drivers` · `PUT /api/drivers/:id` · `DELETE /api/drivers/:id`

### Trips
`GET /api/trips?status=` · `POST /api/trips` · `POST /api/trips/:id/dispatch` · `POST /api/trips/:id/complete` · `POST /api/trips/:id/cancel`

### Maintenance
`GET /api/maintenance?vehicle_id=` · `POST /api/maintenance` · `POST /api/maintenance/:id/close` · `DELETE /api/maintenance/:id`

### Fuel & Expenses
`GET /api/fuel?vehicle_id=` · `POST /api/fuel` · `GET /api/expenses?vehicle_id=` · `POST /api/expenses`

### Analytics
`GET /api/kpis` · `GET /api/metrics` · `GET /api/notifications` · `POST /api/notifications/read-all`

All `POST` handlers return `{ ok: true, message }` on success or `400 { error }` on validation failure.

---

## 📐 Formulas

| Metric | Formula |
|---|---|
| **Fleet Utilization** | `On-Trip vehicles ÷ Total vehicles × 100` |
| **Fuel Efficiency** | `Σ distance_km ÷ Σ fuel_liters` (per vehicle) |
| **Operational Cost** | `Σ fuel_cost + Σ maintenance_cost + Σ misc_expenses` |
| **Vehicle ROI** | `(revenue − maintenance_cost − fuel_cost) ÷ acquisition_cost × 100` |

---

## 🛠️ Common Tasks

**Reset the database to a clean seed:**
```bash
rm -f transitops.db transitops.db-wal transitops.db-shm
npm start
```

**Run only the tests:**
```bash
npm test
```

**Production start (set a real secret!):**
```bash
JWT_SECRET=$(openssl rand -hex 32) npm start
```

**Behind a reverse proxy (nginx, Caddy, etc.):**
Set `X-Forwarded-For` trust on Express if you later add rate-limiting by IP. Currently no rate-limit middleware is included.

---

## 🩺 Troubleshooting

| Symptom | Fix |
|---|---|
| `EADDRINUSE :::3000` on `npm start` | Another process is on port 3000. Run `PORT=3001 npm start` or stop the other process. |
| `better-sqlite3` install fails on Linux | You need `python3` and a C/C++ toolchain. On Debian/Ubuntu: `sudo apt install build-essential python3`. |
| `npm test` complains about a locked DB | Stop any running `npm start` instance — the test harness deletes and recreates the DB file. |
| Login returns 401 | Make sure you're using the seeded emails exactly (lowercase, no extra spaces). |
| Stale UI after editing `public/` | Hard refresh (Ctrl+Shift+R) — no bundler means no automatic cache busting. |

---

## 🗺️ Roadmap

- Postgres adapter for multi-tenant deployments
- Audit log for every trip status transition
- Server-rendered PDF (e.g. `pdfkit`) instead of browser print
- Dockerfile + `docker-compose.yml` for one-command startup
- Rate limiting and request validation middleware (e.g. `zod`)

---

## 📄 License

[MIT](./LICENSE) — free for commercial and personal use. Demo passwords are
seeded for convenience only; rotate them (or remove the seed) before any
non-local deployment.

---

Built with Node.js + SQLite. Have a safe trip. 🛣️
