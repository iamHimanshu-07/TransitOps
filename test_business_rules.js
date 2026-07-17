/**
 * TransitOps - End-to-end business-rules smoke test
 * Run: node test_business_rules.js
 * Set DATABASE_URL to run against Postgres; otherwise uses local SQLite.
 */
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { console.log(`  ✅ ${label}`); pass++; }
  else { console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); fail++; }
}
function eq(label, got, want) {
  ok(label, got === want, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
}

async function reset() {
  // Drop cached requires so the next init() rebuilds the connection
  delete require.cache[require.resolve('./database')];
  delete require.cache[require.resolve('./operations')];
  const dbModule = require('./database');
  if (process.env.DATABASE_URL) {
    // Postgres mode: rely on _reset() which TRUNCATEs everything
    await dbModule._reset();
    // Re-run init to re-seed
    await dbModule.init();
  } else {
    // SQLite mode: close, delete file, re-init
    try { dbModule.db.close(); } catch {}
    const dbPath = path.join(__dirname, 'transitops.db');
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) {
        try { fs.unlinkSync(p); } catch (e) { console.error('  could not remove', p, e.message); }
      }
    }
    // Re-require to re-open with a fresh handle
    delete require.cache[require.resolve('./database')];
    delete require.cache[require.resolve('./operations')];
    const { init, recomputeLicenseNotifications } = require('./database');
    await init();
    await recomputeLicenseNotifications();
  }
}

