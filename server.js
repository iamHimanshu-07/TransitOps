/**
 * TransitOps - Express server
 * Serves the static frontend and a JSON API for all operations.
 */
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { init, verifyUser, recomputeLicenseNotifications } = require('./database');
const ops = require('./operations');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: JWT_SECRET is required in production. Set it in Render → Environment.');
    process.exit(1);
  }
  console.warn('WARNING: JWT_SECRET not set — using insecure dev fallback. Do NOT use this in production.');
}
const JWT_SECRET_FINAL = JWT_SECRET || 'transitops-dev-secret-change-me';

const app = express();
app.use(express.json());
app.use(cookieParser());

// Initialize the database before the first request is served.
// On Render cold-start this also seeds the DB on the very first boot.
(async () => {
  try {
    await init();
    await recomputeLicenseNotifications();
  } catch (e) {
    console.error('FATAL: DB init failed:', e);
    setTimeout(() => process.exit(1), 500); // small delay so logs flush
  }
})();

function authRequired(req, res, next) {
  const token = req.cookies?.token ||
                (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET_FINAL);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

app.get('/healthz', async (req, res) => {
    try {
      // Touch the DB to prove the connection is live.
      await require('./database').db.prepare('SELECT 1 AS ok').get();
      res.json({ ok: true });
    } catch (e) {
      res.status(503).json({ ok: false, error: e.message });
    }
});

// Temporary diagnostic — confirms DB driver + table row counts.
// Remove after verifying the deployment is healthy.
app.get('/api/_debug', authRequired, async (req, res) => {
  try {
    const { db, driver } = require('./database');
    const tables = ['users','vehicles','drivers','trips','maintenance','fuel_logs','expenses','notifications'];
    const counts = {};
    for (const t of tables) {
      counts[t] = (await db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get()).c;
    }
    res.json({
      driver,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      databaseUrlHost: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).host : null,
      counts,
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------------- AUTH ----------------------------- //
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const user = await verifyUser(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET_FINAL,
    { expiresIn: '12h' }
  );
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  res.json({ user, token });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// ----------------------------- USERS ----------------------------- //
app.get('/api/users', authRequired, requireRole('Fleet Manager'), async (req, res) => {
  res.json(await ops.listUsers());
});
app.post('/api/users', authRequired, requireRole('Fleet Manager'), async (req, res) => {
  try { await ops.addUser(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/users/:id', authRequired, requireRole('Fleet Manager'), async (req, res) => {
  await ops.deleteUser(+req.params.id); res.json({ ok: true });
});

// ----------------------------- VEHICLES ----------------------------- //
app.get('/api/vehicles', authRequired, async (req, res) => {
  res.json(await ops.listVehicles(req.query));
});
app.get('/api/vehicles/:id', authRequired, async (req, res) => {
  const v = await ops.getVehicle(+req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});
app.post('/api/vehicles', authRequired, async (req, res) => {
  try { await ops.addVehicle(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/vehicles/:id', authRequired, async (req, res) => {
  try { await ops.updateVehicle(+req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/vehicles/:id', authRequired, async (req, res) => {
  try { const r = await ops.deleteVehicle(+req.params.id); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- DRIVERS ----------------------------- //
app.get('/api/drivers', authRequired, async (req, res) => res.json(await ops.listDrivers(req.query)));
app.get('/api/drivers/:id', authRequired, async (req, res) => {
  const d = await ops.getDriver(+req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});
app.post('/api/drivers', authRequired, async (req, res) => {
  try { await ops.addDriver(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/drivers/:id', authRequired, async (req, res) => {
  try { await ops.updateDriver(+req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/drivers/:id', authRequired, async (req, res) => {
  try { const r = await ops.deleteDriver(+req.params.id); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- TRIPS ----------------------------- //
app.get('/api/trips', authRequired, async (req, res) => res.json(await ops.listTrips(req.query)));
app.post('/api/trips', authRequired, async (req, res) => {
  const [ok, msg] = await ops.createTrip(req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/dispatch', authRequired, async (req, res) => {
  const [ok, msg] = await ops.dispatchTrip(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/complete', authRequired, async (req, res) => {
  const [ok, msg] = await ops.completeTrip(+req.params.id, req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/cancel', authRequired, async (req, res) => {
  const [ok, msg] = await ops.cancelTrip(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});

// ----------------------------- MAINTENANCE ----------------------------- //
app.get('/api/maintenance', authRequired, async (req, res) => {
  res.json(await ops.listMaintenance(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/maintenance', authRequired, async (req, res) => {
  const [ok, msg] = await ops.createMaintenance(req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/maintenance/:id/close', authRequired, async (req, res) => {
  const [ok, msg] = await ops.closeMaintenance(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.delete('/api/maintenance/:id', authRequired, async (req, res) => {
  try { const r = await ops.deleteMaintenance(+req.params.id); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- FUEL & EXPENSES ----------------------------- //
app.get('/api/fuel', authRequired, async (req, res) => {
  res.json(await ops.listFuel(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/fuel', authRequired, async (req, res) => {
  try { await ops.addFuel(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get('/api/expenses', authRequired, async (req, res) => {
  res.json(await ops.listExpenses(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/expenses', authRequired, async (req, res) => {
  try { await ops.addExpense(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- ANALYTICS ----------------------------- //
app.get('/api/kpis', authRequired, async (req, res) => res.json(await ops.dashboardKpis()));
app.get('/api/metrics', authRequired, async (req, res) => res.json(await ops.vehicleMetrics()));
app.get('/api/notifications', authRequired, async (req, res) => res.json(await ops.listNotifications()));
app.post('/api/notifications/read-all', authRequired, async (req, res) => {
  await ops.markAllNotificationsRead(); res.json({ ok: true });
});

// ----------------------------- Static frontend ----------------------------- //
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚚 TransitOps running on http://localhost:${PORT}`);
});
