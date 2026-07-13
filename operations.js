/**
 * TransitOps - Business logic / operations layer.
 * All required business rules from section 4 of the spec live here.
 */
const { db, recomputeLicenseNotifications } = require('./database');

const now = () => new Date().toISOString().slice(0, 19);

// ============================== USERS ============================== //
function listUsers() {
  return db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY id').all();
}
function addUser({ name, email, password, role }) {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO users (name,email,password_hash,role,created_at) VALUES (?,?,?,?,?)'
  ).run(name.trim(), email.toLowerCase().trim(), hash, role, now());
}
function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ============================== VEHICLES ============================== //
function listVehicles(filters = {}) {
  let q = 'SELECT * FROM vehicles WHERE 1=1';
  const args = [];
  if (filters.type && filters.type !== 'All') { q += ' AND type = ?'; args.push(filters.type); }
  if (filters.status && filters.status !== 'All') { q += ' AND status = ?'; args.push(filters.status); }
  if (filters.region && filters.region !== 'All') { q += ' AND region = ?'; args.push(filters.region); }
  q += ' ORDER BY reg_no';
  return db.prepare(q).all(...args);
}
function getVehicle(id) { return db.prepare('SELECT * FROM vehicles WHERE id = ?').get(id); }
function addVehicle({ reg_no, name, type, max_load_kg, odometer_km, acquisition_cost, region }) {
  db.prepare(
    `INSERT INTO vehicles
     (reg_no,name,type,max_load_kg,odometer_km,acquisition_cost,region,status,created_at)
     VALUES (?,?,?,?,?,?,?, 'Available', ?)`
  ).run(reg_no.toUpperCase().trim(), name.trim(), type, +max_load_kg,
        +odometer_km, +acquisition_cost, region, now());
}
function updateVehicle(id, fields) {
  const allowed = ['name','type','max_load_kg','odometer_km','acquisition_cost','region','status'];
  const sets = []; const args = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); args.push(fields[k]); }
  }
  if (!sets.length) return;
  args.push(id);
  db.prepare(`UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`).run(...args);
}
function deleteVehicle(id) {
  const v = getVehicle(id);
  if (!v) throw new Error('Vehicle not found.');
  // Block deleting an On-Trip vehicle — must cancel/complete first
  if (v.status === 'On Trip') {
    throw new Error('Cannot delete a vehicle that is On Trip. Cancel or complete the trip first.');
  }
  const tx = db.transaction(() => {
    // Cascade is set on FKs, but we also clean up notifications and any
    // trip-linked fuel/expense rows explicitly to keep the audit clean.
    const tripIds = db.prepare('SELECT id FROM trips WHERE vehicle_id = ?').all(id).map(r => r.id);
    if (tripIds.length) {
      const placeholders = tripIds.map(() => '?').join(',');
      db.prepare(`UPDATE fuel_logs SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
      db.prepare(`UPDATE expenses  SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
    }
    db.prepare('DELETE FROM maintenance WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM fuel_logs   WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM expenses    WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM trips       WHERE vehicle_id = ?').run(id);
    db.prepare('DELETE FROM vehicles    WHERE id = ?').run(id);
  });
  tx();
  return { ok: true, message: `Vehicle ${v.reg_no} deleted.` };
}

// ============================== DRIVERS ============================== //
function listDrivers(filters = {}) {
  let q = 'SELECT * FROM drivers WHERE 1=1';
  const args = [];
  if (filters.status && filters.status !== 'All') { q += ' AND status = ?'; args.push(filters.status); }
  q += ' ORDER BY name';
  return db.prepare(q).all(...args);
}
function getDriver(id) { return db.prepare('SELECT * FROM drivers WHERE id = ?').get(id); }
function addDriver({ name, license_no, license_category, license_expiry, contact, safety_score }) {
  db.prepare(
    `INSERT INTO drivers
     (name,license_no,license_category,license_expiry,contact,safety_score,status,created_at)
     VALUES (?,?,?,?,?,?,'Available',?)`
  ).run(name.trim(), license_no.toUpperCase().trim(), license_category,
        license_expiry, contact.trim(), +safety_score, now());
  recomputeLicenseNotifications();
}
function updateDriver(id, fields) {
  const allowed = ['name','license_category','license_expiry','contact','safety_score','status'];
  const sets = []; const args = [];
  for (const k of allowed) {
    if (k in fields) { sets.push(`${k} = ?`); args.push(fields[k]); }
  }
  if (!sets.length) return;
  args.push(id);
  db.prepare(`UPDATE drivers SET ${sets.join(', ')} WHERE id = ?`).run(...args);
  recomputeLicenseNotifications();
}
function deleteDriver(id) {
  const d = getDriver(id);
  if (!d) throw new Error('Driver not found.');
  if (d.status === 'On Trip') {
    throw new Error('Cannot delete a driver who is On Trip. Cancel or complete the trip first.');
  }
  const tx = db.transaction(() => {
    const tripIds = db.prepare('SELECT id FROM trips WHERE driver_id = ?').all(id).map(r => r.id);
    if (tripIds.length) {
      const placeholders = tripIds.map(() => '?').join(',');
      db.prepare(`UPDATE fuel_logs SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
      db.prepare(`UPDATE expenses  SET trip_id = NULL WHERE trip_id IN (${placeholders})`).run(...tripIds);
    }
    db.prepare('DELETE FROM trips    WHERE driver_id = ?').run(id);
    db.prepare('DELETE FROM drivers  WHERE id = ?').run(id);
    // Clean up any license-expiry notifications for this driver
    db.prepare('DELETE FROM notifications WHERE kind = ? AND target_id = ?').run('license_expiry', id);
  });
  tx();
  recomputeLicenseNotifications();
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

function listTrips(filters = {}) {
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
function getTrip(id) {
  return db.prepare(
    `SELECT t.*, v.reg_no AS vehicle_reg, v.name AS vehicle_name, d.name AS driver_name
     FROM trips t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN drivers d ON d.id = t.driver_id
     WHERE t.id = ?`
  ).get(id);
}
function createTrip({ source, destination, vehicle_id, driver_id, cargo_kg, planned_distance_km }) {
  const v = getVehicle(vehicle_id);
  const d = getDriver(driver_id);
  if (!v || !d) return [false, 'Vehicle or driver not found.'];
  const [vok, vmsg] = isVehicleAssignable(v);
  if (!vok) return [false, vmsg];
  const [dok, dmsg] = isDriverAssignable(d);
  if (!dok) return [false, dmsg];
  if (+cargo_kg > +v.max_load_kg) {
    return [false, `Cargo weight ${cargo_kg} kg exceeds vehicle's max load ${v.max_load_kg} kg.`];
  }
  db.prepare(
    `INSERT INTO trips
     (source,destination,vehicle_id,driver_id,cargo_kg,planned_distance_km,status,created_at)
     VALUES (?,?,?,?,?,?, 'Draft', ?)`
  ).run(source.trim(), destination.trim(), vehicle_id, driver_id,
        +cargo_kg, +planned_distance_km, now());
  return [true, 'Trip created (Draft).'];
}
function dispatchTrip(id) {
  const t = getTrip(id);
  if (!t || t.status !== 'Draft') return [false, 'Only Draft trips can be dispatched.'];
  const v = getVehicle(t.vehicle_id);
  const d = getDriver(t.driver_id);
  const [vok, vmsg] = isVehicleAssignable(v);
  if (!vok) return [false, vmsg];
  const [dok, dmsg] = isDriverAssignable(d);
  if (!dok) return [false, dmsg];
  if (t.cargo_kg > v.max_load_kg) return [false, 'Cargo weight exceeds vehicle max load.'];

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE trips SET status='Dispatched', dispatched_at=?, start_odometer=? WHERE id=?`
    ).run(now(), v.odometer_km, id);
    db.prepare(`UPDATE vehicles SET status='On Trip' WHERE id=?`).run(t.vehicle_id);
    db.prepare(`UPDATE drivers  SET status='On Trip' WHERE id=?`).run(t.driver_id);
  });
  tx();
  return [true, 'Trip dispatched. Vehicle & driver are now On Trip.'];
}
function completeTrip(id, { end_odometer, fuel_used_liters, revenue }) {
  const t = getTrip(id);
  if (!t || t.status !== 'Dispatched') return [false, 'Only Dispatched trips can be completed.'];
  if (+end_odometer < (t.start_odometer || 0)) return [false, 'End odometer must be >= start odometer.'];

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE trips SET status='Completed', completed_at=?, end_odometer=?,
       fuel_used_liters=?, revenue=? WHERE id=?`
    ).run(now(), +end_odometer, +fuel_used_liters, +revenue, id);
    db.prepare(`UPDATE vehicles SET odometer_km=?, status='Available' WHERE id=?`)
      .run(+end_odometer, t.vehicle_id);
    db.prepare(`UPDATE drivers  SET status='Available' WHERE id=?`).run(t.driver_id);
    if (+fuel_used_liters > 0) {
      db.prepare(
        `INSERT INTO fuel_logs
         (vehicle_id,trip_id,liters,cost,log_date,odometer_km,created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(t.vehicle_id, id, +fuel_used_liters, 0,
            new Date().toISOString().slice(0, 10), +end_odometer, now());
    }
  });
  tx();
  return [true, 'Trip completed. Vehicle & driver are now Available.'];
}
function cancelTrip(id) {
  const t = getTrip(id);
  if (!t) return [false, 'Trip not found.'];
  if (t.status === 'Completed') return [false, 'Completed trips cannot be cancelled.'];
  if (t.status === 'Cancelled') return [false, 'Trip is already cancelled.'];

  const tx = db.transaction(() => {
    db.prepare(`UPDATE trips SET status='Cancelled' WHERE id=?`).run(id);
    if (t.status === 'Dispatched') {
      const v = getVehicle(t.vehicle_id);
      const d = getDriver(t.driver_id);
      if (v && v.status === 'On Trip') db.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(t.vehicle_id);
      if (d && d.status === 'On Trip') db.prepare(`UPDATE drivers  SET status='Available' WHERE id=?`).run(t.driver_id);
    }
  });
  tx();
  return [true, 'Trip cancelled.'];
}

// ============================== MAINTENANCE ============================== //
function listMaintenance(vid = null) {
  let q = `SELECT m.*, v.reg_no AS vehicle_reg, v.name AS vehicle_name
           FROM maintenance m JOIN vehicles v ON v.id = m.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND m.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY m.id DESC';
  return db.prepare(q).all(...args);
}
function createMaintenance({ vehicle_id, description, cost, notes }) {
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO maintenance
       (vehicle_id,description,cost,start_date,status,notes,created_at)
       VALUES (?,?,?,?,'Open',?,?)`
    ).run(vehicle_id, description.trim(), +cost,
          new Date().toISOString().slice(0, 10), notes || '', now());
    db.prepare(`UPDATE vehicles SET status='In Shop' WHERE id=?`).run(vehicle_id);
  });
  tx();
  return [true, 'Maintenance record created. Vehicle moved to In Shop.'];
}
function closeMaintenance(mid) {
  const r = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(mid);
  if (!r) return [false, 'Maintenance record not found.'];
  const tx = db.transaction(() => {
    db.prepare(`UPDATE maintenance SET status='Closed', end_date=? WHERE id=?`)
      .run(new Date().toISOString().slice(0, 10), mid);
    const v = getVehicle(r.vehicle_id);
    if (v && v.status === 'In Shop') {
      db.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(r.vehicle_id);
    }
  });
  tx();
  return [true, 'Maintenance closed. Vehicle restored to Available.'];
}
function deleteMaintenance(mid) {
  const r = db.prepare('SELECT * FROM maintenance WHERE id = ?').get(mid);
  if (!r) return { ok: true, message: 'Maintenance record already removed.' };
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM maintenance WHERE id = ?').run(mid);
    // If the vehicle was In Shop and has no other open maintenance, restore it
    const stillOpen = db.prepare(
      "SELECT COUNT(*) c FROM maintenance WHERE vehicle_id = ? AND status = 'Open'"
    ).get(r.vehicle_id).c;
    if (stillOpen === 0) {
      const v = getVehicle(r.vehicle_id);
      if (v && v.status === 'In Shop') {
        db.prepare(`UPDATE vehicles SET status='Available' WHERE id=?`).run(r.vehicle_id);
      }
    }
  });
  tx();
  return { ok: true, message: 'Maintenance record deleted.' };
}

// ============================== FUEL & EXPENSES ============================== //
function listFuel(vid = null) {
  let q = `SELECT f.*, v.reg_no AS vehicle_reg
           FROM fuel_logs f JOIN vehicles v ON v.id = f.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND f.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY f.id DESC';
  return db.prepare(q).all(...args);
}
function addFuel({ vehicle_id, liters, cost, log_date, odometer_km, trip_id = null }) {
  db.prepare(
    `INSERT INTO fuel_logs
     (vehicle_id,trip_id,liters,cost,log_date,odometer_km,created_at)
     VALUES (?,?,?,?,?,?,?)`
  ).run(vehicle_id, trip_id, +liters, +cost, log_date, +odometer_km || null, now());
}
function listExpenses(vid = null) {
  let q = `SELECT e.*, v.reg_no AS vehicle_reg
           FROM expenses e LEFT JOIN vehicles v ON v.id = e.vehicle_id WHERE 1=1`;
  const args = [];
  if (vid) { q += ' AND e.vehicle_id = ?'; args.push(vid); }
  q += ' ORDER BY e.id DESC';
  return db.prepare(q).all(...args);
}
function addExpense({ vehicle_id, category, description, amount, expense_date }) {
  db.prepare(
    `INSERT INTO expenses
     (vehicle_id,category,description,amount,expense_date,created_at)
     VALUES (?,?,?,?,?,?)`
  ).run(vehicle_id || null, category, description || '', +amount, expense_date, now());
}

// ============================== ANALYTICS ============================== //
function dashboardKpis() {
  const get = (sql) => db.prepare(sql).get().c;
  const total = get('SELECT COUNT(*) c FROM vehicles');
  const activeV = get(`SELECT COUNT(*) c FROM vehicles WHERE status='On Trip'`);
  const availableV = get(`SELECT COUNT(*) c FROM vehicles WHERE status='Available'`);
  const inShop = get(`SELECT COUNT(*) c FROM vehicles WHERE status='In Shop'`);
  const activeT = get(`SELECT COUNT(*) c FROM trips WHERE status='Dispatched'`);
  const pendingT = get(`SELECT COUNT(*) c FROM trips WHERE status='Draft'`);
  const onDuty = get(`SELECT COUNT(*) c FROM drivers WHERE status='On Trip'`);
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

function vehicleMetrics() {
  const vehicles = db.prepare('SELECT * FROM vehicles').all();
  return vehicles.map((v) => {
    const fuel = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM fuel_logs WHERE vehicle_id=?').get(v.id).c;
    const maint = db.prepare('SELECT COALESCE(SUM(cost),0) c FROM maintenance WHERE vehicle_id=?').get(v.id).c;
    const misc = db.prepare('SELECT COALESCE(SUM(amount),0) c FROM expenses WHERE vehicle_id=?').get(v.id).c;
    const distance = db.prepare(
      `SELECT COALESCE(SUM(end_odometer-start_odometer),0) d
       FROM trips WHERE vehicle_id=? AND status='Completed'`
    ).get(v.id).d;
    const fuel_liters = db.prepare('SELECT COALESCE(SUM(liters),0) l FROM fuel_logs WHERE vehicle_id=?').get(v.id).l;
    const revenue = db.prepare(
      `SELECT COALESCE(SUM(revenue),0) r FROM trips WHERE vehicle_id=? AND status='Completed'`
    ).get(v.id).r;
    const opCost = fuel + maint + misc;
    const eff = fuel_liters ? distance / fuel_liters : 0;
    const roi = v.acquisition_cost > 0
      ? ((revenue - (maint + fuel)) / v.acquisition_cost) * 100
      : 0;
    return {
      id: v.id, reg_no: v.reg_no, name: v.name, type: v.type, status: v.status,
      acquisition_cost: v.acquisition_cost, distance_km: distance,
      fuel_liters, fuel_efficiency: +eff.toFixed(2),
      fuel_cost: fuel, maintenance_cost: maint, misc_cost: misc,
      operational_cost: opCost, revenue, roi_pct: +roi.toFixed(2),
    };
  });
}

function listNotifications() {
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC').all();
}
function markAllNotificationsRead() {
  db.prepare('UPDATE notifications SET read = 1').run();
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
