/**
 * TransitOps - Database layer
 * Pluggable backend: SQLite (local + tests) or Postgres (production on Render).
 * Branches on process.env.DATABASE_URL.
 *
 * Exposes a uniform adapter to operations.js:
 *   db.prepare(sql).get(...args)   -> row | undefined
 *   db.prepare(sql).all(...args)   -> row[]
 *   db.prepare(sql).run(...args)   -> { lastInsertRowid | id, changes }
 *   db.exec(sql)                   -> void
 *   db.transaction(fn)()           -> runs fn() inside BEGIN/COMMIT
 */
const path = require('path');
const fs = require('fs');

const USING_PG = !!process.env.DATABASE_URL;
const bcrypt = require('bcryptjs');

// ============================================================================
// POSTGRES ADAPTER
// ============================================================================
function makePgAdapter(pool) {
  // Identifies whether a SQL string is an INSERT (for RETURNING id).
  const isInsert = (sql) => /^\s*insert\b/i.test(sql);

  // Normalize $1, $2 placeholders to PostgreSQL syntax. The current SQL in
  // operations.js uses '?' placeholders; we rewrite them to $1, $2, ... on the fly.
  function toPgSql(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  function prepare(sql) {
    const pgSql = toPgSql(sql);
    const insertReturning = isInsert(pgSql) && !/\breturning\b/i.test(pgSql);

    return {
      async get(...args) {
        const { rows } = await pool.query(pgSql, args);
        return rows[0];
      },
      async all(...args) {
        const { rows } = await pool.query(pgSql, args);
        return rows;
      },
      async run(...args) {
        if (insertReturning) {
          const r = await pool.query(pgSql + ' RETURNING id', args);
          return { id: r.rows[0]?.id, changes: r.rowCount };
        }
        const r = await pool.query(pgSql, args);
        return { changes: r.rowCount };
      },
    };
  }

  async function exec(sql) {
    // Multi-statement: pg requires a single string per query(). Split on ';'
    // (excluding those inside $$...$$ DO blocks). For our schema this is safe
    // because the init() function will only call exec() with single statements
    // or we can call query() directly.
    await pool.query(sql);
  }

  async function transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Build a per-transaction adapter so all queries inside use THIS client
      // (so they share the transaction's session).
      const txAdapter = {
        prepare(sql) {
          const pgSql = toPgSql(sql);
          const insertReturning = isInsert(pgSql) && !/\breturning\b/i.test(pgSql);
          return {
            async get(...args) {
              const { rows } = await client.query(pgSql, args);
              return rows[0];
            },
            async all(...args) {
              const { rows } = await client.query(pgSql, args);
              return rows;
            },
            async run(...args) {
              if (insertReturning) {
                const r = await client.query(pgSql + ' RETURNING id', args);
                return { id: r.rows[0]?.id, changes: r.rowCount };
              }
              const r = await client.query(pgSql, args);
              return { changes: r.rowCount };
            },
          };
        },
        async exec(sql) { await client.query(sql); },
      };
      // Pass a `tx` adapter as the only argument to fn. operations.js uses
      // this same signature on both backends so it stays driver-agnostic:
      //   await db.transaction(async (tx) => { await tx.prepare(...).get(...) })
      const result = await fn(txAdapter);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  return { prepare, exec, transaction };
}

// ============================================================================
// SQLITE ADAPTER (existing behavior, kept verbatim for local dev + tests)
// ============================================================================
function makeSqliteAdapter() {
  const Database = require('better-sqlite3');
  const DATA_DIR = process.env.DATA_DIR || __dirname;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = path.join(DATA_DIR, 'transitops.db');
  const raw = new Database(DB_PATH);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  // better-sqlite3 is synchronous; we expose the same async-shape API as the
  // Postgres adapter so operations.js stays driver-agnostic. The async
  // transaction wrapper uses explicit BEGIN/COMMIT to correctly bracket
  // awaited async callbacks (the built-in db.transaction() only wraps the
  // synchronous portion of an async function — which is nothing).
  const prepare = (sql) => {
    const stmt = raw.prepare(sql);
    return {
      async get(...args) { return stmt.get(...args); },
      async all(...args) { return stmt.all(...args); },
      async run(...args) {
        const r = stmt.run(...args);
        return { lastInsertRowid: r.lastInsertRowid, changes: r.changes, id: r.lastInsertRowid };
      },
    };
  };

  return {
    prepare,
    async exec(sql) { raw.exec(sql); },
    async transaction(fn) {
      raw.exec('BEGIN');
      try {
        // The PG adapter passes a `tx` adapter as the only argument; mirror
        // that here so operations.js can use the same code on both backends.
        const result = await fn({
          prepare: (sql) => {
            const stmt = raw.prepare(sql);
            return {
              async get(...args) { return stmt.get(...args); },
              async all(...args) { return stmt.all(...args); },
              async run(...args) {
                const r = stmt.run(...args);
                return { lastInsertRowid: r.lastInsertRowid, changes: r.changes, id: r.lastInsertRowid };
              },
            };
          },
          async exec(sql) { raw.exec(sql); },
        });
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    close() { raw.close(); },
    _raw: raw,
  };
}

// ============================================================================
// SCHEMA
// ============================================================================
const SCHEMA_SQLITE = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('Fleet Manager','Driver','Safety Officer','Financial Analyst')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reg_no TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    max_load_kg REAL NOT NULL,
    odometer_km REAL NOT NULL DEFAULT 0,
    acquisition_cost REAL NOT NULL DEFAULT 0,
    region TEXT DEFAULT 'Central',
    status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','On Trip','In Shop','Retired')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    license_no TEXT UNIQUE NOT NULL,
    license_category TEXT NOT NULL,
    license_expiry TEXT NOT NULL,
    contact TEXT NOT NULL,
    safety_score REAL NOT NULL DEFAULT 80.0,
    status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','On Trip','Off Duty','Suspended')),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    vehicle_id INTEGER NOT NULL,
    driver_id INTEGER NOT NULL,
    cargo_kg REAL NOT NULL,
    planned_distance_km REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Dispatched','Completed','Cancelled')),
    start_odometer REAL,
    end_odometer REAL,
    fuel_used_liters REAL,
    revenue REAL DEFAULT 0,
    dispatched_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS maintenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    end_date TEXT,
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Closed')),
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS fuel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL,
    trip_id INTEGER,
    liters REAL NOT NULL,
    cost REAL NOT NULL,
    log_date TEXT NOT NULL,
    odometer_km REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER,
    trip_id INTEGER,
    category TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    expense_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
    FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    target_id INTEGER,
    created_at TEXT NOT NULL,
    read INTEGER NOT NULL DEFAULT 0
  );
`;

// Postgres equivalent. Dates remain TEXT; AUTOINCREMENT becomes SERIAL; CHECK
// and FK syntax is identical. CREATE TABLE IF NOT EXISTS is rewritten as
// per-table DO blocks (Postgres <16 needs the IF NOT EXISTS inside DO; 16+
// supports it natively but the DO form is universally compatible).
const SCHEMA_PG_TABLES = [
  `users(id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
         password_hash TEXT NOT NULL,
         role TEXT NOT NULL CHECK (role IN ('Fleet Manager','Driver','Safety Officer','Financial Analyst')),
         created_at TEXT NOT NULL)`,
  `vehicles(id SERIAL PRIMARY KEY, reg_no TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            type TEXT NOT NULL, max_load_kg REAL NOT NULL,
            odometer_km REAL NOT NULL DEFAULT 0,
            acquisition_cost REAL NOT NULL DEFAULT 0, region TEXT DEFAULT 'Central',
            status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','On Trip','In Shop','Retired')),
            created_at TEXT NOT NULL)`,
  `drivers(id SERIAL PRIMARY KEY, name TEXT NOT NULL, license_no TEXT UNIQUE NOT NULL,
           license_category TEXT NOT NULL, license_expiry TEXT NOT NULL,
           contact TEXT NOT NULL, safety_score REAL NOT NULL DEFAULT 80.0,
           status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available','On Trip','Off Duty','Suspended')),
           created_at TEXT NOT NULL)`,
  `trips(id SERIAL PRIMARY KEY, source TEXT NOT NULL, destination TEXT NOT NULL,
         vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
         driver_id INTEGER NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
         cargo_kg REAL NOT NULL, planned_distance_km REAL NOT NULL,
         status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','Dispatched','Completed','Cancelled')),
         start_odometer REAL, end_odometer REAL, fuel_used_liters REAL,
         revenue REAL DEFAULT 0, dispatched_at TEXT, completed_at TEXT,
         created_at TEXT NOT NULL)`,
  `maintenance(id SERIAL PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
               description TEXT NOT NULL, cost REAL NOT NULL DEFAULT 0,
               start_date TEXT NOT NULL, end_date TEXT,
               status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Closed')),
               notes TEXT, created_at TEXT NOT NULL)`,
  `fuel_logs(id SERIAL PRIMARY KEY, vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
             trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
             liters REAL NOT NULL, cost REAL NOT NULL, log_date TEXT NOT NULL,
             odometer_km REAL, created_at TEXT NOT NULL)`,
  `expenses(id SERIAL PRIMARY KEY, vehicle_id INTEGER REFERENCES vehicles(id) ON DELETE CASCADE,
            trip_id INTEGER REFERENCES trips(id) ON DELETE SET NULL,
            category TEXT NOT NULL, description TEXT, amount REAL NOT NULL,
            expense_date TEXT NOT NULL, created_at TEXT NOT NULL)`,
  `notifications(id SERIAL PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL,
                 target_id INTEGER, created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0)`,
];

function pgCreateTableSql(tableDef) {
  return `CREATE TABLE IF NOT EXISTS ${tableDef}`;
}

// ============================================================================
// INIT
// ============================================================================
let db;             // adapter (synchronous SQLite) or {prepare, exec, transaction} (async PG)
let dbDriver;       // 'sqlite' | 'pg' — set after init
let pgPool;         // the PG pool, only set in PG mode

async function init() {
  if (USING_PG) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    db = makePgAdapter(pgPool);
    dbDriver = 'pg';
    for (const t of SCHEMA_PG_TABLES) {
      await db.exec(pgCreateTableSql(t));
    }
  } else {
    db = makeSqliteAdapter();
    dbDriver = 'sqlite';
    db.exec(SCHEMA_SQLITE);
  }

  // Seed if empty
  const r = await db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (r.c === 0) await seed();
  await recomputeLicenseNotifications();
}

// ============================================================================
// SEED
// ============================================================================
async function seed() {
  const now = new Date().toISOString().slice(0, 19);
  const hash = (pw) => bcrypt.hashSync(pw, 10);

  const today = new Date();
  const days = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };

  const users = [
    ['Admin Fleet', 'admin@transitops.com', 'admin123', 'Fleet Manager'],
    ['Alex Driver', 'alex@transitops.com', 'driver123', 'Driver'],
    ['Sarah Safety', 'sarah@transitops.com', 'safety123', 'Safety Officer'],
    ['Felix Finance', 'felix@transitops.com', 'finance123', 'Financial Analyst'],
  ];
  for (const [n, e, p, r] of users) {
    await db.prepare(
      'INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)'
    ).run(n, e, hash(p), r, now);
  }

  const vehicles = [
    ['VAN-05', 'Van-05 Transit', 'Van', 500, 12500, 18000, 'Central', 'Available'],
    ['TRK-12', 'Tata LPT 1109', 'Truck', 2500, 45200, 78000, 'North', 'Available'],
    ['VAN-09', 'Mahindra Supro', 'Van', 750, 8900, 22000, 'South', 'Available'],
    ['TRK-21', 'Ashok Leyland 2820', 'Truck', 5000, 78100, 145000, 'West', 'In Shop'],
    ['CAR-03', 'Toyota Etios', 'Car', 400, 32000, 9500, 'Central', 'Available'],
  ];
  for (const v of vehicles) {
    await db.prepare(
      `INSERT INTO vehicles
       (reg_no,name,type,max_load_kg,odometer_km,acquisition_cost,region,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).run(...v, now);
  }

  const drivers = [
    ['Alex Kumar', 'DL-042018', 'LMV', days(300), '+91-9876500011', 88.5, 'Available'],
    ['Ravi Sharma', 'DL-072021', 'HMV', days(45), '+91-9876500022', 76.0, 'Available'],
    ['Priya Singh', 'DL-112019', 'LMV', days(-5), '+91-9876500033', 92.0, 'Off Duty'],
    ['Mohammed Ali', 'DL-092022', 'HMV', days(720), '+91-9876500044', 81.0, 'Available'],
    ['Neha Verma', 'DL-052020', 'LMV', days(15), '+91-9876500055', 70.0, 'Suspended'],
  ];
  for (const d of drivers) {
    await db.prepare(
      `INSERT INTO drivers
       (name,license_no,license_category,license_expiry,contact,safety_score,status,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(...d, now);
  }

  const trk21 = (await db.prepare("SELECT id FROM vehicles WHERE reg_no='TRK-21'").get()).id;
  await db.prepare(
    `INSERT INTO maintenance
     (vehicle_id,description,cost,start_date,end_date,status,notes,created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  ).run(trk21, 'Brake Pad Replacement', 8500, days(0), null, 'Open',
        'Reported squeaking noise during last trip.', now);

  const van5 = (await db.prepare("SELECT id FROM vehicles WHERE reg_no='VAN-05'").get()).id;
  const alex = (await db.prepare("SELECT id FROM drivers WHERE license_no='DL-042018'").get()).id;
  const dispAt = new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().slice(0, 19);
  const compAt = new Date(Date.now() - 10 * 24 * 3600 * 1000 + 6 * 3600 * 1000).toISOString().slice(0, 19);
  const tripRes = await db.prepare(
    `INSERT INTO trips
     (source,destination,vehicle_id,driver_id,cargo_kg,planned_distance_km,status,
      start_odometer,end_odometer,fuel_used_liters,revenue,dispatched_at,completed_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run('Mumbai Warehouse', 'Pune Depot', van5, alex, 420, 180, 'Completed',
        12000, 12180, 22.5, 12500, dispAt, compAt, dispAt);
  // SQLite returns lastInsertRowid, PG adapter returns {id}. Normalize:
  const tripId = tripRes.lastInsertRowid ?? tripRes.id;

  await db.prepare(
    `INSERT INTO fuel_logs
     (vehicle_id,trip_id,liters,cost,log_date,odometer_km,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(van5, tripId, 22.5, 2812.5, days(0), 12180, now);

  await db.prepare(
    `INSERT INTO expenses
     (vehicle_id,category,description,amount,expense_date,created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(van5, 'Toll', 'Mumbai-Pune Expressway toll', 380, days(0), now);
  await db.prepare(
    `INSERT INTO expenses
     (vehicle_id,category,description,amount,expense_date,created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(van5, 'Misc', 'Driver allowance', 500, days(0), now);
}

// ============================================================================
// NOTIFICATIONS / AUTH
// ============================================================================
async function recomputeLicenseNotifications() {
  await db.prepare("DELETE FROM notifications WHERE kind = 'license_expiry'").run();
  const drivers = await db.prepare('SELECT id,name,license_no,license_expiry FROM drivers').all();
  const today = new Date();
  const now = new Date().toISOString().slice(0, 19);
  for (const d of drivers) {
    const exp = new Date(d.license_expiry);
    const delta = Math.floor((exp - today) / (1000 * 3600 * 24));
    if (delta < 0) {
      await db.prepare(
        `INSERT INTO notifications (kind,message,target_id,created_at,read)
         VALUES (?,?,?,?,0)`
      ).run('license_expiry',
        `EXPIRED: ${d.name} (${d.license_no}) — expired ${-delta} days ago.`,
        d.id, now);
    } else if (delta <= 60) {
      await db.prepare(
        `INSERT INTO notifications (kind,message,target_id,created_at,read)
         VALUES (?,?,?,?,0)`
      ).run('license_expiry',
        `Expiring soon: ${d.name} (${d.license_no}) — expires in ${delta} days.`,
        d.id, now);
    }
  }
}

async function verifyUser(email, password) {
  const u = await db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!u) return null;
  if (!bcrypt.compareSync(password, u.password_hash)) return null;
  const { password_hash, ...safe } = u;
  return safe;
}

module.exports = {
  get db() { return db; },
  get driver() { return dbDriver; },
  init,
  verifyUser,
  recomputeLicenseNotifications,
  // For tests: hard reset (drops + recreates all tables)
  async _reset() {
    if (dbDriver === 'pg') {
      await pgPool.query('TRUNCATE users, vehicles, drivers, trips, maintenance, fuel_logs, expenses, notifications RESTART IDENTITY CASCADE');
    } else {
      db.close();
      for (const ext of ['', '-wal', '-shm']) {
        const p = path.join(process.env.DATA_DIR || __dirname, 'transitops.db') + ext;
        if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
      }
    }
  },
};
