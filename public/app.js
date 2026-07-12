/* TransitOps - Frontend single-page app
 * Vanilla JS, fetch-based, JWT in httpOnly cookie, role-aware navigation.
 */

const API = '/api';
let state = {
  user: null,
  page: 'dashboard',
  cache: {},
  theme: localStorage.getItem('theme') || 'light',
};

// Apply theme as soon as possible to avoid flash
document.documentElement.setAttribute('data-theme', state.theme);

// =================== Helpers =================== //
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(msg, kind = 'success') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast ${kind}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) {
    showLogin();
    throw new Error('Not authenticated');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtINR(n) { return '₹ ' + Number(n || 0).toLocaleString('en-IN'); }
function fmtKm(n) { return Number(n || 0).toLocaleString('en-IN'); }

// =================== Auth =================== //
function showLogin() {
  $('#app').classList.add('hidden');
  $('#login-screen').classList.remove('hidden');
  state.user = null;
}
function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#user-name').textContent = state.user.name;
  $('#user-role').textContent = state.user.role;
  buildNav();
  navigate(state.page);
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const { user } = await api('/auth/login', {
      method: 'POST',
      body: { email: $('#email').value, password: $('#password').value },
    });
    state.user = user;
    toast(`Welcome, ${user.name}!`);
    showApp();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

$('#logout-btn').addEventListener('click', async () => {
  await api('/auth/logout', { method: 'POST' });
  showLogin();
});

$('#theme-toggle').addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
});

// =================== Navigation =================== //
const NAV_ITEMS = [
  { id: 'dashboard',     label: '📊 Dashboard',       roles: ['*'] },
  { id: 'vehicles',      label: '🚐 Vehicles',        roles: ['*'] },
  { id: 'drivers',       label: '👤 Drivers',         roles: ['*'] },
  { id: 'trips',         label: '📦 Trips',           roles: ['*'] },
  { id: 'maintenance',   label: '🛠️ Maintenance',     roles: ['*'] },
  { id: 'fuel',          label: '⛽ Fuel & Expenses', roles: ['*'] },
  { id: 'reports',       label: '📈 Reports',         roles: ['*'] },
  { id: 'notifications', label: '🔔 Notifications',   roles: ['*'] },
  { id: 'users',         label: '👥 Users',           roles: ['Fleet Manager'] },
];

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  for (const item of NAV_ITEMS) {
    if (!item.roles.includes('*') && !item.roles.includes(state.user.role)) continue;
    const btn = document.createElement('button');
    btn.textContent = item.label;
    btn.dataset.page = item.id;
    if (state.page === item.id) btn.classList.add('active');
    btn.addEventListener('click', () => navigate(item.id));
    nav.appendChild(btn);
  }
}

function navigate(page) {
  state.page = page;
  $$('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  const titles = { dashboard:'Operations Dashboard', vehicles:'Vehicle Registry', drivers:'Driver Management',
    trips:'Trip Management', maintenance:'Maintenance', fuel:'Fuel & Expenses', reports:'Reports & Analytics',
    notifications:'Notifications', users:'User Management' };
  $('#page-title').textContent = titles[page] || page;
  render();
}

// =================== Modal =================== //
const modal = {
  open(title, bodyHTML, onMount) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHTML;
    $('#modal-backdrop').classList.remove('hidden');
    if (onMount) onMount($('#modal-body'));
  },
  close() { $('#modal-backdrop').classList.add('hidden'); },
};
$('#modal-close').addEventListener('click', modal.close);
$('#modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'modal-backdrop') modal.close();
});

// =================== Router / Renderer =================== //
async function render() {
  const c = $('#content');
  c.innerHTML = '<p class="text-soft">Loading…</p>';
  try {
    switch (state.page) {
      case 'dashboard':     await renderDashboard(c); break;
      case 'vehicles':      await renderVehicles(c); break;
      case 'drivers':       await renderDrivers(c); break;
      case 'trips':         await renderTrips(c); break;
      case 'maintenance':   await renderMaintenance(c); break;
      case 'fuel':          await renderFuel(c); break;
      case 'reports':       await renderReports(c); break;
      case 'notifications': await renderNotifications(c); break;
      case 'users':         await renderUsers(c); break;
    }
    updateNotifBadge();
  } catch (e) {
    c.innerHTML = `<div class="card"><h3>⚠️ Error</h3><p>${escapeHtml(e.message)}</p></div>`;
  }
}

// =================== Notifications badge =================== //
async function updateNotifBadge() {
  try {
    const list = await api('/notifications');
    const unread = list.filter(n => !n.read).length;
    const badge = $('#notif-count');
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);
  } catch {}
}
$('#notif-bell').addEventListener('click', () => navigate('notifications'));

