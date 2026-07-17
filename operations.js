/**
 * TransitOps - Business logic / operations layer.
 * All required business rules from section 4 of the spec live here.
 *
 * Async throughout: works on both SQLite (sync underneath, awaited) and Postgres.
 * Inside transactions, use the `tx` argument — it pins all queries to the same
 * connection so the BEGIN/COMMIT wraps them atomically.
 */
const { db, recomputeLicenseNotifications } = require('./database');

const now = () => new Date().toISOString().slice(0, 19);

// ============================== USERS ============================== //
async function listUsers() {
  return db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id').all();
}
async function addUser({ name, email, password, role }) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(password, 10);
  await db.prepare(
    'INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)'
  ).run(name.trim(), email.toLowerCase().trim(), hash, role, now());
}
async function deleteUser(id) {
  await db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ============================== VEHICLES ============================== //
async function listVehicles(filters = {}) {
  let q = 'SELECT * FROM vehicles WHERE 1=1';
  const args = [];
  if (filters.type && filters.type !== 'All') { q += ' AND type = ?'; args.push(filters.type); }
  if (filters.status && filters.status !== 'All') { q += ' AND status = ?'; args.push(filters.status); }
  if (filters.region && filters.region !== 'All') { q += ' AND region = ?'; args.push(filters.region); }
  q += ' ORDER BY reg_no';
  return db.prepare(q).all(...args);
}
async function getVehicle(id) { return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id); }
async function addVehicle({ reg_no, name, type, max_load_kg, odometer_km, acquisition_cost, region }) {
  await db.prepare(
    `INSERT INTO vehicles
     (reg_no,name,type,max_load_kg,odometer_km,acquisition_cost,region,status,created_at)
     VALUES (?,?,?,?,?,?,?, 'Available', ?)`
  ).run(reg_no.toUpperCase().trim(), name.trim(), type, +max_load_kg,
        +odometer_km, +acquisition_cost, region, now());
}
async function updateVehicle(id, fields) {
  const allowed = ['name','type','max_load_kg','odometer_km','acquisition_cost','region','status'];
  const sets = []; const args = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); args.push(fields[k]); }
  }
  if (!sets.length) return;
  args.push(id);
  await db.prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`).run(...args);
}
async function deleteVehicle(id) {
  const v = await getVehicle(id);
  if (!v) throw new Error('Vehicle not found.');
  if (v.status === 'On Trip') {
    throw new Error('Cannot delete a vehicle that is On Trip. Cancel or complete the trip first.');
  }
  await db.transaction(async (tx) => {
    const tripIds = (await tx.prepare('SELECT id FROM trips WHERE vehicle_id = ?').all(id)).map(r => r.id);
    if (tripIds.length) {
      const placeholders = tripIds.map(() => '?').join(',');
      await tx.prepare(`UPDATE fuel_logs SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
      await tx.prepare(`UPDATE expenses  SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
    }
    await tx.prepare('DELETE FROM maintenance WHERE vehicle_id = ?').run(id);
    await tx.prepare('DELETE FROM fuel_logs   WHERE vehicle_id = ?').run(id);
    await tx.prepare('DELETE FROM expenses    WHERE vehicle_id = ?').run(id);
    await tx.prepare('DELETE FROM trips       WHERE vehicle_id = ?').run(id);
    await tx.prepare('DELETE FROM vehicles    WHERE id = ?').run(id);
  });
  return { ok: true, message: `Vehicle ${v.reg_no} deleted.` };
}

// ============================== DRIVERS ============================== //
async function listDrivers(filters = {}) {
  let q = 'SELECT * FROM drivers WHERE 1=1';
  const args = [];
  if (filters.status && filters.status !== 'All') { q += ' AND status = ?'; args.push(filters.status); }
  q += ' ORDER BY name';
  return db.prepare(q).all(...args);
}
async function getDriver(id) { return db.prepare('SELECT * FROM drivers WHERE id = ?').get(id); }
async function addDriver({ name, license_no, license_category, license_expiry, contact, safety_score }) {
  await db.prepare(
    `INSERT INTO drivers
     (name,license_no,license_category,license_expiry,contact,safety_score,status,created_at)
     VALUES (?,?,?,?,?,?,'Available',?)`
  ).run(name.trim(), license_no.toUpperCase().trim(), license_category,
        license_expiry, contact.trim(), +safety_score, now());
  await recomputeLicenseNotifications();
}
async function updateDriver(id, fields) {
  const allowed = ['name','license_category','license_expiry','contact','safety_score','status'];
  const sets = []; const args = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); args.push(fields[k]); }
  }
  if (!sets.length) return;
  args.push(id);
  await db.prepare(`UPDATE drivers SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  await recomputeLicenseNotifications();
}
async function deleteDriver(id) {
  const d = await getDriver(id);
  if (!d) throw new Error('Driver not found.');
  if (d.status === 'On Trip') {
    throw new Error('Cannot delete a driver who is On Trip. Cancel or complete the trip first.');
  }
  await db.transaction(async (tx) => {
    const tripIds = (await tx.prepare('SELECT id FROM trips WHERE driver_id = ?').all(id)).map(r => r.id);
    if (tripIds.length) {
      const placeholders = tripIds.map(() => '?').join(',');
      await tx.prepare(`UPDATE fuel_logs SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
      await tx.prepare(`UPDATE expenses  SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
    }
    await tx.prepare('DELETE FROM trips    WHERE driver_id = ?').run(id);
    await tx.prepare('DELETE FROM drivers  WHERE id = ?').run(id);
    await tx.prepare('DELETE FROM notifications WHERE kind = ? AND target_id = ?').run('license_expiry', id);
  });
  await recomputeLicenseNotifications();
  return { ok: true, message: `Driver ${d.name} deleted.` };
}

// ============================== TRIPS ============================== //
function isDriverAssignable(d) {
  if (d.status === 'On Trip') return [false, `Driver is On Trip.`];
  if (d.status === 'Suspended') return [false, `Driver is Suspended.`];
  const exp = new Date(d.license_expiry);
  if (exp < new Date()) return [false, 'Driver license has expired.'];
  return [true, ''];
}
function isVehicleAssignable(v) {
  if (v.status === 'On Trip') return [false, `Vehicle is On Trip.`];
  if (v.status === 'In Shop') return [false, `Vehicle is In Shop.`];
  if (v.status === 'Retired') return [false, `Vehicle is Retired.`];
  return [true, ''];
}

async function listTrips(filters = {}) {
  let q = `SELECT t.*, v.reg_no AS vehicle_reg, v.name AS vehicle_name,
                  d.name AS driver_name
           FROM trips t
           JOIN vehicles v ON v.id = t.vehicle_id
           JOIN drivers d ON d.id = t.driver_id
           WHERE 1=1`;
  const args = [];
  if (filters.status && filters.status !== 'All') { q += ' AND t.status = ?'; args.push(filters.status); }
  q += ' ORDER BY t.id DESC';
  return db.prepare(q).all(...args);
}
async function getTrip(id) {
  return db.prepare(
    `SELECT t.*, v.reg_no AS vehicle_reg, v.name AS vehicle_name, d.name AS driver_name
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = ?`
  ).get(id);
}
async function createTrip({ source, destination, vehicle_id, driver_id, cargo_kg, planned_distance_km }) {
  const v = await getVehicle(vehicle_id);
  const d = await getDriver(driver_id);
  if (!v || !d) return [false, 'Vehicle or driver not found.'];
  const [vok, vmsg] = isVehicleAssignable(v);
  if (!vok) return [false, vmsg];
  const [dok, dmsg] = isDriverAssignable(d);
  if (!dok) return [false, dmsg];
  if (+cargo_kg > +v.max_load_kg) {
    return [false, `Cargo weight ${cargo_kg} kg exceeds vehicle's max load ${v.max_load_kg} kg.`];
  }
  await db.prepare(
    `INSERT INTO trips
     (source,destination,vehicle_id,driver_id,cargo_kg,planned_distance_km,status,created_at)
     VALUES (?,?,?,?,?,?, 'Draft', ?)`
  ).run(source.trim(), destination.trim(), vehicle_id, driver_id,
        +cargo_kg, +planned_distance_km, now());
  return [true, 'Trip created (Draft).'];
}
async function dispatchTrip(id) {
  const t = await getTrip(id);
  if (!t || t.status !== 'Draft') return [false, 'Only Draft trips can be dispatched.'];
  const v = await getVehicle(t.vehicle_id);
  const d = await getDriver(t.driver_id);
  const [vok, vmsg] = isVehicleAssignable(v);
  if (!vok) return [false, vmsg];
  const [dok, dmsg] = isDriverAssignable(d);
  if (!dok) return [false, dmsg];
  if (t.cargo_kg > v.max_load_kg) return [false, 'Cargo weight exceeds vehicle max load.'];

  // Re-read inside the transaction to use the same connection (Postgres requires
  // all queries in a tx to share one client; SQLite tolerates either way).
  await db.transaction(async (tx) => {
    const vTx = await tx.prepare('SELECT * FROM vehicles WHERE id = ?').get(t.vehicle_id);
    await tx.prepare(
      `UPDATE trips SET status='Dispatched', dispatched_at=?, start_odometer=? WHERE id=?`
    ).run(now(), vTx.odometer_km, id);
    await tx.prepare(`UPDATE vehicles SET status='On Trip' WHERE id=?`).run(t.vehicle_id);
    await tx.prepare(`UPDATE drivers  SET status='On Trip' WHERE id=?`).run(t.driver_id);
  });
  return [true, 'Trip dispatched. Vehicle & driver are now On Trip.'];
}
async function completeTrip(id, { end_odometer, fuel_used_liters, revenue }) {
  const t = await getTrip(id);
  if (!t || t.status !== 'Dispatched') return [false, 'Only Dispatched trips can be completed.'];
  if (+end_odometer < (t.start_odometer || 0)) return [false, 'End odometer must be >= start odometer.'];

  await db.transaction(async (tx) => {
    await tx.prepare(
      `UPDATE trips SET status='Completed', completed_at=?, end_odometer=?,
       fuel_used_liters=?, revenue=? WHERE id=?`
    ).run(now(), +end_odometer, +fuel_used_liters, +revenue, id);
    await tx.prepare(`UPDATE vehicles SET odometer_km=?, status='Available' WHERE id=?`)
      .run(+end_odometer, t.vehicle_id);
    await tx.prepare(`UPDATE drivers  SET status='Available' WHERE id=?`).run(t.driver_id);
    if (+fuel_used_liters > 0) {
      await tx.prepare(
        `INSERT INTO fuel_logs
         (vehicle_id,trip_id,liters,cost,log_date,odometer_km,created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(t.vehicle_id, id, +fuel_used_liters, 0,
            new Date().toISOString().slice(0, 10), +end_odometer, now());
    }
  });
  return [true, 'Trip completed. Vehicle & driver are now Available.'];
}
async function cancelTrip(id) {
  const t = await getTrip(id);
  if (!t) return [false, 'Trip not found.'];
  if (t.status === 'Completed') return [false, 'Completed trips cannot be cancelled.'];
  if (t.status === 'Cancelled') return [false, 'Trip is already cancelled.'];

  await db.transaction(async (tx) => {
    await tx.prepare(`UPDATE trips SET status='Cancelled' WHERE id=?`).run(id);
    if (t.status === 'Dispatched') {
      // Read inside the tx so we see the snapshot before our updates.
      const v = await tx.prepare('SELECT * FROM vehicles WHERE id = ?').get(t.vehicle_id);
      const d = await tx.prepare('SELECT * FROM drivers WHERE id = ?').get(t.driver_id);
      if (v && v.status === 'On Trip') await tx.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(t.vehicle_id);
      if (d && d.status === 'On Trip') await tx.prepare(`UPDATE drivers  SET status='Available' WHERE id=?`).run(t.driver_id);
    }
  });
  return [true, 'Trip cancelled.'];
}

// ============================== MAINTENANCE ============================== //
async function listMaintenance(vid = null) {
  let q = `SELECT m.*, v.reg_no AS vehicle_reg, v.name AS vehicle_name
           FROM maintenance m JOIN vehicles v ON v.id = m.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND m.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY m.id DESC';
  return db.prepare(q).all(...args);
}
async function createMaintenance({ vehicle_id, description, cost, notes }) {
  await db.transaction(async (tx) => {
    await tx.prepare(
      `INSERT INTO maintenance
       (vehicle_id,description,cost,start_date,status,notes,created_at)
       VALUES (?,?,?,?,'Open',?,?)`
    ).run(vehicle_id, description.trim(), +cost,
          new Date().toISOString().slice(0, 10), notes || '', now());
    await tx.prepare(`UPDATE vehicles SET status='In Shop' WHERE id=?`).run(vehicle_id);
  });
  return [true, 'Maintenance record created. Vehicle moved to In Shop.'];
}
async function closeMaintenance(mid) {
  const r = await db.prepare('SELECT * FROM maintenance WHERE id = ?').get(mid);
  if (!r) return [false, 'Maintenance record not found.'];
  await db.transaction(async (tx) => {
    await tx.prepare(`UPDATE maintenance SET status='Closed', end_date=? WHERE id=?`)
      .run(new Date().toISOString().slice(0, 10), mid);
    const v = await tx.prepare('SELECT * FROM vehicles WHERE id = ?').get(r.vehicle_id);
    if (v && v.status === 'In Shop') {
      await tx.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(r.vehicle_id);
    }
  });
  return [true, 'Maintenance closed. Vehicle restored to Available.'];
}
async function deleteMaintenance(mid) {
  const r = await db.prepare('SELECT * FROM maintenance WHERE id = ?').get(mid);
  if (!r) return { ok: true, message: 'Maintenance record already removed.' };
  await db.transaction(async (tx) => {
    await tx.prepare('DELETE FROM maintenance WHERE id = ?').run(mid);
    const stillOpen = (await tx.prepare(
      "SELECT COUNT(*) AS c FROM maintenance WHERE vehicle_id = ? AND status = 'Open'"
    ).get(r.vehicle_id)).c;
    if (stillOpen === 0) {
      const v = await tx.prepare('SELECT * FROM vehicles WHERE id = ?').get(r.vehicle_id);
      if (v && v.status === 'In Shop') {
        await tx.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(r.vehicle_id);
      }
    }
  });
  return { ok: true, message: 'Maintenance record deleted.' };
}

// ============================== FUEL & EXPENSES ============================== //
async function listFuel(vid = null) {
  let q = `SELECT f.*, v.reg_no AS vehicle_reg
           FROM fuel_logs f JOIN vehicles v ON v.id = f.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND f.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY f.id DESC';
  return db.prepare(q).all(...args);
}
async function addFuel({ vehicle_id, liters, cost, log_date, odometer_km, trip_id = null }) {
  await db.prepare(
    `INSERT INTO fuel_logs
     (vehicle_id,trip_id,liters,cost,log_date,odometer_km,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(vehicle_id, trip_id, +liters, +cost, log_date, +odometer_km || null, now());
}
async function listExpenses(vid = null) {
  let q = `SELECT e.*, v.reg_no AS vehicle_reg
           FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND e.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY e.id DESC';
  return db.prepare(q).all(...args);
}
async function addExpense({ vehicle_id, category, description, amount, expense_date }) {
  await db.prepare(
    `INSERT INTO expenses
     (vehicle_id,category,description,amount,expense_date,created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(vehicle_id || null, category, description || '', +amount, expense_date, now());
}

// ============================== ANALYTICS ============================== //
async function dashboardKpis() {
  const get = async (sql) => (await db.prepare(sql).get()).c;
  const total = await get('SELECT COUNT(*) AS c FROM vehicles');
  const activeV = await get(`SELECT COUNT(*) AS c FROM vehicles WHERE status='On Trip'`);
  const availableV = await get(`SELECT COUNT(*) AS c FROM vehicles WHERE status='Available'`);
  const inShop = await get(`SELECT COUNT(*) AS c FROM vehicles WHERE status='In Shop'`);
  const activeT = await get(`SELECT COUNT(*) AS c FROM trips WHERE status='Dispatched'`);
  const pendingT = await get(`SELECT COUNT(*) AS c FROM trips WHERE status='Draft'`);
  const onDuty = await get(`SELECT COUNT(*) AS c FROM drivers WHERE status='On Trip'`);
  return {
    active_vehicles: activeV,
    available_vehicles: availableV,
    in_shop: inShop,
    active_trips: activeT,
    pending_trips: pendingT,
    drivers_on_duty: onDuty,
    fleet_utilization: total ? +((activeV / total) * 100).toFixed(1) : 0,
    total_vehicles: total,
  };
}

async function vehicleMetrics() {
  const vehicles = await db.prepare('SELECT * FROM vehicles').all();
  const out = [];
  for (const v of vehicles) {
    const fuel = (await db.prepare('SELECT COALESCE(SUM(cost),0) AS c FROM fuel_logs WHERE vehicle_id=?').get(v.id)).c;
    const maint = (await db.prepare('SELECT COALESCE(SUM(cost),0) AS c FROM maintenance WHERE vehicle_id=?').get(v.id)).c;
    const misc = (await db.prepare('SELECT COALESCE(SUM(amount),0) AS c FROM expenses WHERE vehicle_id=?').get(v.id)).c;
    const distance = (await db.prepare(
      `SELECT COALESCE(SUM(end_odometer-start_odometer),0) AS d
       FROM trips WHERE vehicle_id=? AND status='Completed'`
    ).get(v.id)).d;
    const fuel_liters = (await db.prepare('SELECT COALESCE(SUM(liters),0) AS l FROM fuel_logs WHERE vehicle_id=?').get(v.id)).l;
    const revenue = (await db.prepare(
      `SELECT COALESCE(SUM(revenue),0) AS r FROM trips WHERE vehicle_id=? AND status='Completed'`
    ).get(v.id)).r;
    const opCost = fuel + maint + misc;
    const eff = fuel_liters ? distance / fuel_liters : 0;
    const roi = v.acquisition_cost > 0
      ? ((revenue - (maint + fuel)) / v.acquisition_cost) * 100
      : 0;
    out.push({
      id: v.id, reg_no: v.reg_no, name: v.name, type: v.type, status: v.status,
      acquisition_cost: v.acquisition_cost, distance_km: distance,
      fuel_liters, fuel_efficiency: +eff.toFixed(2),
      fuel_cost: fuel, maintenance_cost: maint, misc_cost: misc,
      operational_cost: opCost, revenue, roi_pct: +roi.toFixed(2),
    });
  }
  return out;
}

async function listNotifications() {
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC').all();
}
async function markAllNotificationsRead() {
  await db.prepare('UPDATE notifications SET read = 1').run();
}

module.exports = {
  // users
  listUsers, addUser, deleteUser,
  // vehicles
  listVehicles, getVehicle, addVehicle, updateVehicle, deleteVehicle,
  // drivers
  listDrivers, getDriver, addDriver, updateDriver, deleteDriver,
  // trips
  listTrips, getTrip, createTrip, dispatchTrip, completeTrip, cancelTrip,
  isDriverAssignable, isVehicleAssignable,
  // maintenance
  listMaintenance, createMaintenance, closeMaintenance, deleteMaintenance,
  // fuel/expenses
  listFuel, addFuel, listExpenses, addExpense,
  // analytics
  dashboardKpis, vehicleMetrics, listNotifications, markAllNotificationsRead,
};
