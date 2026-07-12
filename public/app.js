/* ============================================================
   TransitOps — Frontend SPA  (Vaelos · 2026)
   Vanilla JS, mock data, role-aware nav.
   ============================================================ */

const APP = {
  user: null,
  page: 'dashboard',
  settings: {
    depotName: 'Vaelos Central Depot',
    currency: 'USD',
    distanceUnit: 'km',
  },
};

/* ---------- helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
));
const fmt$ = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

/* ============================================================
   0. AUTH (login + error state)
   ============================================================ */
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const errBox = $('#login-error');
  errBox.classList.add('hidden');

  const email    = $('#email').value.trim();
  const password = $('#password').value;
  const role     = $('#role').value;
  const remember = $('#remember').checked;

  if (!email || !password) {
    errBox.classList.remove('hidden');
    errBox.innerHTML = '<strong>Error state:</strong> Please enter both email and password.';
    return;
  }

  // Demo credentials
  if (email === 'raven@transitops.com' && password === 'demo123') {
    APP.user = { name: 'Raven K.', email, role, remember };
    sessionStorage.setItem('transitops_user', JSON.stringify(APP.user));
    if (remember) localStorage.setItem('transitops_user_remember', JSON.stringify(APP.user));
    enterApp();
  } else {
    errBox.classList.remove('hidden');
    errBox.innerHTML = '<strong>Error state:</strong> Invalid credentials. Please verify your email, password, and role.';
  }
});

function enterApp() {
  $('#auth-page').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#role-pill').textContent = `${APP.user.role} [RX]`;
  buildNav();
  navigate('dashboard');
}

/* Logout */
$('#logout-btn').addEventListener('click', () => {
  APP.user = null;
  sessionStorage.removeItem('transitops_user');
  $('#app').classList.add('hidden');
  $('#auth-page').classList.remove('hidden');
  $('#login-form').reset();
});

/* Auto-login if session */
(function boot() {
  const cached = sessionStorage.getItem('transitops_user')
              || localStorage.getItem('transitops_user_remember');
  if (cached) {
    try {
      APP.user = JSON.parse(cached);
      enterApp();
    } catch {}
  }
})();

/* ============================================================
   NAV
   ============================================================ */
const NAV = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'fleet',       label: 'Fleet' },
  { id: 'drivers',     label: 'Drivers' },
  { id: 'trips',       label: 'Trips' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'fuel',        label: 'Fuel & Expenses' },
  { id: 'analytics',   label: 'Analytics' },
  { id: 'settings',    label: 'Settings' },
];
function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV.map(n => `
    <button class="nav-item ${n.id === APP.page ? 'active' : ''}" data-page="${n.id}">
      <span class="nav-icon">${
        { dashboard:'📊', fleet:'🚐', drivers:'👤', trips:'📦',
          maintenance:'🛠️', fuel:'⛽', analytics:'📈', settings:'⚙️' }[n.id]
      }</span><span>${n.label}</span>
    </button>
  `).join('');
  $$('#nav .nav-item').forEach(b => b.addEventListener('click', () => navigate(b.dataset.page)));
}
function navigate(page) {
  APP.page = page;
  $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const titles = {
    dashboard:'Dashboard', fleet:'Vehicle Registry', drivers:'Driver Management',
    trips:'Trip Dispatcher', maintenance:'Maintenance Workflow',
    fuel:'Fuel & Expenses', analytics:'Reports & Analytics', settings:'Settings & RBAC'
  };
  $('#page-title').textContent = titles[page] || page;
  render();
}

/* ============================================================
   MOCK DATA
   ============================================================ */