// =================== Dashboard =================== //
async function renderDashboard(c) {
  const [kpis, vehicles] = await Promise.all([api('/kpis'), api('/vehicles')]);
  c.innerHTML = `
    <div class="card">
      <div class="row">
        <div><label>Vehicle Type</label>
          <select id="f-type"><option value="">All</option>
            <option>Van</option><option>Truck</option><option>Car</option><option>Bus</option>
          </select></div>
        <div><label>Status</label>
          <select id="f-status"><option value="">All</option>
            <option>Available</option><option>On Trip</option><option>In Shop</option><option>Retired</option>
          </select></div>
        <div><label>Region</label>
          <select id="f-region"><option value="">All</option>
            <option>Central</option><option>North</option><option>South</option><option>West</option><option>East</option>
          </select></div>
        <div style="display:flex;align-items:flex-end;">
          <button class="btn" id="clear-filters">Clear filters</button>
        </div>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi accent"><span class="label">🚐 Active Vehicles</span><span class="value">${kpis.active_vehicles}</span></div>
      <div class="kpi"><span class="label">✅ Available</span><span class="value">${kpis.available_vehicles}</span></div>
      <div class="kpi"><span class="label">🛠️ In Shop</span><span class="value">${kpis.in_shop}</span></div>
      <div class="kpi accent"><span class="label">📈 Fleet Utilization</span><span class="value">${kpis.fleet_utilization}%</span></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><span class="label">📦 Active Trips</span><span class="value">${kpis.active_trips}</span></div>
      <div class="kpi"><span class="label">📝 Pending Trips</span><span class="value">${kpis.pending_trips}</span></div>
      <div class="kpi"><span class="label">👤 Drivers On Duty</span><span class="value">${kpis.drivers_on_duty}</span></div>
      <div class="kpi"><span class="label">🚚 Total Fleet</span><span class="value">${kpis.total_vehicles}</span></div>
    </div>

    <div class="card">
      <h3>🚐 Fleet Snapshot</h3>
      <div class="table-wrap"><table id="v-table">
        <thead><tr>
          <th>Reg</th><th>Name</th><th>Type</th><th>Max Load</th><th>Odometer</th><th>Cost</th><th>Region</th><th>Status</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>📊 Status Distribution</h3>
      <div class="donut" id="donut"></div>
    </div>
  `;

  const tableBody = $('#v-table tbody', c);
  function drawVTable(list) {
    if (!list.length) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-soft">No vehicles match.</td></tr>`;
      return;
    }
    tableBody.innerHTML = list.map(v => `
      <tr>
        <td><b>${escapeHtml(v.reg_no)}</b></td>
        <td>${escapeHtml(v.name)}</td>
        <td>${escapeHtml(v.type)}</td>
        <td>${fmtKm(v.max_load_kg)} kg</td>
        <td>${fmtKm(v.odometer_km)} km</td>
        <td>${fmtINR(v.acquisition_cost)}</td>
        <td>${escapeHtml(v.region)}</td>
        <td>${statusPill(v.status)}</td>
      </tr>`).join('');
  }
  drawVTable(vehicles);
  drawDonut(vehicles);

  const filters = { type: $('#f-type', c), status: $('#f-status', c), region: $('#f-region', c) };
  Object.values(filters).forEach(sel => sel.addEventListener('change', async () => {
    const params = new URLSearchParams();
    if (filters.type.value) params.set('type', filters.type.value);
    if (filters.status.value) params.set('status', filters.status.value);
    if (filters.region.value) params.set('region', filters.region.value);
    const list = await api('/vehicles?' + params.toString());
    drawVTable(list);
    drawDonut(list);
  }));
  $('#clear-filters', c).addEventListener('click', () => {
    filters.type.value = ''; filters.status.value = ''; filters.region.value = '';
    drawVTable(vehicles); drawDonut(vehicles);
  });
}

function statusPill(status) {
  const cls = { 'Available':'pill-green','On Trip':'pill-blue','In Shop':'pill-amber',
                'Retired':'pill-gray','Off Duty':'pill-gray','Suspended':'pill-red',
                'Draft':'pill-gray','Dispatched':'pill-blue','Completed':'pill-green','Cancelled':'pill-red' }[status] || 'pill-gray';
  return `<span class="pill ${cls}">${escapeHtml(status)}</span>`;
}

function drawDonut(vehicles) {
  const counts = {};
  for (const v of vehicles) counts[v.status] = (counts[v.status] || 0) + 1;
  const entries = Object.entries(counts);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;
  const colors = { 'Available':'#16a34a','On Trip':'#2563eb','In Shop':'#f59e0b','Retired':'#94a3b8' };
  const r = 60, c = 80;
  let offset = 0;
  const segments = entries.map(([s, n]) => {
    const frac = n / total;
    const dash = `${(frac * 2 * Math.PI * r).toFixed(2)} ${(2 * Math.PI * r).toFixed(2)}`;
    const seg = `<circle cx="${c}" cy="${c}" r="${r}" fill="none"
                  stroke="${colors[s] || '#6366f1'}" stroke-width="20"
                  stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
                  transform="rotate(-90 ${c} ${c})"/>`;
    offset += frac * 2 * Math.PI * r;
    return seg;
  }).join('');
  $('#donut').innerHTML = `
    <svg class="donut-svg" viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="60" fill="none" stroke="var(--border)" stroke-width="20"/>
      ${segments}
      <text x="80" y="86" text-anchor="middle" font-size="22" font-weight="700"
            fill="var(--text)">${total}</text>
    </svg>
    <div class="donut-legend">
      ${entries.map(([s, n]) => `
        <div class="lg"><span class="lg-dot" style="background:${colors[s] || '#6366f1'}"></span>
        <span>${escapeHtml(s)} — <b>${n}</b></span></div>`).join('')}
    </div>
  `;
}

