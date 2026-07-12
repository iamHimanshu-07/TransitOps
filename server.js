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

init();
recomputeLicenseNotifications();

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'transitops-dev-secret-change-me';

function authRequired(req, res, next) {
  const token = req.cookies?.token ||
                (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
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

// ----------------------------- AUTH ----------------------------- //
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email & password required' });
  const user = verifyUser(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
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
app.get('/api/users', authRequired, requireRole('Fleet Manager'), (req, res) => {
  res.json(ops.listUsers());
});
app.post('/api/users', authRequired, requireRole('Fleet Manager'), (req, res) => {
  try { ops.addUser(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/users/:id', authRequired, requireRole('Fleet Manager'), (req, res) => {
  ops.deleteUser(+req.params.id); res.json({ ok: true });
});

// ----------------------------- VEHICLES ----------------------------- //
app.get('/api/vehicles', authRequired, (req, res) => {
  res.json(ops.listVehicles(req.query));
});
app.get('/api/vehicles/:id', authRequired, (req, res) => {
  const v = ops.getVehicle(+req.params.id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  res.json(v);
});
app.post('/api/vehicles', authRequired, (req, res) => {
  try { ops.addVehicle(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/vehicles/:id', authRequired, (req, res) => {
  try { ops.updateVehicle(+req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/vehicles/:id', authRequired, (req, res) => {
  try { ops.deleteVehicle(+req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- DRIVERS ----------------------------- //
app.get('/api/drivers', authRequired, (req, res) => res.json(ops.listDrivers(req.query)));
app.get('/api/drivers/:id', authRequired, (req, res) => {
  const d = ops.getDriver(+req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
});
app.post('/api/drivers', authRequired, (req, res) => {
  try { ops.addDriver(req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/drivers/:id', authRequired, (req, res) => {
  try { ops.updateDriver(+req.params.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/drivers/:id', authRequired, (req, res) => {
  try { ops.deleteDriver(+req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ----------------------------- TRIPS ----------------------------- //
app.get('/api/trips', authRequired, (req, res) => res.json(ops.listTrips(req.query)));
app.post('/api/trips', authRequired, (req, res) => {
  const [ok, msg] = ops.createTrip(req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/dispatch', authRequired, (req, res) => {
  const [ok, msg] = ops.dispatchTrip(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/complete', authRequired, (req, res) => {
  const [ok, msg] = ops.completeTrip(+req.params.id, req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/trips/:id/cancel', authRequired, (req, res) => {
  const [ok, msg] = ops.cancelTrip(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});

// ----------------------------- MAINTENANCE ----------------------------- //
app.get('/api/maintenance', authRequired, (req, res) => {
  res.json(ops.listMaintenance(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/maintenance', authRequired, (req, res) => {
  const [ok, msg] = ops.createMaintenance(req.body);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.post('/api/maintenance/:id/close', authRequired, (req, res) => {
  const [ok, msg] = ops.closeMaintenance(+req.params.id);
  if (!ok) return res.status(400).json({ error: msg });
  res.json({ ok: true, message: msg });
});
app.delete('/api/maintenance/:id', authRequired, (req, res) => {
  ops.deleteMaintenance(+req.params.id); res.json({ ok: true });
});

// ----------------------------- FUEL & EXPENSES ----------------------------- //
app.get('/api/fuel', authRequired, (req, res) => {
  res.json(ops.listFuel(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/fuel', authRequired, (req, res) => {
  ops.addFuel(req.body); res.json({ ok: true });
});
app.get('/api/expenses', authRequired, (req, res) => {
  res.json(ops.listExpenses(req.query.vehicle_id ? +req.query.vehicle_id : null));
});
app.post('/api/expenses', authRequired, (req, res) => {
  ops.addExpense(req.body); res.json({ ok: true });
});

// ----------------------------- ANALYTICS ----------------------------- //
app.get('/api/kpis', authRequired, (req, res) => res.json(ops.dashboardKpis()));
app.get('/api/metrics', authRequired, (req, res) => res.json(ops.vehicleMetrics()));
app.get('/api/notifications', authRequired, (req, res) => res.json(ops.listNotifications()));
app.post('/api/notifications/read-all', authRequired, (req, res) => {
  ops.markAllNotificationsRead(); res.json({ ok: true });
});

// ----------------------------- Static frontend ----------------------------- //
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚚 TransitOps running on http://localhost:${PORT}`);
});