const DATA = {
  kpis: {
    active: 18, available: 22, maint: 7, activeTrips: 12, pending: 5,
    driversOnDuty: 16, utilization: 78,
  },
  statusDistribution: {
    Available: 22, 'On Trip': 18, 'In Shop': 7, Suspended: 4, Retired: 3,
    total: 54,
  },
  recentTrips: [
    { id: 'TR-1042', vehicle: 'VH-012', driver: 'A. Patel',  status: 'Dispatched', eta: '14:20' },
    { id: 'TR-1041', vehicle: 'VH-007', driver: 'M. Singh',  status: 'On Trip',    eta: '15:05' },
    { id: 'TR-1040', vehicle: 'VH-019', driver: 'L. Okonkwo',status: 'Completed',   eta: '—' },
    { id: 'TR-1039', vehicle: 'VH-003', driver: 'S. Tanaka',  status: 'Dispatched', eta: '15:40' },
    { id: 'TR-1038', vehicle: 'VH-021', driver: 'R. Costa',   status: 'Cancelled',   eta: '—' },
    { id: 'TR-1037', vehicle: 'VH-014', driver: 'D. Müller',  status: 'On Trip',    eta: '16:00' },
    { id: 'TR-1036', vehicle: 'VH-009', driver: 'P. Adisa',   status: 'Completed',   eta: '—' },
  ],
  vehicles: [
    { reg: 'VH-001', name: 'Ford Transit',     type: 'Van',   capacity: 1200, odometer: 84210, cost: 38000, status: 'Available' },
    { reg: 'VH-002', name: 'Mercedes Sprinter',type: 'Van',   capacity: 1500, odometer: 121000,cost: 52000, status: 'On Trip' },
    { reg: 'VH-003', name: 'Iveco Daily',      type: 'Truck', capacity: 3500, odometer: 158430,cost: 64000, status: 'Available' },
    { reg: 'VH-004', name: 'Volvo FH16',       type: 'Truck', capacity: 18000,odometer: 220100,cost: 145000,status: 'In Shop' },
    { reg: 'VH-005', name: 'Toyota Hiace',     type: 'Van',   capacity: 1000, odometer: 56000, cost: 32000, status: 'Available' },
    { reg: 'VH-006', name: 'Renault Master',   type: 'Van',   capacity: 1300, odometer: 92010, cost: 41000, status: 'On Trip' },
    { reg: 'VH-007', name: 'MAN TGX',          type: 'Truck', capacity: 22000,odometer: 310220,cost: 168000,status: 'On Trip' },
    { reg: 'VH-008', name: 'Fiat Ducato',      type: 'Van',   capacity: 1400, odometer: 77000, cost: 36000, status: 'Available' },
    { reg: 'VH-009', name: 'Scania R500',      type: 'Truck', capacity: 25000,odometer: 285600,cost: 175000,status: 'Retired' },
    { reg: 'VH-010', name: 'VW Crafter',       type: 'Van',   capacity: 1700, odometer: 110000,cost: 47000, status: 'In Shop' },
    { reg: 'VH-011', name: 'DAF XF',           type: 'Truck', capacity: 20000,odometer: 198000,cost: 152000,status: 'Available' },
    { reg: 'VH-012', name: 'Citroën Jumper',   type: 'Van',   capacity: 1400, odometer: 88900, cost: 39000, status: 'On Trip' },
    { reg: 'VH-013', name: 'Hyundai H100',     type: 'Van',   capacity: 950,  odometer: 45000, cost: 28000, status: 'Available' },
    { reg: 'VH-014', name: 'Volvo FL',         type: 'Truck', capacity: 12000,odometer: 142000,cost: 98000, status: 'On Trip' },
    { reg: 'VH-015', name: 'Mercedes Atego',   type: 'Truck', capacity: 7500, odometer: 132500,cost: 72000, status: 'Available' },
  ],
  drivers: [
    { name: 'Aarav Patel',   license: 'DL-9A12-4421', cat: 'HMV',   expiry: '2027-08-12', contact: '+1 415 555 0142', compl: 96, safety: 92, status: 'On Trip' },
    { name: 'Mei Singh',     license: 'DL-3B07-1180', cat: 'LMV',   expiry: '2025-12-01', contact: '+1 415 555 0381', compl: 88, safety: 85, status: 'Off Duty' },
    { name: 'Lola Okonkwo',  license: 'DL-7C19-0098', cat: 'HMV',   expiry: '2024-02-04', contact: '+1 415 555 0920', compl: 72, safety: 78, status: 'Suspended' },
    { name: 'Sora Tanaka',   license: 'DL-2D24-5511', cat: 'MCWG',  expiry: '2028-04-22', contact: '+1 415 555 0177', compl: 91, safety: 89, status: 'On Trip' },
    { name: 'Rafael Costa',  license: 'DL-5E05-7702', cat: 'HMV',   expiry: '2026-11-30', contact: '+1 415 555 0421', compl: 82, safety: 88, status: 'Off Duty' },
    { name: 'Doris Müller',  license: 'DL-8F11-3344', cat: 'LMV',   expiry: '2029-01-15', contact: '+1 415 555 0288', compl: 94, safety: 95, status: 'On Trip' },
    { name: 'Pelumi Adisa',  license: 'DL-1G22-6655', cat: 'HMV',   expiry: '2027-06-09', contact: '+1 415 555 0119', compl: 87, safety: 90, status: 'Available' },
    { name: 'Ivo Petrović',  license: 'DL-4H17-2200', cat: 'MCWOG', expiry: '2026-09-19', contact: '+1 415 555 0644', compl: 79, safety: 81, status: 'Available' },
  ],
  trips: [
    { id: 'TR-1042', source: 'Mumbai WH',    dest: 'Pune Depot',     vehicle: 'VH-012', driver: 'Aarav Patel',  weight: 800,  distance: 148, status: 'Dispatched' },
    { id: 'TR-1041', source: 'Chennai Hub',  dest: 'Bangalore DC',   vehicle: 'VH-007', driver: 'Mei Singh',    weight: 2200, distance: 350, status: 'On Trip' },
    { id: 'TR-1040', source: 'Delhi North',  dest: 'Jaipur Yard',    vehicle: 'VH-019', driver: 'Lola Okonkwo', weight: 540,  distance: 280, status: 'Completed' },
    { id: 'TR-1039', source: 'Hyderabad',    dest: 'Vizag Port',     vehicle: 'VH-003', driver: 'Sora Tanaka',  weight: 1900, distance: 620, status: 'Dispatched' },
    { id: 'TR-1038', source: 'Kolkata WH',   dest: 'Bhubaneswar',    vehicle: 'VH-021', driver: 'Rafael Costa', weight: 700,  distance: 440, status: 'Cancelled' },
  ],
  maintenance: [
    { vehicle: 'VH-004', service: 'Engine overhaul', cost: 4200, date: '2026-07-08', status: 'In Progress' },
    { vehicle: 'VH-010', service: 'Brake pad replacement', cost: 380, date: '2026-07-05', status: 'Completed' },
    { vehicle: 'VH-009', service: 'Transmission rebuild', cost: 6800, date: '2026-06-28', status: 'Completed' },
    { vehicle: 'VH-002', service: 'Oil change + filter', cost: 220, date: '2026-07-10', status: 'Pending' },
    { vehicle: 'VH-014', service: 'Tire rotation', cost: 160, date: '2026-07-09', status: 'Completed' },
  ],
  fuel: [
    { vehicle: 'VH-001', date: '2026-07-10', liters: 62.4, cost: 92 },
    { vehicle: 'VH-003', date: '2026-07-10', liters: 118.0,cost: 178 },
    { vehicle: 'VH-007', date: '2026-07-09', liters: 240.5,cost: 362 },
    { vehicle: 'VH-012', date: '2026-07-08', liters: 71.2, cost: 107 },
    { vehicle: 'VH-014', date: '2026-07-08', liters: 195.0,cost: 293 },
  ],
  expenses: [
    { date: '2026-07-10', vehicle: 'VH-001', category: 'Toll',     description: 'I-95 corridor',     amount: 38 },
    { date: '2026-07-09', vehicle: 'VH-007', category: 'Toll',     description: 'Highway 401',        amount: 92 },
    { date: '2026-07-08', vehicle: 'VH-012', category: 'Parking',  description: 'Downtown depot',     amount: 24 },
    { date: '2026-07-07', vehicle: '—',      category: 'Misc',     description: 'Driver allowance',   amount: 150 },
    { date: '2026-07-05', vehicle: 'VH-014', category: 'Toll',     description: 'Tunnel express',     amount: 18 },
  ],
  metrics: {
    fuelEff: 9.4,
    utilization: 78,
    opCost: 184520,
    roi: 22.6,
  },
  monthly: [
    { m: 'Jan', v: 124 }, { m: 'Feb', v: 142 }, { m: 'Mar', v: 158 },
    { m: 'Apr', v: 173 }, { m: 'May', v: 165 }, { m: 'Jun', v: 188 },
    { m: 'Jul', v: 211 },
  ],
  costliest: [
    { reg: 'VH-009', fuel: 4200, maint: 6800, other: 1100 },
    { reg: 'VH-007', fuel: 3620, maint: 2400, other: 920  },
    { reg: 'VH-014', fuel: 2100, maint: 1800, other: 600  },
    { reg: 'VH-002', fuel: 1450, maint: 220  , other: 280  },
    { reg: 'VH-003', fuel: 1120, maint: 320  , other: 140  },
  ],
  rbac: {
    'Fleet Manager':      { Fleet: 'full', Driver: 'full', Trips: 'full', 'Fuel/Exp': 'full', Analytics: 'full' },
    'Dispatcher':         { Fleet: 'view', Driver: 'view', Trips: 'full', 'Fuel/Exp': 'view', Analytics: 'view' },
    'Safety Officer':     { Fleet: 'view', Driver: 'full', Trips: 'view', 'Fuel/Exp': 'none', Analytics: 'view' },
    'Financial Analyst':  { Fleet: 'view', Driver: 'view', Trips: 'view', 'Fuel/Exp': 'full', Analytics: 'full' },
  },
};