// =================== Vehicles =================== //
async function renderVehicles(c) {
  const vehicles = await api('/vehicles');
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>🚐 Vehicle Registry</h3>
        <button class="btn btn-primary" id="add-v">+ Add Vehicle</button>
      </div>
      <div class="table-wrap"><table id="v-list">
        <thead><tr>
          <th>Reg</th><th>Name</th><th>Type</th><th>Max Load</th><th>Odometer</th>
          <th>Cost</th><th>Region</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>
  `;
  const tbody = $('#v-list tbody', c);
  function draw(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="9" class="text-soft">No vehicles.</td></tr>`;
      return;
    }
    tbody.innerHTML = list.map(v => `
      <tr>
        <td><b>${escapeHtml(v.reg_no)}</b></td>
        <td>${escapeHtml(v.name)}</td>
        <td>${escapeHtml(v.type)}</td>
        <td>${fmtKm(v.max_load_kg)} kg</td>
        <td>${fmtKm(v.odometer_km)} km</td>
        <td>${fmtINR(v.acquisition_cost)}</td>
        <td>${escapeHtml(v.region)}</td>
        <td>${statusPill(v.status)}</td>
        <td class="actions">
          <button class="btn btn-sm" data-edit="${v.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${v.id}">Delete</button>
        </td>
      </tr>`).join('');
  }
  draw(vehicles);
  tbody.addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) openVehicleForm(vehicles.find(v => v.id === +editId), async () => {
      const list = await api('/vehicles'); draw(list);
    });
    if (delId) {
      if (confirm('Delete this vehicle?')) {
        try { await api(`/vehicles/${delId}`, { method: 'DELETE' }); toast('Deleted'); renderVehicles(c); }
        catch (err) { toast(err.message, 'error'); }
      }
    }
  });
  $('#add-v', c).addEventListener('click', () => openVehicleForm(null, async () => {
    const list = await api('/vehicles'); draw(list);
  }));
}

