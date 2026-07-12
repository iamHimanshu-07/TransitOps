# 🚚 TransitOps — Smart Transport Operations Platform

A complete end-to-end **Node.js / Express** transport operations platform with
SQLite persistence, JWT authentication, role-based access control, and a
polished single-page frontend (light + dark mode).

## ✨ Features

| Area | What's included |
|---|---|
| **Auth & RBAC** | Login + JWT in httpOnly cookie, 4 roles (Fleet Manager, Driver, Safety Officer, Financial Analyst) |
| **Dashboard** | KPIs: Active/Available/In-Shop vehicles, Active/Pending trips, Drivers on Duty, Fleet Utilization % |
| **Vehicle Registry** | CRUD with unique reg, max load, odometer, cost, region, status |
| **Driver Management** | License, expiry, safety score, status, auto-flagged expired licenses |
| **Trip Management** | Draft → Dispatched → Completed → Cancelled, full validations |
| **Maintenance** | Auto-flips vehicle to *In Shop*; closing restores to *Available* (unless Retired) |
| **Fuel & Expenses** | Liters/cost logs, tolls/misc; auto-compute operational cost per vehicle |
| **Reports & Analytics** | Fuel efficiency, operational cost, **Vehicle ROI = (Revenue − (Maint+Fuel))/Acquisition** |
| **CSV export** | Per-vehicle metrics |
| **PDF export** | Printable HTML → "Save as PDF" via browser |
| **Notifications** | License expiry reminders (expired + within 60 days) |
| **Light / Dark mode** | Toggle, persisted in localStorage |

## 🛡️ Business Rules (all enforced server-side)

1. Vehicle registration number is unique
2. Retired or In Shop vehicles never appear in dispatch selection
3. Drivers with expired licenses or *Suspended* status cannot be assigned
4. A driver or vehicle already marked *On Trip* cannot take another trip
5. Cargo weight must not exceed the vehicle's max load
6. Dispatching a trip → both vehicle & driver become *On Trip*
7. Completing a trip → both become *Available*
8. Cancelling a dispatched trip → both restored to *Available*
9. Creating active maintenance → vehicle becomes *In Shop*
10. Closing maintenance → vehicle becomes *Available* (unless *Retired*)

## 🚀 Quick Start

```bash
cd "C:/Users/Lenovo/TransitOps"
npm install
npm run init-db    # creates transitops.db + seeds demo data
npm start          # starts server on http://localhost:3000
```

Then open **http://localhost:3000** in your browser.

## 👤 Demo Accounts

| Role | Email | Password |
|---|---|---|
| Fleet Manager | admin@transitops.com | admin123 |
| Driver | alex@transitops.com | driver123 |
| Safety Officer | sarah@transitops.com | safety123 |
| Financial Analyst | felix@transitops.com | finance123 |

## 🧪 Run Business-Rules Tests

```bash
npm test
```

The test suite exercises every business rule and prints PASS/FAIL per case.

## 📂 Project Structure

```
TransitOps/
├── server.js              # Express server + REST API
├── database.js            # better-sqlite3 schema, auth, seed
├── operations.js          # Business logic, validations, status transitions
├── test_business_rules.js # End-to-end smoke test
├── public/                # Static frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── transitops.db          # SQLite (auto-created)
└── package.json
```

## 🔁 Example Workflow (Van-05 / Alex / 450 kg)

1. Register `VAN-05` (500 kg max) — status: Available
2. Register `Alex` with valid license
3. Create a trip with 450 kg cargo
4. System validates 450 ≤ 500 and creates Draft
5. **Dispatch** → Vehicle + Driver both become *On Trip*
6. **Complete** with final odometer + fuel consumed → both *Available*
7. Create **Maintenance** record (e.g., Oil Change) → Vehicle → *In Shop*
8. **Close maintenance** → Vehicle → *Available*
9. **Reports** show updated operational cost and fuel efficiency

## 🔌 REST API (selected)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Login → returns user + JWT |
| GET  | `/api/vehicles?type=...&status=...&region=...` | List vehicles |
| POST | `/api/vehicles` | Create vehicle |
| PUT  | `/api/vehicles/:id` | Update vehicle |
| GET  | `/api/drivers` | List drivers |
| POST | `/api/trips` | Create trip (Draft) — validates all rules |
| POST | `/api/trips/:id/dispatch` | Dispatch (auto-flips statuses) |
| POST | `/api/trips/:id/complete` | Complete (restores statuses, logs fuel) |
| POST | `/api/trips/:id/cancel` | Cancel (restores statuses if Dispatched) |
| POST | `/api/maintenance` | Open maintenance (auto In Shop) |
| POST | `/api/maintenance/:id/close` | Close maintenance (restores Available) |
| GET  | `/api/fuel` / `/api/expenses` | Logs |
| GET  | `/api/metrics` | Per-vehicle fuel efficiency, cost, ROI |
| GET  | `/api/notifications` | License expiry notifications |