/* ============================================================
   ROUTER
   ============================================================ */
function render() {
  const c = $('#content');
  const r = {
    dashboard:   viewDashboard,
    fleet:       viewFleet,
    drivers:     viewDrivers,
    trips:       viewTrips,
    maintenance: viewMaintenance,
    fuel:        viewFuel,
    analytics:   viewAnalytics,
    settings:    viewSettings,
  }[APP.page];
  if (r) r(c);
}

/* ---------- shared bits ---------- */
function statusPill(s) {
  const m = {
    'Available':'pill-green', 'On Trip':'pill-blue', 'Dispatched':'pill-blue',
    'In Shop':'pill-amber', 'Suspended':'pill-amber', 'Retired':'pill-red',
    'Completed':'pill-green','Cancelled':'pill-red', 'Draft':'pill-gray',
    'Off Duty':'pill-gray',
    'Pending':'pill-amber', 'In Progress':'pill-amber',
  };
  return `<span class="pill ${m[s] || 'pill-gray'}">${esc(s)}</span>`;
}

/* ============================================================
   1. DASHBOARD
   ============================================================ */
function viewDashboard(c) {
  const k = DATA.kpis;
  c.innerHTML = `
    <div class="kpi-row-7">
      <div class="kpi b-blue">
        <div class="kpi-label">Active Vehicles</div>
        <div class="kpi-value">${k.active}</div>
        <div class="kpi-foot">in operation</div>
      </div>
      <div class="kpi b-green">
        <div class="kpi-label">Available Vehicles</div>
        <div class="kpi-value">${k.available}</div>
        <div class="kpi-foot">ready to dispatch</div>
      </div>
      <div class="kpi b-amber">
        <div class="kpi-label">Vehicles in Maintenance</div>
        <div class="kpi-value">${k.maint}</div>
        <div class="kpi-foot">being serviced</div>
      </div>
      <div class="kpi b-orange">
        <div class="kpi-label">Active Trips</div>
        <div class="kpi-value">${k.activeTrips}</div>
        <div class="kpi-foot">on the road</div>
      </div>
      <div class="kpi b-purple">
        <div class="kpi-label">Pending Trips</div>
        <div class="kpi-value">${k.pending}</div>
        <div class="kpi-foot">awaiting dispatch</div>
      </div>
      <div class="kpi b-teal">
        <div class="kpi-label">Drivers On Duty</div>
        <div class="kpi-value">${k.driversOnDuty}</div>
        <div class="kpi-foot">clocked in</div>
      </div>
      <div class="kpi b-red">
        <div class="kpi-label">Fleet Utilization</div>
        <div class="kpi-value">${k.utilization}%</div>
        <div class="kpi-foot">last 7 days</div>
      </div>
    </div>

    <div class="split-2">
      <div class="panel">
        <h2>Recent Trips <span class="h2-sub">last 7 dispatched</span></h2>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Trip ID</th><th>Vehicle</th><th>Driver</th>
              <th>Status</th><th>ETA</th>
            </tr></thead>
            <tbody>
              ${DATA.recentTrips.map(t => `
                <tr>
                  <td><b>${esc(t.id)}</b></td>
                  <td>${esc(t.vehicle)}</td>
                  <td>${esc(t.driver)}</td>
                  <td>${statusPill(t.status)}</td>
                  <td>${esc(t.eta)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h2>Vehicle Status <span class="h2-sub">fleet distribution</span></h2>
        ${renderStatusBars()}
      </div>
    </div>
  `;
}

function renderStatusBars() {
  const s = DATA.statusDistribution;
  const total = s.total;
  const segs = [
    { cls: 's-avail',  label: 'Available',  val: s.Available,  color: '#81B29A' },
    { cls: 's-trip',   label: 'On Trip',    val: s['On Trip'], color: '#3D5A80' },
    { cls: 's-shop',   label: 'In Shop',    val: s['In Shop'], color: '#F2A65A' },
    { cls: 's-susp',   label: 'Suspended',  val: s.Suspended,  color: '#E0A340' },
    { cls: 's-retire', label: 'Retired',    val: s.Retired,    color: '#E63946' },
  ];
  return `
    <div class="status-bars">
      ${segs.map(seg => {
        const pct = (seg.val / total) * 100;
        return `
          <div class="sb-row">
            <div class="sb-label">
              <span><span class="lg-dot" style="background:${seg.color}"></span> ${seg.label}</span>
              <b>${seg.val} <span class="muted" style="font-weight:400">(${pct.toFixed(0)}%)</span></b>
            </div>
            <div class="sb-track">
              <div class="sb-seg ${seg.cls}" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <div class="sb-legend">
      <div class="lg"><span class="lg-dot" style="background:#81B29A"></span> Available</div>
      <div class="lg"><span class="lg-dot" style="background:#3D5A80"></span> On Trip</div>
      <div class="lg"><span class="lg-dot" style="background:#F2A65A"></span> In Shop</div>
      <div class="lg"><span class="lg-dot" style="background:#E0A340"></span> Suspended</div>
      <div class="lg"><span class="lg-dot" style="background:#E63946"></span> Retired</div>
    </div>
  `;
}

/* ============================================================
   2. FLEET REGISTRY
   ============================================================ */
function viewFleet(c) {
  const types = ['All', ...new Set(DATA.vehicles.map(v => v.type))];
  const statuses = ['All', 'Available', 'On Trip', 'In Shop', 'Suspended', 'Retired'];

  c.innerHTML = `
    <div class="panel">
      <div class="controls-row">
        <select id="f-type">
          ${types.map(t => `<option>${esc(t)}</option>`).join('')}
        </select>
        <select id="f-status">
          ${statuses.map(s => `<option>${esc(s)}</option>`).join('')}
        </select>
        <input type="search" id="f-search" placeholder="Search reg. no, name, model…" />
        <button class="btn-orange" id="add-vehicle">+ Add Vehicle</button>
      </div>
      <div class="table-wrap">
        <table id="v-table">
          <thead><tr>
            <th>Reg. No</th><th>Name / Model</th><th>Type</th>
            <th>Capacity</th><th>Odometer</th><th>Acq. Cost</th><th>Status</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;
  drawFleet(DATA.vehicles);
  $('#f-type').addEventListener('change', applyFilter);
  $('#f-status').addEventListener('change', applyFilter);
  $('#f-search').addEventListener('input', applyFilter);
  $('#add-vehicle').addEventListener('click', () => alert('Add Vehicle modal — wire to your backend'));

  function applyFilter() {
    const t = $('#f-type').value;
    const s = $('#f-status').value;
    const q = $('#f-search').value.toLowerCase().trim();
    drawFleet(DATA.vehicles.filter(v =>
      (t === 'All' || v.type === t) &&
      (s === 'All' || v.status === s) &&
      (!q || v.reg.toLowerCase().includes(q) || v.name.toLowerCase().includes(q))
    ));
  }
  function drawFleet(list) {
    const tb = $('#v-table tbody');
    if (!list.length) { tb.innerHTML = `<tr><td colspan="7" class="no-data">No vehicles match.</td></tr>`; return; }
    tb.innerHTML = list.map(v => `
      <tr>
        <td><b>${esc(v.reg)}</b></td>
        <td>${esc(v.name)}</td>
        <td>${esc(v.type)}</td>
        <td>${v.capacity.toLocaleString()} kg</td>
        <td>${v.odometer.toLocaleString()} km</td>
        <td>${fmt$(v.cost)}</td>
        <td>${statusPill(v.status)}</td>
      </tr>
    `).join('');
  }
}

/* ============================================================
   3. DRIVER MANAGEMENT
   ============================================================ */
function viewDrivers(c) {
  c.innerHTML = `
    <div class="panel">
      <div class="table-wrap">
        <table id="d-table">
          <thead><tr>
            <th>Driver Name</th><th>License No</th><th>Category</th>
            <th>Expiry Date</th><th>Contact</th><th>Trip Compl %</th>
            <th>Safety Score</th><th>Status</th>
          </tr></thead>
          <tbody></tbody>
        </table>
      </div>

      <div class="toggle-bar">
        <div class="toggle-block tb-on" data-status="Available">
          <div class="toggle-swatch"></div>
          <div class="toggle-label"><b>${DATA.drivers.filter(d=>d.status==='Available').length}</b> Available</div>
        </div>
        <div class="toggle-block tb-trip" data-status="On Trip">
          <div class="toggle-swatch"></div>
          <div class="toggle-label"><b>${DATA.drivers.filter(d=>d.status==='On Trip').length}</b> On Trip</div>
        </div>
        <div class="toggle-block tb-off" data-status="Off Duty">
          <div class="toggle-swatch"></div>
          <div class="toggle-label"><b>${DATA.drivers.filter(d=>d.status==='Off Duty').length}</b> Off Duty</div>
        </div>
        <div class="toggle-block tb-susp" data-status="Suspended">
          <div class="toggle-swatch"></div>
          <div class="toggle-label"><b>${DATA.drivers.filter(d=>d.status==='Suspended').length}</b> Suspended</div>
        </div>
      </div>
    </div>
  `;
  const tb = $('#d-table tbody');
  tb.innerHTML = DATA.drivers.map(d => {
    const expired = new Date(d.expiry) < new Date();
    return `
      <tr>
        <td><b>${esc(d.name)}</b></td>
        <td>${esc(d.license)}</td>
        <td>${esc(d.cat)}</td>
        <td>${esc(d.expiry)} ${expired ? '<span class="expired-warn">EXPIRED</span>' : ''}</td>
        <td>${esc(d.contact)}</td>
        <td>${d.compl}%</td>
        <td>${d.safety}</td>
        <td>${statusPill(d.status)}</td>
      </tr>
    `;
  }).join('');

  // Toggle filter interaction
  let active = null;
  $$('.toggle-block').forEach(b => b.addEventListener('click', () => {
    if (active === b.dataset.status) {
      b.classList.remove('active');
      active = null;
      tb.querySelectorAll('tr').forEach(r => r.style.display = '');
    } else {
      $$('.toggle-block').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      active = b.dataset.status;
      tb.querySelectorAll('tr').forEach(r => {
        const s = r.querySelector('.pill')?.textContent.trim();
        r.style.display = (s === active) ? '' : 'none';
      });
    }
  }));
}

/* ============================================================
   4. TRIP DISPATCHER
   ============================================================ */
function viewTrips(c) {
  // pre-selected vehicle determines capacity (data attribute on <option>)
  c.innerHTML = `
    <div class="split-unequal">
      <div class="panel">
        <h2>Create Trip</h2>
        <form class="form-stack" id="trip-form">
          <label><span>Source</span><input type="text" id="t-src" placeholder="Mumbai Warehouse" required /></label>
          <label><span>Destination</span><input type="text" id="t-dst" placeholder="Pune Depot" required /></label>
          <label><span>Vehicle</span>
            <select id="t-veh" required>
              <option value="">— select vehicle —</option>
              ${DATA.vehicles.filter(v=>v.status==='Available').map(v =>
                `<option value="${v.reg}" data-cap="${v.capacity}">${esc(v.reg)} · ${esc(v.name)} (${v.capacity} kg)</option>`).join('')}
            </select>
          </label>
          <label><span>Driver</span>
            <select id="t-drv" required>
              <option value="">— select driver —</option>
              ${DATA.drivers.filter(d=>['Available','Off Duty'].includes(d.status)).map(d =>
                `<option>${esc(d.name)}</option>`).join('')}
            </select>
          </label>
          <label><span>Cargo Weight (KG)</span><input type="number" id="t-wt" min="0" value="0" required /></label>

          <div id="cap-alert" class="alert-red hidden">
            <span class="alert-icon">⚠️</span>
            <div><b>Capacity exceeded by <span id="cap-excess">0</span> kg</b> — dispatch blocked.</div>
          </div>

          <label><span>Planned Distance (KM)</span><input type="number" id="t-dist" min="0" value="100" required /></label>
          <button type="submit" class="btn-primary-orange" id="t-submit">Dispatch</button>
        </form>
      </div>

      <div class="live-board">
        <h3>Live Board <span class="h2-sub">active trips</span></h3>
        <div class="stepper-list">
          ${renderStepper()}
        </div>
      </div>
    </div>
  `;

  // Capacity logic
  const vehSel = $('#t-veh'), wtIn = $('#t-wt'), alert = $('#cap-alert'),
        excessEl = $('#cap-excess'), submit = $('#t-submit');
  function evaluate() {
    const opt = vehSel.options[vehSel.selectedIndex];
    const cap = opt ? parseInt(opt.dataset.cap || 0, 10) : 0;
    const wt  = parseInt(wtIn.value || 0, 10);
    const over = wt - cap;
    if (cap > 0 && over > 0) {
      alert.classList.remove('hidden');
      excessEl.textContent = over;
      submit.classList.add('btn-disabled');
      submit.setAttribute('disabled', 'disabled');
      submit.textContent = 'Dispatch (blocked)';
    } else {
      alert.classList.add('hidden');
      submit.classList.remove('btn-disabled');
      submit.removeAttribute('disabled');
      submit.textContent = 'Dispatch';
    }
  }
  vehSel.addEventListener('change', evaluate);
  wtIn.addEventListener('input', evaluate);

  $('#trip-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (submit.hasAttribute('disabled')) return;
    alert('Trip dispatched! (demo)');
  });
}

function renderStepper() {
  // Render a single "active" stepper that shows lifecycle nodes
  const stages = [
    { key: 'draft',      label: 'Draft',      meta: 'Trip created · awaiting dispatch' },
    { key: 'dispatched', label: 'Dispatched', meta: 'Assigned to vehicle & driver' },
    { key: 'completed',  label: 'Completed',  meta: 'Cargo delivered' },
    { key: 'cancelled',  label: 'Cancelled',  meta: 'Trip terminated' },
  ];
  return stages.map((s, i) => {
    const cls = i < 2 ? 'done' : (i === 2 ? 'active' : '');
    const icon = { draft:'📝', dispatched:'🚚', completed:'✅', cancelled:'✖' }[s.key];
    return `
      <div class="step ${cls}">
        <div class="step-node">${icon}</div>
        <div class="step-body">
          <div class="step-title">${s.label}</div>
          <div class="step-meta">${s.meta}</div>
        </div>
      </div>
    `;
  }).join('');
}

/* ============================================================
   5. MAINTENANCE
   ============================================================ */
function viewMaintenance(c) {
  c.innerHTML = `
    <div class="maint-grid">
      <div class="panel">
        <h2>Log Service Record</h2>
        <form class="form-stack" id="m-form">
          <label><span>Vehicle</span>
            <select required>
              <option value="">— select —</option>
              ${DATA.vehicles.map(v => `<option>${esc(v.reg)} · ${esc(v.name)}</option>`).join('')}
            </select>
          </label>
          <label><span>Service Type</span>
            <select required>
              <option>Oil change</option>
              <option>Tire rotation</option>
              <option>Brake service</option>
              <option>Engine overhaul</option>
              <option>Transmission</option>
              <option>Inspection</option>
            </select>
          </label>
          <label><span>Cost</span><input type="number" min="0" placeholder="0.00" required /></label>
          <label><span>Date</span><input type="date" value="${new Date().toISOString().slice(0,10)}" required /></label>
          <label><span>Status</span>
            <select required>
              <option>Pending</option>
              <option>In Progress</option>
              <option>Completed</option>
            </select>
          </label>
          <button type="submit" class="btn-primary-orange">Save</button>
        </form>
      </div>

      <div class="panel">
        <h2>Service Log <span class="h2-sub">${DATA.maintenance.length} records</span></h2>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Vehicle</th><th>Service</th><th>Cost</th>
              <th>Date</th><th>Status</th>
            </tr></thead>
            <tbody>
              ${DATA.maintenance.map(m => `
                <tr>
                  <td><b>${esc(m.vehicle)}</b></td>
                  <td>${esc(m.service)}</td>
                  <td>${fmt$(m.cost)}</td>
                  <td>${esc(m.date)}</td>
                  <td>${statusPill(m.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  $('#m-form').addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Service record saved (demo).');
  });
}

/* ============================================================
   6. FUEL & EXPENSES
   ============================================================ */
function viewFuel(c) {
  const fuelTotal = DATA.fuel.reduce((s, f) => s + f.cost, 0);
  const expTotal  = DATA.expenses.reduce((s, e) => s + e.amount, 0);
  const maintTotal = DATA.maintenance.reduce((s, m) => s + m.cost, 0);
  const total = fuelTotal + maintTotal + expTotal;

  c.innerHTML = `
    <div class="fuel-section">
      <div class="panel">
        <div class="flex-between" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0">Fuel Logs</h3>
          <div class="fuel-top-actions">
            <button class="btn-orange">+ Log Fuel</button>
            <button class="btn-orange">+ Add Expense</button>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Vehicle</th><th>Date</th><th>Liters</th><th>Fuel Cost</th>
            </tr></thead>
            <tbody>
              ${DATA.fuel.map(f => `
                <tr>
                  <td><b>${esc(f.vehicle)}</b></td>
                  <td>${esc(f.date)}</td>
                  <td>${f.liters.toFixed(1)} L</td>
                  <td>${fmt$(f.cost)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="fuel-section">
      <div class="panel">
        <h3>Other Expenses (Toll / Misc)</h3>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th>Date</th><th>Vehicle</th><th>Category</th><th>Description</th><th>Amount</th>
            </tr></thead>
            <tbody>
              ${DATA.expenses.map(x => `
                <tr>
                  <td>${esc(x.date)}</td>
                  <td>${esc(x.vehicle)}</td>
                  <td>${esc(x.category)}</td>
                  <td>${esc(x.description)}</td>
                  <td>${fmt$(x.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="summary-line">
      <div>
        <div class="summary-label">Total Operational Cost (auto)</div>
        <div class="muted" style="font-size:11px; font-weight:400; margin-top:2px;">
          FUEL ${fmt$(fuelTotal)} + MAINT ${fmt$(maintTotal)} + EXP ${fmt$(expTotal)}
        </div>
      </div>
      <div class="summary-value">${fmt$(total)}</div>
    </div>
  `;
}

/* ============================================================
   7. REPORTS & ANALYTICS
   ============================================================ */
function viewAnalytics(c) {
  const M = DATA.metrics;
  const maxV = Math.max(...DATA.monthly.map(m => m.v));
  const maxCost = Math.max(...DATA.costliest.map(c => c.fuel + c.maint + c.other));

  c.innerHTML = `
    <div class="metrics-row-4">
      <div class="metric-card m-green">
        <div class="mc-label">Fuel Efficiency</div>
        <div class="mc-value">${M.fuelEff} <span style="font-size:14px; color:var(--text-soft); font-weight:600">km/L</span></div>
        <div class="mc-trend">▲ 3.2% vs last month</div>
      </div>
      <div class="metric-card m-blue">
        <div class="mc-label">Fleet Utilization</div>
        <div class="mc-value">${M.utilization}<span style="font-size:18px">%</span></div>
        <div class="mc-trend">▲ 5.1% vs last month</div>
      </div>
      <div class="metric-card m-orange">
        <div class="mc-label">Operational Cost</div>
        <div class="mc-value">${fmt$(M.opCost)}</div>
        <div class="mc-trend" style="color:var(--warning)">▼ 1.4% vs last month</div>
      </div>
      <div class="metric-card m-amber">
        <div class="mc-label">Vehicle ROI</div>
        <div class="mc-value">${M.roi}<span style="font-size:18px">%</span></div>
        <div class="mc-trend">▲ 2.8% vs last month</div>
      </div>
    </div>

    <div class="analytics-grid">
      <div class="panel">
        <h2>Monthly Revenue <span class="h2-sub">2026</span></h2>
        <div class="vbar-chart">
          ${DATA.monthly.map(m => {
            const h = (m.v / maxV) * 100;
            return `
              <div class="vbar-col">
                <div class="vbar" style="height:${h}%"><span class="vbar-val">${m.v}k</span></div>
                <div class="vbar-label">${m.m}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="muted" style="font-size:11px; margin-top:10px; text-align:center">
          Revenue in thousands ($) · YTD total: ${fmt$(DATA.monthly.reduce((s,m)=>s+m.v,0))}k
        </div>
      </div>

      <div class="panel">
        <h2>Top Costliest Vehicles <span class="h2-sub">fuel + maint + other</span></h2>
        <div class="hbars">
          ${DATA.costliest.map(cv => {
            const tot = cv.fuel + cv.maint + cv.other;
            const fp = (cv.fuel / maxCost) * 100;
            const mp = (cv.maint / maxCost) * 100;
            const op = (cv.other / maxCost) * 100;
            return `
              <div class="hbar-row">
                <div class="hbar-head">
                  <b>${esc(cv.reg)}</b>
                  <span>${fmt$(tot)}</span>
                </div>
                <div class="hbar-track">
                  <div class="hbar-seg hs-fuel"  style="width:${fp.toFixed(1)}%"></div>
                  <div class="hbar-seg hs-maint" style="width:${mp.toFixed(1)}%"></div>
                  <div class="hbar-seg hs-other" style="width:${op.toFixed(1)}%"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="hbar-legend">
          <div class="lg"><span class="lg-dot" style="background:#3D5A80"></span> Fuel</div>
          <div class="lg"><span class="lg-dot" style="background:#F2A65A"></span> Maintenance</div>
          <div class="lg"><span class="lg-dot" style="background:#E07A5F"></span> Other</div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================================
   8. SETTINGS & RBAC
   ============================================================ */
function viewSettings(c) {
  c.innerHTML = `
    <div class="settings-grid">
      <div class="panel">
        <h2>General</h2>
        <form class="form-stack" id="settings-form">
          <label><span>Depot Name</span>
            <input type="text" id="s-depot" value="${esc(APP.settings.depotName)}" />
          </label>
          <label><span>Currency</span>
            <select id="s-cur">
              ${['USD','EUR','GBP','INR','JPY','AUD','CAD'].map(x =>
                `<option ${x===APP.settings.currency?'selected':''}>${x}</option>`).join('')}
            </select>
          </label>
          <label><span>Distance Unit</span>
            <select id="s-dist">
              ${['km','mi'].map(x =>
                `<option ${x===APP.settings.distanceUnit?'selected':''}>${x}</option>`).join('')}
            </select>
          </label>
          <button type="submit" class="btn-primary-orange">Save Settings</button>
        </form>
      </div>

      <div class="panel">
        <h2>Role-Based Access (RBAC) <span class="h2-sub">granular permissions</span></h2>
        <div class="table-wrap">
          <table class="rbac-table">
            <thead>
              <tr>
                <th style="text-align:left">Role</th>
                <th>Fleet</th><th>Driver</th><th>Trips</th>
                <th>Fuel/Exp</th><th>Analytics</th>
              </tr>
            </thead>
            <tbody>
              ${Object.entries(DATA.rbac).map(([role, perms]) => `
                <tr>
                  <th>
                    <span class="role-swatch" style="background:${
                      { 'Fleet Manager':'#E07A5F', 'Dispatcher':'#3D5A80',
                        'Safety Officer':'#81B29A', 'Financial Analyst':'#F2A65A' }[role]
                    }"></span>${esc(role)}
                  </th>
                  ${['Fleet','Driver','Trips','Fuel/Exp','Analytics'].map(col => {
                    const v = perms[col];
                    if (v === 'full') return `<td><span class="check">✓</span></td>`;
                    if (v === 'view') return `<td><span class="view">view</span></td>`;
                    return `<td><span class="none">—</span></td>`;
                  }).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div class="muted" style="font-size:11px; margin-top:12px">
          <span class="check">✓</span> = full access &nbsp;·&nbsp;
          <span class="view" style="color:var(--info-light)">view</span> = read-only &nbsp;·&nbsp;
          <span class="none">—</span> = no access
        </div>
      </div>
    </div>
  `;
  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    APP.settings.depotName   = $('#s-depot').value;
    APP.settings.currency    = $('#s-cur').value;
    APP.settings.distanceUnit= $('#s-dist').value;
    alert('Settings saved (demo).');
  });
}