async function run() {
  console.log('='.repeat(60));
  console.log(' TransitOps Business-Rules Smoke Test (Node.js)');
  console.log(process.env.DATABASE_URL ? ' Backend: Postgres' : ' Backend: SQLite');
  console.log('='.repeat(60));
  await reset();

  // Now require fresh modules
  const { verifyUser } = require('./database');
  const ops = require('./operations');

  // Auth
  console.log('\n[A] Auth: verifyUser');
  eq('admin login', (await verifyUser('admin@transitops.com', 'admin123'))?.role, 'Fleet Manager');
  ok('reject bad password', !(await verifyUser('admin@transitops.com', 'wrong')));
  ok('reject unknown user', !(await verifyUser('nobody@x.com', 'x')));

  // Vehicles & drivers
  const vehicles = await ops.listVehicles();
  const drivers = await ops.listDrivers();
  const v = vehicles.find(v => v.reg_no === 'VAN-05');
  const d = drivers.find(d => d.license_no === 'DL-042018');

  // TEST 1: Happy path
  console.log('\n[1] Happy-path: Van-05 + Alex + 450kg');
  let [ok1, msg1] = await ops.createTrip({ source: 'Mumbai', destination: 'Pune',
    vehicle_id: v.id, driver_id: d.id, cargo_kg: 450, planned_distance_km: 180 });
  ok('Trip created as Draft', ok1, msg1);
  const trips1 = await ops.listTrips();
  let t = trips1.find(x => x.source === 'Mumbai' && x.status === 'Draft');
  eq('Initial status Draft', t.status, 'Draft');
  let [dok, dmsg] = await ops.dispatchTrip(t.id);
  ok('Dispatch succeeded', dok, dmsg);
  eq('Vehicle On Trip after dispatch', (await ops.getVehicle(v.id)).status, 'On Trip');
  eq('Driver On Trip after dispatch', (await ops.getDriver(d.id)).status, 'On Trip');
  [dok, dmsg] = await ops.completeTrip(t.id, { end_odometer: 12680, fuel_used_liters: 23, revenue: 13000 });
  ok('Complete succeeded', dok, dmsg);
  eq('Vehicle restored to Available', (await ops.getVehicle(v.id)).status, 'Available');
  eq('Driver restored to Available', (await ops.getDriver(d.id)).status, 'Available');
  eq('Odometer updated to 12680', (await ops.getVehicle(v.id)).odometer_km, 12680);

  // TEST 2: Cargo > max load
  console.log('\n[2] Reject cargo > max load');
  let [r2, m2] = await ops.createTrip({ source: 'A', destination: 'B', vehicle_id: v.id,
    driver_id: d.id, cargo_kg: 99999, planned_distance_km: 100 });
  ok('Cargo > max load rejected', !r2, m2);

  // TEST 3: Expired license driver
  console.log('\n[3] Reject driver with expired license');
  const expired = (await ops.listDrivers()).find(x => x.license_no === 'DL-112019');
  let [r3, m3] = await ops.createTrip({ source: 'X', destination: 'Y', vehicle_id: v.id,
    driver_id: expired.id, cargo_kg: 100, planned_distance_km: 50 });
  ok('Expired-license driver rejected', !r3, m3);

  // TEST 4: Suspended driver
  console.log('\n[4] Reject suspended driver');
  const susp = (await ops.listDrivers()).find(x => x.status === 'Suspended');
  let [r4, m4] = await ops.createTrip({ source: 'X', destination: 'Y', vehicle_id: v.id,
    driver_id: susp.id, cargo_kg: 100, planned_distance_km: 50 });
  ok('Suspended driver rejected', !r4, m4);

  // TEST 5: In Shop vehicle
  console.log('\n[5] In Shop vehicle cannot be assigned');
  const inShop = (await ops.listVehicles()).find(x => x.status === 'In Shop');
  let [r5, m5] = await ops.createTrip({ source: 'X', destination: 'Y', vehicle_id: inShop.id,
    driver_id: d.id, cargo_kg: 100, planned_distance_km: 50 });
  ok('In-Shop vehicle rejected', !r5, m5);

  // TEST 6: On Trip driver cannot be reassigned
  console.log('\n[6] On Trip driver cannot be reassigned');
  const v2 = (await ops.listVehicles()).find(x => x.status === 'Available' && x.id !== v.id);
  await ops.createTrip({ source: 'P', destination: 'Q', vehicle_id: v2.id, driver_id: d.id,
    cargo_kg: 100, planned_distance_km: 50 });
  const t1 = (await ops.listTrips()).find(x => x.status === 'Draft');
  await ops.dispatchTrip(t1.id);
  eq('Driver is On Trip', (await ops.getDriver(d.id)).status, 'On Trip');
  const v3 = (await ops.listVehicles()).find(x => x.status === 'Available' && x.id !== v2.id);
  let [r6, m6] = await ops.createTrip({ source: 'P2', destination: 'Q2', vehicle_id: v3.id,
    driver_id: d.id, cargo_kg: 100, planned_distance_km: 50 });
  ok('On-Trip driver rejected', !r6, m6);
  await ops.completeTrip(t1.id, { end_odometer: v2.odometer_km + 50, fuel_used_liters: 5, revenue: 2000 });

  // TEST 7: Maintenance auto-flips to In Shop
  console.log('\n[7] Creating maintenance → vehicle In Shop');
  const avail = (await ops.listVehicles()).find(x => x.status === 'Available');
  await ops.createMaintenance({ vehicle_id: avail.id, description: 'Oil Change', cost: 1500, notes: 'Routine' });
  eq('Vehicle In Shop', (await ops.getVehicle(avail.id)).status, 'In Shop');

  // TEST 8: Closing maintenance restores Available
  console.log('\n[8] Closing maintenance → Available');
  const openLog = (await ops.listMaintenance(avail.id)).find(m => m.status === 'Open');
  await ops.closeMaintenance(openLog.id);
  eq('Vehicle Available', (await ops.getVehicle(avail.id)).status, 'Available');

  // TEST 9: Cancelling dispatched trip restores both
  console.log('\n[9] Cancelling Dispatched trip restores both');
  const d2 = (await ops.listDrivers()).find(x => x.status === 'Available' &&
    new Date(x.license_expiry) >= new Date());
  const v4 = (await ops.listVehicles()).find(x => x.status === 'Available');
  await ops.createTrip({ source: 'X', destination: 'Y', vehicle_id: v4.id, driver_id: d2.id,
    cargo_kg: 50, planned_distance_km: 25 });
  const td = (await ops.listTrips()).find(x => x.status === 'Draft');
  await ops.dispatchTrip(td.id);
  eq('Pre-cancel: vehicle On Trip', (await ops.getVehicle(v4.id)).status, 'On Trip');
  eq('Pre-cancel: driver On Trip', (await ops.getDriver(d2.id)).status, 'On Trip');
  await ops.cancelTrip(td.id);
  eq('Post-cancel: vehicle Available', (await ops.getVehicle(v4.id)).status, 'Available');
  eq('Post-cancel: driver Available', (await ops.getDriver(d2.id)).status, 'Available');

  // TEST 10: Duplicate reg_no
  console.log('\n[10] Duplicate registration number rejected');
  let dupErr = null;
  try { await ops.addVehicle({ reg_no: 'VAN-05', name: 'Dup', type: 'Van', max_load_kg: 100,
    odometer_km: 0, acquisition_cost: 0, region: 'Central' }); }
  catch (e) { dupErr = e.message; }
  ok('Duplicate rejected', !!dupErr, dupErr);

  // TEST 11: KPIs
  console.log('\n[11] Dashboard KPIs');
  const kpis = await ops.dashboardKpis();
  console.log('     ' + JSON.stringify(kpis));
  ok('total_vehicles > 0', kpis.total_vehicles > 0);
  ok('utilization in [0,100]', kpis.fleet_utilization >= 0 && kpis.fleet_utilization <= 100);

  // TEST 12: Metrics
  console.log('\n[12] Vehicle metrics');
  const metrics = await ops.vehicleMetrics();
  const m_van5 = metrics.find(m => m.reg_no === 'VAN-05');
  console.log('     VAN-05: ' + JSON.stringify(m_van5));
  ok('VAN-05 distance > 0', m_van5.distance_km > 0);
  ok('VAN-05 fuel_efficiency > 0', m_van5.fuel_efficiency > 0);

  // TEST 13: Notifications
  console.log('\n[13] License expiry notifications');
  const notes = await ops.listNotifications();
  console.log(`     total: ${notes.length} (expired: ${notes.filter(n => n.message.includes('EXPIRED')).length}, soon: ${notes.filter(n => n.message.includes('Expiring soon')).length})`);
  ok('At least one expiry notice', notes.length > 0);

  console.log('\n' + '='.repeat(60));
  console.log(` Results: ${pass} passed, ${fail} failed`);
  console.log('='.repeat(60));
  if (fail > 0) process.exit(1);

  // Clean up pool so the test process exits cleanly
  if (process.env.DATABASE_URL) {
    const { db } = require('./database');
    // adapter doesn't expose pool directly, but pg's Pool keeps the loop alive
    // if not closed. We can end it via require('pg').Pool... simpler: exit.
    process.exit(0);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
