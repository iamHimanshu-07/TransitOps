# 🚚 TransitOps - Smart Transport Operations Platform

> **Smart Transport Operations Platform** — fleet, drivers, trips, maintenance, fuel, expenses, and ROI analytics in one self-contained Node.js app.

[![Tests](https://img.shields.io/badge/tests-30%20passing-brightgreen)]()
[![Node](https://img.shields.io/badge/node-%E2%89%A518-blue)]()
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Stack](https://img.shields.io/badge/stack-Express%20%2B%20SQLite-lightgrey)]()
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

---

## ✨ What is TransitOps?

TransitOps is a single-binary-grade web app for transport businesses. It gives
a small fleet operations team the same workflows a 200-truck carrier would
expect — dispatch, maintenance, fuel, expenses, ROI — without any SaaS lock-in
or monthly bill. Sign in, get a live operations dashboard, dispatch a trip,
close a maintenance ticket, and export your monthly P&L in under a minute.

The whole thing is **one Node.js process + one SQLite file**. No Docker
required, no build step, no bundler. The frontend is vanilla HTML/CSS/JS and
served straight from `public/`.

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

Open **http://localhost:3000** and sign in with one of the demo accounts below.
That's it.

> The SQLite database (`transitops.db`) is auto-created and seeded on first
> run — no extra setup, no migrations to apply.

---

## 🔑 Demo Accounts

| Role | Email | Password |
|---|---|---|
| 🛠️ Fleet Manager | `admin@transitops.com` | `admin123` |
| 🚗 Driver | `alex@transitops.com` | `driver123` |
| 🦺 Safety Officer | `sarah@transitops.com` | `safety123` |
| 💰 Financial Analyst | `felix@transitops.com` | `finance123` |

The **Fleet Manager** is the only role that can manage users. Every other role gets a read-optimized view of the same data.

---

## 🧩 Modules

| Module | Highlights |
|---|---|
| **Auth & RBAC** | JWT in `httpOnly` cookie · 4 roles · bcrypt password hashing |
| **Dashboard** | Live KPIs: vehicles on trip, available, in shop, drivers on duty, fleet utilization % |
| **Vehicles** | Full CRUD with unique reg, max load, odometer, region, cost, status · cascade delete |
| **Drivers** | License, expiry, safety score, status, auto-flagged expired licenses · cascade delete |
| **Trips** | Draft → Dispatched → Completed → Cancelled with transactional state changes |
| **Maintenance** | Auto-flips vehicle *In Shop* on open, restores *Available* on close · delete restores vehicle if no other open records |
| **Fuel & Expenses** | Per-vehicle logs, auto-rollup of operational cost |
| **Analytics** | Fuel efficiency, operational cost, **Vehicle ROI = (Revenue − Maint − Fuel) ÷ Acquisition** |
| **Notifications** | License expiry: already-expired + within 60 days |
| **User management** | Fleet Manager can add/delete users; built-in seed for 4 roles |
| **Exports** | CSV for metrics, print-to-PDF for any view |
| **UI** | Polished white/dark theme toggle, persisted in `localStorage`, single-page, no build step |

---

## 🛡️ Business Rules — Enforced Server-Side

1. Vehicle registration number is **unique**.
2. *Retired* or *In Shop* vehicles never appear in dispatch selection.
3. Drivers with **expired licenses** or *Suspended* status cannot be assigned.
4. A driver or vehicle already *On Trip* cannot take another trip.
5. Cargo weight must **not exceed** the vehicle's max load.
6. Dispatching → both vehicle & driver become *On Trip*.
7. Completing → both become *Available*; odometer and fuel log updated.
8. Cancelling a dispatched trip → both restored to *Available*.
9. Creating maintenance → vehicle becomes *In Shop*.
10. Closing maintenance → vehicle becomes *Available* (unless *Retired*).
11. Deleting a vehicle/driver with history → cascades through trips, fuel logs, expenses, and maintenance. *On-Trip* vehicles/drivers must be cancelled or completed first.
    
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

The suite rebuilds the DB from scratch, then exercises every business rule
end-to-end. Run it after every change — it takes under a second.

---

## 🧱 Tech Stack

- **Backend:** Node.js ≥ 18 (CommonJS) · Express 4
- **DB:** SQLite via `better-sqlite3` (WAL mode, foreign keys on, cascade deletes)
- **Auth:** JWT in `httpOnly` cookie + `bcryptjs` password hashing
- **Frontend:** vanilla HTML/CSS/JS — no bundler, no build step, no framework

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
10. **Delete** a vehicle or driver that has history → it cascades cleanly through trips, fuel, expenses, and maintenance in a single transaction.

---

## 📐 Formulas

| Metric | Formula |
|---|---|
| **Fleet Utilization** | `On-Trip vehicles ÷ Total vehicles × 100` |
| **Fuel Efficiency** | `Σ distance_km ÷ Σ fuel_liters` (per vehicle) |
| **Operational Cost** | `Σ fuel_cost + Σ maintenance_cost + Σ misc_expenses` |
| **Vehicle ROI** | `(revenue − maintenance_cost − fuel_cost) ÷ acquisition_cost × 100` |

---

## 🤝 Contributing

1. Fork the repo.
2. Create a feature branch (`git checkout -b feat/some-thing`).
3. Make your change. **Run `npm test` and confirm all 30 cases still pass.**
4. Commit (`git commit -m "feat: add some-thing"`).
5. Push (`git push origin feat/some-thing`).
6. Open a pull request describing the change and the test evidence.

Please keep PRs small and focused; one feature or fix per PR.

---

## ☁️ Deploying to Render (one-click)

This repo includes a [Render Blueprint](./render.yaml) that provisions the web service **and** a free managed Postgres database (Render's free tier doesn't support persistent disks, so we use Postgres for durable storage).

1. Push these changes to GitHub.
2. Go to **<https://render.com/blueprints>** → **New Blueprint Instance**.
3. Connect the `iamHimanshu-07/TransitOps` repo → Render reads `render.yaml` and creates the service + database, auto-injects `DATABASE_URL`, and auto-generates `JWT_SECRET`.
4. Wait ~3 min for the first build. Once the URL shows 🚚, log in with `admin@transitops.com` / `admin123` and **change the demo password immediately**.

**Manual deploy (no Blueprint):** New → Web Service → connect repo → Build `npm install` · Start `npm start` · Add env `JWT_SECRET` (random hex) · Provision a free Postgres database and add the env `DATABASE_URL` (Render provides this automatically when you link a database to the service).

**Local dev:** runs on SQLite at `./transitops.db` — no env vars, no setup. To test against Postgres locally, set `DATABASE_URL=postgresql://...` and the same `node server.js` will use Postgres instead.

---

## 📄 License

[MIT](./LICENSE) — free for commercial and personal use. Demo passwords are seeded for convenience only.
---

Built with Love. Have a safe trip. 🛣️