function openVehicleForm(v, onSaved) {
  const isEdit = !!v;
  modal.open(isEdit ? 'Edit Vehicle' : 'Add Vehicle', `
    <div class="form-row"><label>Registration Number*</label>
      <input id="f-reg" value="${escapeHtml(v?.reg_no || '')}" ${isEdit ? 'disabled' : ''}/></div>
    <div class="form-row"><label>Name / Model*</label>
      <input id="f-name" value="${escapeHtml(v?.name || '')}"/></div>
    <div class="form-row"><label>Type*</label>
      <select id="f-type">
        ${['Van','Truck','Car','Bus'].map(t =>
          `<option ${v?.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select></div>
    <div class="form-row"><label>Max Load (kg)*</label>
      <input id="f-cap" type="number" min="0" step="0.1" value="${v?.max_load_kg ?? 500}"/></div>
    <div class="form-row"><label>Odometer (km)</label>
      <input id="f-odo" type="number" min="0" value="${v?.odometer_km ?? 0}"/></div>
    <div class="form-row"><label>Acquisition Cost (₹)</label>
      <input id="f-cost" type="number" min="0" value="${v?.acquisition_cost ?? 0}"/></div>
    <div class="form-row"><label>Region</label>
      <select id="f-region">
        ${['Central','North','South','West','East'].map(r =>
          `<option ${v?.region === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select></div>
    ${isEdit ? `<div class="form-row"><label>Status</label>
      <select id="f-status">
        ${['Available','On Trip','In Shop','Retired'].map(s =>
          `<option ${v.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>` : ''}
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-v">${isEdit ? 'Save' : 'Register'}</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-v', root).addEventListener('click', async () => {
      const body = {
        reg_no: $('#f-reg', root).value,
        name: $('#f-name', root).value,
        type: $('#f-type', root).value,
        max_load_kg: +$('#f-cap', root).value,
        odometer_km: +$('#f-odo', root).value,
        acquisition_cost: +$('#f-cost', root).value,
        region: $('#f-region', root).value,
      };
      if (isEdit) body.status = $('#f-status', root).value;
      try {
        if (isEdit) await api(`/vehicles/${v.id}`, { method: 'PUT', body });
        else await api('/vehicles', { method: 'POST', body });
        toast(isEdit ? 'Updated' : 'Vehicle registered');
        modal.close();
        onSaved();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// =================== Drivers =================== //
async function renderDrivers(c) {
  const drivers = await api('/drivers');
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>👤 Driver Management</h3>
        <button class="btn btn-primary" id="add-d">+ Add Driver</button>
      </div>
      <div class="table-wrap"><table id="d-list">
        <thead><tr>
          <th>Name</th><th>Contact</th><th>License</th><th>Category</th>
          <th>Expiry</th><th>Safety</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>
  `;
  const tbody = $('#d-list tbody', c);
  function expPill(expiry) {
    const d = (new Date(expiry) - new Date()) / (1000 * 3600 * 24);
    if (d < 0) return `<span class="pill pill-red">Expired ${Math.abs(Math.floor(d))}d ago</span>`;
    if (d <= 30) return `<span class="pill pill-amber">Expires in ${Math.floor(d)}d</span>`;
    return `<span class="pill pill-green">Valid (${Math.floor(d)}d)</span>`;
  }
  function draw(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-soft">No drivers.</td></tr>`; return;
    }
    tbody.innerHTML = list.map(d => `
      <tr>
        <td><b>${escapeHtml(d.name)}</b></td>
        <td>${escapeHtml(d.contact)}</td>
        <td>${escapeHtml(d.license_no)}</td>
        <td>${escapeHtml(d.license_category)}</td>
        <td>${escapeHtml(d.license_expiry)} ${expPill(d.license_expiry)}</td>
        <td>⭐ ${d.safety_score}</td>
        <td>${statusPill(d.status)}</td>
        <td class="actions">
          <button class="btn btn-sm" data-edit="${d.id}">Edit</button>
          <button class="btn btn-sm btn-danger" data-del="${d.id}">Delete</button>
        </td>
      </tr>`).join('');
  }
  draw(drivers);
  tbody.addEventListener('click', async (e) => {
    const editId = e.target.dataset.edit;
    const delId = e.target.dataset.del;
    if (editId) openDriverForm(drivers.find(d => d.id === +editId), async () => {
      const list = await api('/drivers'); draw(list);
    });
    if (delId) {
      if (confirm('Delete this driver?')) {
        try { await api(`/drivers/${delId}`, { method: 'DELETE' }); toast('Deleted'); renderDrivers(c); }
        catch (err) { toast(err.message, 'error'); }
      }
    }
  });
  $('#add-d', c).addEventListener('click', () => openDriverForm(null, async () => {
    const list = await api('/drivers'); draw(list);
  }));
}

function openDriverForm(d, onSaved) {
  const isEdit = !!d;
  modal.open(isEdit ? 'Edit Driver' : 'Add Driver', `
    <div class="form-row"><label>Name*</label>
      <input id="f-name" value="${escapeHtml(d?.name || '')}"/></div>
    <div class="form-row"><label>License Number*</label>
      <input id="f-lic" value="${escapeHtml(d?.license_no || '')}" ${isEdit ? 'disabled' : ''}/></div>
    <div class="form-row"><label>Category*</label>
      <select id="f-cat">
        ${['LMV','HMV','MCWG','MCWOG'].map(c =>
          `<option ${d?.license_category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select></div>
    <div class="form-row"><label>License Expiry*</label>
      <input id="f-exp" type="date" value="${escapeHtml(d?.license_expiry || '')}"/></div>
    <div class="form-row"><label>Contact*</label>
      <input id="f-contact" value="${escapeHtml(d?.contact || '')}"/></div>
    <div class="form-row"><label>Safety Score</label>
      <input id="f-score" type="number" min="0" max="100" step="0.1" value="${d?.safety_score ?? 80}"/></div>
    ${isEdit ? `<div class="form-row"><label>Status</label>
      <select id="f-status">
        ${['Available','On Trip','Off Duty','Suspended'].map(s =>
          `<option ${d.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>` : ''}
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-d">${isEdit ? 'Save' : 'Register'}</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-d', root).addEventListener('click', async () => {
      const body = {
        name: $('#f-name', root).value,
        license_no: $('#f-lic', root).value,
        license_category: $('#f-cat', root).value,
        license_expiry: $('#f-exp', root).value,
        contact: $('#f-contact', root).value,
        safety_score: +$('#f-score', root).value,
      };
      if (isEdit) body.status = $('#f-status', root).value;
      try {
        if (isEdit) await api(`/drivers/${d.id}`, { method: 'PUT', body });
        else await api('/drivers', { method: 'POST', body });
        toast(isEdit ? 'Updated' : 'Driver registered');
        modal.close();
        onSaved();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// =================== Trips =================== //
async function renderTrips(c) {
  const [trips, vehicles, drivers] = await Promise.all([
    api('/trips'), api('/vehicles'), api('/drivers'),
  ]);
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>📦 Trips</h3>
        <button class="btn btn-primary" id="add-t">+ Create Trip</button>
      </div>
      <div class="table-wrap"><table id="t-list">
        <thead><tr>
          <th>#</th><th>Route</th><th>Vehicle</th><th>Driver</th>
          <th>Cargo / Dist</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>
  `;
  const tbody = $('#t-list tbody', c);
  function draw(list) {
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-soft">No trips yet.</td></tr>`; return;
    }
    tbody.innerHTML = list.map(t => `
      <tr>
        <td>#${t.id}</td>
        <td>${escapeHtml(t.source)} → ${escapeHtml(t.destination)}</td>
        <td>${escapeHtml(t.vehicle_reg)}</td>
        <td>${escapeHtml(t.driver_name)}</td>
        <td>${t.cargo_kg} kg<br><span class="text-soft">${t.planned_distance_km} km planned</span></td>
        <td>${statusPill(t.status)}</td>
        <td class="actions">
          ${t.status === 'Draft' ? `<button class="btn btn-sm btn-primary" data-disp="${t.id}">Dispatch</button>` : ''}
          ${t.status === 'Dispatched' ? `<button class="btn btn-sm btn-success" data-comp="${t.id}">Complete</button>` : ''}
          ${(t.status === 'Draft' || t.status === 'Dispatched') ?
              `<button class="btn btn-sm btn-danger" data-cancel="${t.id}">Cancel</button>` : ''}
        </td>
      </tr>`).join('');
  }
  draw(trips);

  tbody.addEventListener('click', async (e) => {
    const dispId = e.target.dataset.disp;
    const compId = e.target.dataset.comp;
    const canId = e.target.dataset.cancel;
    if (dispId) {
      try { const r = await api(`/trips/${dispId}/dispatch`, { method: 'POST' }); toast(r.message); renderTrips(c); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (compId) openCompleteForm(+compId, c);
    if (canId) {
      if (!confirm('Cancel this trip?')) return;
      try { const r = await api(`/trips/${canId}/cancel`, { method: 'POST' }); toast(r.message); renderTrips(c); }
      catch (err) { toast(err.message, 'error'); }
    }
  });

  $('#add-t', c).addEventListener('click', () => openTripForm(vehicles, drivers, async () => {
    renderTrips(c);
  }));
}

function openTripForm(vehicles, drivers, onCreated) {
  // Filter only assignable vehicles & drivers per business rules
  const avVs = vehicles.filter(v => v.status === 'Available');
  const elDs = drivers.filter(d => {
    if (d.status === 'On Trip' || d.status === 'Suspended') return false;
    return new Date(d.license_expiry) >= new Date();
  });

  if (!avVs.length) { toast('No available vehicles to dispatch', 'error'); return; }
  if (!elDs.length) { toast('No eligible drivers (check license expiry / status)', 'error'); return; }

  modal.open('Create Trip (Draft)', `
    <div class="form-row"><label>Source*</label><input id="f-src" placeholder="Mumbai Warehouse"/></div>
    <div class="form-row"><label>Destination*</label><input id="f-dst" placeholder="Pune Depot"/></div>
    <div class="form-row"><label>Vehicle (Available only)*</label>
      <select id="f-v">${avVs.map(v =>
        `<option value="${v.id}">${escapeHtml(v.reg_no)} — ${escapeHtml(v.name)} (max ${v.max_load_kg} kg)</option>`).join('')}</select></div>
    <div class="form-row"><label>Driver (eligible only)*</label>
      <select id="f-d">${elDs.map(d =>
        `<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(d.license_no)}</option>`).join('')}</select></div>
    <div class="form-row"><label>Cargo Weight (kg)*</label><input id="f-cargo" type="number" min="0" value="100"/></div>
    <div class="form-row"><label>Planned Distance (km)*</label><input id="f-dist" type="number" min="0" value="100"/></div>
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-t">Create Trip</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-t', root).addEventListener('click', async () => {
      try {
        const r = await api('/trips', { method: 'POST', body: {
          source: $('#f-src', root).value,
          destination: $('#f-dst', root).value,
          vehicle_id: +$('#f-v', root).value,
          driver_id: +$('#f-d', root).value,
          cargo_kg: +$('#f-cargo', root).value,
          planned_distance_km: +$('#f-dist', root).value,
        }});
        toast(r.message);
        modal.close();
        onCreated();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function openCompleteForm(tripId, c) {
  modal.open('Complete Trip', `
    <div class="form-row"><label>Final Odometer (km)*</label><input id="f-odo" type="number" min="0" value="0"/></div>
    <div class="form-row"><label>Fuel Used (liters)*</label><input id="f-fuel" type="number" min="0" step="0.1" value="10"/></div>
    <div class="form-row"><label>Revenue (₹)</label><input id="f-rev" type="number" min="0" value="0"/></div>
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-success" id="save-c">Complete</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-c', root).addEventListener('click', async () => {
      try {
        const r = await api(`/trips/${tripId}/complete`, { method: 'POST', body: {
          end_odometer: +$('#f-odo', root).value,
          fuel_used_liters: +$('#f-fuel', root).value,
          revenue: +$('#f-rev', root).value,
        }});
        toast(r.message);
        modal.close();
        renderTrips(c);
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// =================== Maintenance =================== //
async function renderMaintenance(c) {
  const [logs, vehicles] = await Promise.all([api('/maintenance'), api('/vehicles')]);
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>🛠️ Maintenance Logs</h3>
        <button class="btn btn-primary" id="add-m">+ New Record</button>
      </div>
      <div class="table-wrap"><table id="m-list">
        <thead><tr>
          <th>Vehicle</th><th>Description</th><th>Cost</th><th>Start</th>
          <th>End</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>
  `;
  const tbody = $('#m-list tbody', c);
  function draw(list) {
    if (!list.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-soft">No records.</td></tr>`; return; }
    tbody.innerHTML = list.map(m => `
      <tr>
        <td><b>${escapeHtml(m.vehicle_reg)}</b><br><span class="text-soft">${escapeHtml(m.vehicle_name)}</span></td>
        <td>${escapeHtml(m.description)}<br><span class="text-soft">${escapeHtml(m.notes || '')}</span></td>
        <td>${fmtINR(m.cost)}</td>
        <td>${escapeHtml(m.start_date)}</td>
        <td>${escapeHtml(m.end_date || '—')}</td>
        <td>${m.status === 'Open' ? '<span class="pill pill-amber">Open</span>' : '<span class="pill pill-green">Closed</span>'}</td>
        <td class="actions">
          ${m.status === 'Open' ? `<button class="btn btn-sm btn-success" data-close="${m.id}">Close</button>` : ''}
          <button class="btn btn-sm btn-danger" data-del="${m.id}">Delete</button>
        </td>
      </tr>`).join('');
  }
  draw(logs);

  tbody.addEventListener('click', async (e) => {
    if (e.target.dataset.close) {
      try { const r = await api(`/maintenance/${e.target.dataset.close}/close`, { method: 'POST' });
        toast(r.message); renderMaintenance(c); }
      catch (err) { toast(err.message, 'error'); }
    }
    if (e.target.dataset.del) {
      if (!confirm('Delete this maintenance record?')) return;
      await api(`/maintenance/${e.target.dataset.del}`, { method: 'DELETE' });
      toast('Deleted'); renderMaintenance(c);
    }
  });
  $('#add-m', c).addEventListener('click', () => openMaintForm(vehicles, async () => renderMaintenance(c)));
}

function openMaintForm(vehicles, onCreated) {
  if (!vehicles.length) { toast('No vehicles to maintain', 'error'); return; }
  modal.open('New Maintenance Record', `
    <div class="form-row"><label>Vehicle*</label>
      <select id="f-v">${vehicles.map(v =>
        `<option value="${v.id}">${escapeHtml(v.reg_no)} — ${escapeHtml(v.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>Description*</label><input id="f-desc" placeholder="Oil Change"/></div>
    <div class="form-row"><label>Cost (₹)*</label><input id="f-cost" type="number" min="0" value="2000"/></div>
    <div class="form-row"><label>Notes</label><textarea id="f-notes" rows="2"></textarea></div>
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-m">Create</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-m', root).addEventListener('click', async () => {
      try {
        const r = await api('/maintenance', { method: 'POST', body: {
          vehicle_id: +$('#f-v', root).value,
          description: $('#f-desc', root).value,
          cost: +$('#f-cost', root).value,
          notes: $('#f-notes', root).value,
        }});
        toast(r.message);
        modal.close();
        onCreated();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// =================== Fuel & Expenses =================== //
async function renderFuel(c) {
  const [fuel, expenses, vehicles] = await Promise.all([api('/fuel'), api('/expenses'), api('/vehicles')]);
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>⛽ Fuel Logs</h3>
        <button class="btn btn-primary" id="add-fuel">+ Add Fuel</button>
      </div>
      <div class="table-wrap"><table id="f-table">
        <thead><tr><th>Date</th><th>Vehicle</th><th>Liters</th><th>Cost</th><th>Odometer</th></tr></thead>
        <tbody>${fuel.length ? fuel.map(f => `
          <tr><td>${escapeHtml(f.log_date)}</td><td>${escapeHtml(f.vehicle_reg)}</td>
              <td>${f.liters}</td><td>${fmtINR(f.cost)}</td><td>${fmtKm(f.odometer_km)} km</td></tr>
        `).join('') : `<tr><td colspan="5" class="text-soft">No fuel logs.</td></tr>`}</tbody>
      </table></div>
    </div>
    <div class="card">
      <div class="flex-between mb-1">
        <h3>💸 Other Expenses</h3>
        <button class="btn btn-primary" id="add-exp">+ Add Expense</button>
      </div>
      <div class="table-wrap"><table id="e-table">
        <thead><tr><th>Date</th><th>Vehicle</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead>
        <tbody>${expenses.length ? expenses.map(e => `
          <tr><td>${escapeHtml(e.expense_date)}</td><td>${escapeHtml(e.vehicle_reg || '—')}</td>
              <td>${escapeHtml(e.category)}</td><td>${escapeHtml(e.description || '')}</td>
              <td>${fmtINR(e.amount)}</td></tr>
        `).join('') : `<tr><td colspan="5" class="text-soft">No expenses.</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
  $('#add-fuel', c).addEventListener('click', () => openFuelForm(vehicles, () => renderFuel(c)));
  $('#add-exp', c).addEventListener('click', () => openExpenseForm(vehicles, () => renderFuel(c)));
}

function openFuelForm(vehicles, onSaved) {
  modal.open('Add Fuel Log', `
    <div class="form-row"><label>Vehicle*</label>
      <select id="f-v">${vehicles.map(v =>
        `<option value="${v.id}">${escapeHtml(v.reg_no)} — ${escapeHtml(v.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>Liters*</label><input id="f-liters" type="number" min="0" step="0.1" value="10"/></div>
    <div class="form-row"><label>Cost (₹)*</label><input id="f-cost" type="number" min="0" value="1200"/></div>
    <div class="form-row"><label>Date*</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
    <div class="form-row"><label>Odometer (km)</label><input id="f-odo" type="number" min="0" value="0"/></div>
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-f">Save</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-f', root).addEventListener('click', async () => {
      try {
        await api('/fuel', { method: 'POST', body: {
          vehicle_id: +$('#f-v', root).value,
          liters: +$('#f-liters', root).value,
          cost: +$('#f-cost', root).value,
          log_date: $('#f-date', root).value,
          odometer_km: +$('#f-odo', root).value,
        }});
        toast('Fuel log saved'); modal.close(); onSaved();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

function openExpenseForm(vehicles, onSaved) {
  modal.open('Add Expense', `
    <div class="form-row"><label>Vehicle</label>
      <select id="f-v"><option value="">—</option>${vehicles.map(v =>
        `<option value="${v.id}">${escapeHtml(v.reg_no)} — ${escapeHtml(v.name)}</option>`).join('')}</select></div>
    <div class="form-row"><label>Category*</label>
      <select id="f-cat">
        <option>Toll</option><option>Parking</option><option>Driver Allowance</option><option>Misc</option>
      </select></div>
    <div class="form-row"><label>Description</label><input id="f-desc"/></div>
    <div class="form-row"><label>Amount (₹)*</label><input id="f-amount" type="number" min="0" value="200"/></div>
    <div class="form-row"><label>Date*</label><input id="f-date" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
    <div class="modal-actions">
      <button class="btn" data-modal-cancel>Cancel</button>
      <button class="btn btn-primary" id="save-e">Save</button>
    </div>
  `, (root) => {
    $('[data-modal-cancel]', root).addEventListener('click', modal.close);
    $('#save-e', root).addEventListener('click', async () => {
      try {
        await api('/expenses', { method: 'POST', body: {
          vehicle_id: $('#f-v', root).value || null,
          category: $('#f-cat', root).value,
          description: $('#f-desc', root).value,
          amount: +$('#f-amount', root).value,
          expense_date: $('#f-date', root).value,
        }});
        toast('Expense saved'); modal.close(); onSaved();
      } catch (err) { toast(err.message, 'error'); }
    });
  });
}

// =================== Reports =================== //
async function renderReports(c) {
  const metrics = await api('/metrics');
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>📈 Vehicle Metrics</h3>
        <div class="flex gap-1">
          <button class="btn" id="export-csv">📥 Export CSV</button>
          <button class="btn" id="export-pdf">📄 Export PDF</button>
        </div>
      </div>
      <div class="table-wrap"><table id="m-table">
        <thead><tr>
          <th>Reg</th><th>Name</th><th>Type</th><th>Status</th>
          <th>Distance (km)</th><th>Fuel (L)</th><th>Eff. (km/L)</th>
          <th>Fuel ₹</th><th>Maint ₹</th><th>Op. ₹</th><th>Revenue</th><th>ROI</th>
        </tr></thead>
        <tbody></tbody>
      </table></div>
    </div>

    <div class="card">
      <h3>⛽ Fuel Efficiency (km / liter)</h3>
      <div class="bar-chart" id="chart-eff"></div>
    </div>
    <div class="card">
      <h3>💰 Operational Cost</h3>
      <div class="bar-chart" id="chart-cost"></div>
    </div>
    <div class="card">
      <h3>📈 Vehicle ROI (%)</h3>
      <div class="bar-chart" id="chart-roi"></div>
    </div>
  `;
  const tbody = $('#m-table tbody', c);
  function draw(list) {
    tbody.innerHTML = list.map(m => `
      <tr>
        <td><b>${escapeHtml(m.reg_no)}</b></td>
        <td>${escapeHtml(m.name)}</td>
        <td>${escapeHtml(m.type)}</td>
        <td>${statusPill(m.status)}</td>
        <td>${fmtKm(m.distance_km)}</td>
        <td>${m.fuel_liters.toFixed(1)}</td>
        <td>${m.fuel_efficiency.toFixed(2)}</td>
        <td>${fmtINR(m.fuel_cost)}</td>
        <td>${fmtINR(m.maintenance_cost)}</td>
        <td>${fmtINR(m.operational_cost)}</td>
        <td>${fmtINR(m.revenue)}</td>
        <td>${m.roi_pct.toFixed(2)}%</td>
      </tr>
    `).join('') || `<tr><td colspan="12" class="text-soft">No data.</td></tr>`;
  }
  draw(metrics);

  // Bar charts
  drawBars('#chart-eff', metrics.map(m => ({ label: m.reg_no, value: m.fuel_efficiency, max: Math.max(...metrics.map(x=>x.fuel_efficiency), 1), unit: ' km/L' })));
  drawBars('#chart-cost', metrics.map(m => ({ label: m.reg_no, value: m.operational_cost, max: Math.max(...metrics.map(x=>x.operational_cost), 1), unit: ' ₹' })));
  drawBars('#chart-roi', metrics.map(m => ({ label: m.reg_no, value: m.roi_pct, max: Math.max(...metrics.map(x=>x.roi_pct), 1), unit: ' %' })));

  // CSV export
  $('#export-csv', c).addEventListener('click', () => {
    const headers = ['Reg','Name','Type','Status','Distance','Fuel L','Eff km/L','Fuel Cost','Maint Cost','Op Cost','Revenue','ROI %'];
    const rows = metrics.map(m => [m.reg_no, m.name, m.type, m.status, m.distance_km, m.fuel_liters, m.fuel_efficiency, m.fuel_cost, m.maintenance_cost, m.operational_cost, m.revenue, m.roi_pct]);
    const csv = [headers, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `transitops_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });

  // PDF (printable HTML) export
  $('#export-pdf', c).addEventListener('click', () => {
    const html = `<!doctype html><html><head><title>TransitOps Report</title>
      <style>body{font-family:Arial;margin:30px;color:#0f172a}
      h1{color:#4f46e5}table{width:100%;border-collapse:collapse;font-size:12px}
      th,td{border:1px solid #cbd5e1;padding:6px;text-align:left}
      th{background:#e0e7ff}</style></head><body>
      <h1>🚚 TransitOps — Operations Report</h1>
      <p>Generated: ${new Date().toLocaleString()}</p>
      <table><thead><tr>
      <th>Reg</th><th>Name</th><th>Type</th><th>Status</th>
      <th>Distance</th><th>Fuel L</th><th>Eff</th>
      <th>Fuel Cost</th><th>Maint</th><th>Op</th><th>Rev</th><th>ROI</th>
      </tr></thead><tbody>
      ${metrics.map(m => `<tr>
        <td>${m.reg_no}</td><td>${m.name}</td><td>${m.type}</td><td>${m.status}</td>
        <td>${m.distance_km.toFixed(0)}</td><td>${m.fuel_liters.toFixed(1)}</td>
        <td>${m.fuel_efficiency.toFixed(2)}</td>
        <td>${m.fuel_cost.toFixed(0)}</td><td>${m.maintenance_cost.toFixed(0)}</td>
        <td>${m.operational_cost.toFixed(0)}</td><td>${m.revenue.toFixed(0)}</td>
        <td>${m.roi_pct.toFixed(2)}%</td>
      </tr>`).join('')}
      </tbody></table>
      <script>window.onload=()=>window.print();</script>
      </body></html>`;
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  });
}

function drawBars(sel, items) {
  const root = $(sel);
  if (!items.length) { root.innerHTML = '<p class="text-soft">No data.</p>'; return; }
  root.innerHTML = items.map(it => `
    <div class="bar">
      <div class="bar-label">${escapeHtml(it.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(it.value / it.max * 100).toFixed(1)}%"></div></div>
      <div class="bar-value">${it.value.toFixed(2)}${it.unit || ''}</div>
    </div>`).join('');
}

// =================== Notifications =================== //
async function renderNotifications(c) {
  const list = await api('/notifications');
  c.innerHTML = `
    <div class="card">
      <div class="flex-between mb-1">
        <h3>🔔 Notifications</h3>
        <button class="btn" id="mark-read">Mark all as read</button>
      </div>
      ${list.length ? list.map(n => `
        <div class="card" style="margin-bottom:.5rem">
          <div>${n.kind === 'license_expiry' && n.message.includes('EXPIRED') ? '❌' :
                  n.kind === 'license_expiry' ? '⚠️' : 'ℹ️'} ${escapeHtml(n.message)}</div>
          <div class="text-soft" style="font-size:.8rem">${escapeHtml(n.created_at)}</div>
        </div>
      `).join('') : '<p class="text-soft">All clear — no outstanding notifications.</p>'}
    </div>
  `;
  $('#mark-read', c)?.addEventListener('click', async () => {
    await api('/notifications/read-all', { method: 'POST' });
    updateNotifBadge(); renderNotifications(c);
  });
}

// =================== Users =================== //
async function renderUsers(c) {
  if (state.user.role !== 'Fleet Manager') {
    c.innerHTML = `<div class="card"><p>⚠️ Only Fleet Managers can manage users.</p></div>`;
    return;
  }
  const users = await api('/users');
  c.innerHTML = `
    <div class="card">
      <h3>👥 User Management</h3>
      <div class="table-wrap"><table id="u-list">
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${users.map(u => `
          <tr>
            <td>${u.id}</td><td>${escapeHtml(u.name)}</td><td>${escapeHtml(u.email)}</td>
            <td>${statusPill(u.role)}</td><td>${escapeHtml(u.created_at)}</td>
            <td><button class="btn btn-sm btn-danger" data-del="${u.id}">Delete</button></td>
          </tr>
        `).join('')}</tbody>
      </table></div>
    </div>
    <div class="card">
      <h3>+ Add User</h3>
      <div class="form-row"><label>Name*</label><input id="f-name"/></div>
      <div class="form-row"><label>Email*</label><input id="f-email" type="email"/></div>
      <div class="form-row"><label>Password*</label><input id="f-pw" type="password"/></div>
      <div class="form-row"><label>Role*</label>
        <select id="f-role">
          <option>Fleet Manager</option><option>Driver</option>
          <option>Safety Officer</option><option>Financial Analyst</option>
        </select></div>
      <button class="btn btn-primary" id="save-u">Create User</button>
    </div>
  `;
  $('#u-list', c).addEventListener('click', async (e) => {
    if (e.target.dataset.del) {
      if (!confirm('Delete this user?')) return;
      await api(`/users/${e.target.dataset.del}`, { method: 'DELETE' });
      toast('Deleted'); renderUsers(c);
    }
  });
  $('#save-u', c).addEventListener('click', async () => {
    try {
      await api('/users', { method: 'POST', body: {
        name: $('#f-name', c).value,
        email: $('#f-email', c).value,
        password: $('#f-pw', c).value,
        role: $('#f-role', c).value,
      }});
      toast('User created'); renderUsers(c);
    } catch (err) { toast(err.message, 'error'); }
  });
}

// =================== Boot =================== //
(async function boot() {
  try {
    const { user } = await api('/auth/me');
    state.user = user;
    showApp();
  } catch {
    showLogin();
  }
})();
