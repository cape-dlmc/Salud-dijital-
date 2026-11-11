/**
 * SaludDigital Healthcare Platform (TOGAF 5 Layers & HL7 FHIR R4)
 * Modern Enterprise Frontend Application - v1.2
 */

const API_BASE = '/api';

// Application State
const state = {
  user: null,
  token: localStorage.getItem('sd_token') || null,
  module: 'inicio',
  selectedPatientId: null,
  patientData: null,
  ehrTab: 'resumen',
  labFilter: 'Todos',
  farmFilter: 'Todos',
  factFilter: 'Todos',
  theme: localStorage.getItem('sd_theme') || 'dark',
  demoAccounts: [],
  rolesConfig: {},
  patientsList: [],
  appointmentsList: [],
  referralsList: [],
  usersList: [],
  rolesCatalog: {},
  labOrders: [],
  medsCatalog: [],
  pharmacyOrders: [],
  invoices: [],
  kpisData: null,
  auditLogs: []
};

// Apply initial theme
document.documentElement.setAttribute('data-theme', state.theme);

// Credenciales demo para autologin inmediato (1 clic)
const DEMO_CREDENTIALS = {
  'admin.pena': 'Admin2026*',
  'dr.martinez': 'Medico2026*',
  'dra.gomez': 'Medico2026*',
  'dr.restrepo': 'Medico2026*',
  'lab.ortega': 'Lab2026*',
  'farm.rojas': 'Farm2026*',
  'fact.vargas': 'Fact2026*',
  'gerencia': 'Gerencia2026*'
};

// API Client Helper
const api = {
  async req(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    };
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 && state.token && !options.silent) {
        expireSession('Su sesión venció. Inicie sesión nuevamente.');
      }
      if (!res.ok) {
        throw new Error(data.error || 'Error en la solicitud al servidor');
      }
      return data;
    } catch (err) {
      if (!options.silent) toast(err.message, 'error');
      throw err;
    }
  },
  get(endpoint) { return this.req(endpoint, { method: 'GET' }); },
  post(endpoint, body) { return this.req(endpoint, { method: 'POST', body: JSON.stringify(body) }); },
  put(endpoint, body) { return this.req(endpoint, { method: 'PUT', body: JSON.stringify(body) }); },
  patch(endpoint, body) { return this.req(endpoint, { method: 'PATCH', body: JSON.stringify(body) }); },
  del(endpoint) { return this.req(endpoint, { method: 'DELETE' }); }
};

// UI Helper Functions
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 3500);
}

function openModal(html) {
  const container = document.getElementById('modal-container');
  const overlay = document.getElementById('modal-overlay');
  if (!container || !overlay) return;
  container.innerHTML = html;
  overlay.classList.add('open');
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('sd_theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  render();
}

function formatMoney(num) {
  return '$' + (num || 0).toLocaleString('es-CO');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Navigation & Routing
function navigateTo(moduleName, extraState = {}) {
  if (!state.user) return;
  if (state.user.modulos && !state.user.modulos.includes(moduleName) && state.user.rol !== 'admin') {
    toast(`Su perfil (${state.user.cargo}) no tiene permiso para ingresar a ${moduleName}`, 'warning');
    return;
  }
  state.module = moduleName;
  Object.assign(state, extraState);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadModuleData().then(() => render());
}

// Global Quick Search (Ctrl + K)
function openPalette() {
  const palette = document.getElementById('search-palette');
  const input = document.getElementById('palette-input');
  if (palette && input) {
    palette.classList.add('open');
    input.value = '';
    handlePaletteSearch('');
    setTimeout(() => input.focus(), 50);
  }
}

function closePalette() {
  const palette = document.getElementById('search-palette');
  if (palette) palette.classList.remove('open');
}

async function handlePaletteSearch(q) {
  const container = document.getElementById('palette-results');
  if (!container) return;
  const query = q.trim().toLowerCase();
  const filtered = state.patientsList.filter(p =>
    (p.nombre || '').toLowerCase().includes(query) ||
    (p.doc || '').toLowerCase().includes(query) ||
    (p.id || '').toLowerCase().includes(query) ||
    (p.eps || '').toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">No se encontraron pacientes coincidentes.</div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 8).map(p => `
    <div class="palette-item" onclick="closePalette(); selectPatient('${p.id}')">
      <div>
        <div style="font-weight:700">${escapeHtml(p.nombre)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(p.tipoDoc || 'CC')} ${escapeHtml(p.doc)} · ${escapeHtml(p.eps || 'Particular')}</div>
      </div>
      <span class="badge badge-info">${p.id}</span>
    </div>
  `).join('');
}

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
  if (e.key === 'Escape') {
    closePalette();
    closeModal();
  }
});

// Session Management
function expireSession(msg) {
  clearSessionState();
  render();
  if (msg) toast(msg, 'warning');
}

function clearSessionState() {
  state.user = null;
  state.token = null;
  state.selectedPatientId = null;
  state.patientData = null;
  localStorage.removeItem('sd_token');
  localStorage.removeItem('sd_user');
}

async function handleLogin() {
  const u = (document.getElementById('login-user')?.value || '').trim();
  const p = (document.getElementById('login-pw')?.value || '').trim();
  if (!u || !p) {
    toast('Por favor ingrese usuario y contraseña', 'warning');
    return;
  }
  try {
    const res = await api.post('/auth/login', { user: u, pw: p });
    state.token = res.token;
    state.user = res.user;
    localStorage.setItem('sd_token', res.token);
    localStorage.setItem('sd_user', JSON.stringify(res.user));
    toast(`Bienvenido, ${res.user.nombre}`);
    await loadInitialData();
    navigateTo('inicio');
  } catch (err) {}
}

async function quickLogin(username) {
  const pw = DEMO_CREDENTIALS[username] || 'Admin2026*';
  const uInput = document.getElementById('login-user');
  const pInput = document.getElementById('login-pw');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = pw;
  await handleLogin();
}

async function handleLogout() {
  try {
    await api.post('/auth/logout', {});
  } catch (e) {}
  clearSessionState();
  toast('Sesión finalizada');
  render();
}

// Data loaders
async function loadInitialData() {
  try {
    const [demoRes] = await Promise.all([
      api.get('/auth/demo-accounts')
    ]);
    state.demoAccounts = demoRes.users || [];
    state.rolesConfig = demoRes.roles || {};

    if (state.token && state.user) {
      await loadModuleData();
    }
  } catch (e) {
    console.error('Error cargando datos iniciales', e);
  }
}

async function loadModuleData() {
  try {
    if (!state.user) return;
    const [pts, apts] = await Promise.all([
      api.get('/patients'),
      api.get('/appointments')
    ]);
    state.patientsList = pts.patients || [];
    state.appointmentsList = apts.appointments || [];

    if (state.module === 'historia' && state.selectedPatientId) {
      state.patientData = await api.get(`/patients/${state.selectedPatientId}`);
    }
    if (state.module === 'laboratorio') {
      const labRes = await api.get('/lab');
      state.labOrders = labRes.orders || [];
    }
    if (state.module === 'farmacia') {
      const farmRes = await api.get('/pharmacy');
      state.pharmacyOrders = farmRes.orders || [];
      state.medsCatalog = farmRes.catalog || [];
    }
    if (state.module === 'facturacion') {
      const factRes = await api.get('/billing');
      state.invoices = factRes.invoices || [];
    }
    if (state.module === 'reportes') {
      state.kpisData = await api.get('/kpis');
    }
    if (state.module === 'auditoria') {
      const audRes = await api.get('/audit');
      state.auditLogs = audRes.logs || [];
    }
    if (state.module === 'usuarios' || state.user.rol === 'admin') {
      try {
        const uRes = await api.get('/auth/users');
        state.usersList = uRes.users || [];
        state.rolesCatalog = uRes.roles || {};
      } catch (e) {}
    }
    if (state.module === 'remisiones' || state.module === 'historia' || ['medico', 'especialista', 'admin'].includes(state.user.rol)) {
      try {
        const rRes = await api.get('/referrals');
        state.referralsList = rRes.referrals || [];
      } catch (e) {}
    }
  } catch (e) {
    console.error('Error cargando módulo', e);
  }
}

async function selectPatient(patientId) {
  state.selectedPatientId = patientId;
  if (state.user.rol === 'admin') {
    navigateTo('pacientes');
  } else {
    navigateTo('historia', { selectedPatientId: patientId, ehrTab: 'resumen' });
  }
}

/* ==========================================================================
   VIEW COMPONENTS & TEMPLATES
   ========================================================================== */

// 1. Navigation Shell
function renderShell(contentHtml, title) {
  const u = state.user;
  const mods = {
    inicio: ['Inicio', '🏠'],
    agenda: ['Agenda y Recepción', '📅'],
    remisiones: ['Interconsultas', '🔄'],
    pacientes: ['Directorio Pacientes', '👥'],
    historia: ['Historia Clínica (HCE)', '📋'],
    laboratorio: ['Laboratorio (LIS)', '🧪'],
    farmacia: ['Farmacia Hospitalaria', '💊'],
    facturacion: ['Facturación y Cartera', '🧾'],
    usuarios: ['Accesos y Personal', '🔑'],
    reportes: ['Indicadores y BI', '📊'],
    auditoria: ['Auditoría y trazabilidad', '🛡️']
  };

  const navItems = (u.modulos || []).map(m => {
    const [label, icon] = mods[m] || [m, '📄'];
    const active = state.module === m ? 'active' : '';
    return `
      <button class="nav-item ${active}" onclick="navigateTo('${m}')">
        <span class="nav-icon">${icon}</span>
        <span>${label}</span>
      </button>
    `;
  }).join('');

  return `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="sidebar no-print">
        <div class="brand-header">
          <div class="brand-icon">+</div>
          <div class="brand-name">
            <span>SaludDigital</span>
            <span class="brand-tagline">EHR · TOGAF · FHIR</span>
          </div>
        </div>

        <div class="nav-section-title">Módulos del Sistema</div>
        ${navItems}

        <div class="sidebar-footer">
          <div style="font-size:11px;color:var(--text-subtle);margin-bottom:8px">
            Estándares: FHIR R4 · CIE-10 · CUPS
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="user-avatar">${u.ini || 'US'}</div>
            <div style="flex:1;overflow:hidden">
              <div style="font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(u.nombre)}</div>
              <div style="font-size:11px;color:var(--text-muted)">${escapeHtml(u.cargo)}</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="handleLogout()" title="Cerrar Sesión" style="padding:4px 8px">✕</button>
          </div>
        </div>
      </aside>

      <!-- Main Content Container -->
      <div class="main-wrapper">
        <header class="topbar no-print">
          <div class="topbar-left">
            <button class="btn btn-secondary btn-sm" onclick="openPalette()" style="display:flex;align-items:center;gap:8px">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>Buscar paciente por cédula o nombre...</span>
              <span class="palette-kbd">Ctrl K</span>
            </button>
          </div>

          <div class="topbar-right">
            <button class="btn btn-secondary btn-sm" onclick="toggleTheme()" title="Cambiar tema">
              ${state.theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
            </button>
            <button class="btn btn-secondary btn-sm" onclick="window.print()" title="Imprimir pantalla">
              🖨️ Imprimir
            </button>
          </div>
        </header>

        <main class="main-content">
          <div class="print-header" style="display:none">
            <h2>SaludDigital Clínica Privada S.A.S.</h2>
            <p>Reporte Oficial Clínico · Generado por: ${escapeHtml(u.nombre)} (${escapeHtml(u.cargo)}) · Fecha: ${new Date().toLocaleString('es-CO')}</p>
          </div>
          ${contentHtml}
        </main>
      </div>
    </div>
  `;
}

// 2. Login View
function viewLogin() {
  const demoButtons = state.demoAccounts.map(acc => `
    <button type="button" class="card-glass" style="text-align:left;cursor:pointer;padding:12px;border-radius:10px;transition:var(--transition-fast)"
      onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor=''"
      onclick="quickLogin('${escapeHtml(acc.user)}')">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:13.5px">${escapeHtml(acc.nombre)}</div>
        <span class="badge badge-info" style="font-size:10px">⚡ 1-Clic</span>
      </div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${escapeHtml(acc.user)} · ${escapeHtml(acc.cargo)}</div>
    </button>
  `).join('');

  return `
    <div style="min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:stretch">
      <!-- Left Hero Banner -->
      <div style="background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,58,138,0.7));padding:60px;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div class="brand-header" style="border:none;padding:0;margin-bottom:40px">
            <div class="brand-icon">+</div>
            <div class="brand-name">
              <span>SaludDigital</span>
              <span class="brand-tagline">Arquitectura Hospitalaria Integral</span>
            </div>
          </div>

          <h1 style="font-size:44px;font-weight:800;letter-spacing:-1px;line-height:1.15;max-width:520px;margin-bottom:20px">
            Gestión clínica <span style="background:var(--brand-gradient);-webkit-background-clip:text;color:transparent">sin fricciones</span> para equipos hospitalarios
          </h1>
          <p style="font-size:16px;color:var(--text-muted);max-width:480px;line-height:1.6">
            Admisión y agenda universal para cualquier persona, check-in en sala de espera, historia clínica con autogeneración de diagnósticos CIE-10, interconsultas a especialistas, laboratorio LIS y farmacia cerrada.
          </p>
        </div>

        <div>
          <!-- Animated ECG -->
          <svg viewBox="0 0 520 80" width="100%" style="max-width:500px">
            <defs>
              <linearGradient id="ecgGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#3b82f6"/>
                <stop offset="50%" stop-color="#8b5cf6"/>
                <stop offset="100%" stop-color="#06b6d4"/>
              </linearGradient>
            </defs>
            <polyline class="heartbeat-line" fill="none" stroke="url(#ecgGrad)" stroke-width="3" stroke-linecap="round"
              points="0,40 100,40 120,40 135,15 155,70 170,30 185,45 200,40 320,40 335,10 355,75 370,25 385,45 400,40 520,40" />
          </svg>
          <div style="font-size:12px;color:var(--text-subtle);margin-top:10px">
            Plataforma Asistencial · Interoperabilidad FHIR R4
          </div>
        </div>
      </div>

      <!-- Right Login Form -->
      <div style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-main)">
        <div class="card-glass" style="width:100%;max-width:480px;padding:36px">
          <h2 style="font-size:24px;font-weight:800;margin-bottom:6px">Acceso Profesional</h2>
          <p style="font-size:14px;color:var(--text-muted);margin-bottom:24px">Ingrese sus credenciales o seleccione un perfil demo con 1 clic:</p>

          <form onsubmit="event.preventDefault(); handleLogin()">
            <div class="form-group">
              <label class="form-label">Usuario institucional</label>
              <input id="login-user" class="form-input" placeholder="Ej: admin.pena o dr.martinez" required autocomplete="username">
            </div>

            <div class="form-group">
              <label class="form-label">Contraseña</label>
              <input id="login-pw" type="password" class="form-input" placeholder="••••••••••••" required autocomplete="current-password">
            </div>

            <button type="submit" class="btn btn-primary btn-block" style="margin-top:10px;padding:12px">
              Ingresar al Sistema
            </button>
          </form>

          <!-- Demo Profiles Quick Login -->
          <div style="margin-top:28px;border-top:1px solid var(--border-subtle);padding-top:20px">
            <div style="font-size:12px;font-weight:700;color:var(--text-subtle);text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px">
              Perfiles Clínicos Demo (Click para ingreso automático):
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;max-height:260px;overflow-y:auto;padding-right:4px">
              ${demoButtons}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 3. Inicio View (Role-based Dashboard)
function viewInicio() {
  const u = state.user;
  const hoyStr = new Date().toISOString().slice(0, 10);
  const citasHoy = state.appointmentsList.filter(a => a.fecha.includes('10-07') || a.fecha === hoyStr);
  const pendientesCheckin = state.appointmentsList.filter(a => a.est === 'Pendiente').length;
  const enSala = state.appointmentsList.filter(a => a.est === 'Confirmada en Recepción').length;
  const remisionesPend = (state.referralsList || []).filter(r => r.est === 'Pendiente').length;

  return `
    <div class="hero-card">
      <div>
        <h1 class="page-title">Bienvenido, <span style="background:var(--brand-gradient);-webkit-background-clip:text;color:transparent">${escapeHtml(u.nombre)}</span></h1>
        <p class="page-subtitle" style="font-size:15px;max-width:600px;margin-top:6px">
          ${escapeHtml(u.cargo)} · Sistema hospitalario centralizado y trazabilidad completa.
        </p>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${u.rol === 'admin' ? `<button class="btn btn-primary" onclick="openModalCita()">+ Agendar Cita</button>` : ''}
        ${u.rol === 'medico' ? `<button class="btn btn-primary" onclick="navigateTo('agenda')">Ver Mi Agenda y Sala (${enSala} en espera)</button>` : ''}
        ${u.rol === 'especialista' ? `<button class="btn btn-primary" onclick="navigateTo('remisiones')">Ver Interconsultas (${remisionesPend} pend.)</button>` : ''}
      </div>
    </div>

    <!-- Quick Metrics Grid -->
    <div class="grid grid-4" style="margin-bottom:24px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Citas Programadas</div>
        <div class="kpi-value">${state.appointmentsList.length}</div>
        <div class="kpi-meta">📅 ${enSala} en sala de espera</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Check-in Pendiente</div>
        <div class="kpi-value" style="color:var(--warning)">${pendientesCheckin}</div>
        <div class="kpi-meta">⏳ Esperando confirmación</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pacientes en Historial</div>
        <div class="kpi-value">${state.patientsList.length}</div>
        <div class="kpi-meta">👥 Historias clínicas activas</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Remisiones a Especialistas</div>
        <div class="kpi-value" style="color:var(--primary)">${(state.referralsList || []).length}</div>
        <div class="kpi-meta">🔄 ${remisionesPend} pendientes</div>
      </div>
    </div>

    <!-- Main Overview Sections -->
    <div class="grid grid-2">
      <!-- Citas recientes -->
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:16px;font-weight:700">Agenda Activa de Consultas</h3>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('agenda')">Ver agenda completa</button>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Paciente</th>
                <th>Especialista</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              ${state.appointmentsList.slice(0, 6).map(c => `
                <tr>
                  <td><b>${escapeHtml(c.hora)}</b></td>
                  <td>${escapeHtml(c.pacNombre)}</td>
                  <td>${escapeHtml(c.med)}</td>
                  <td>
                    ${c.est === 'Confirmada en Recepción' ? '<span class="badge badge-success">🟢 En Sala</span>' :
                      c.est === 'Pendiente' ? '<span class="badge badge-warning">⏳ Pendiente</span>' :
                      c.est === 'Atendida' ? '<span class="badge badge-info">✓ Atendida</span>' :
                      `<span class="badge badge-neutral">${escapeHtml(c.est)}</span>`}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">Sin citas</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Interconsultas y Remisiones -->
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:16px;font-weight:700">Remisiones Médicas Especializadas</h3>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('remisiones')">Ver todas</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${(state.referralsList || []).slice(0, 4).map(r => `
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
              <div>
                <b>${escapeHtml(r.pacNombre)}</b> → ${escapeHtml(r.especialidadRequerida)}
                <div style="font-size:12px;color:var(--text-muted)">Por: ${escapeHtml(r.solicitante)} · ${escapeHtml(r.motivo.slice(0, 45))}...</div>
              </div>
              <span class="badge ${r.prioridad === 'Prioritaria' ? 'badge-danger' : 'badge-neutral'}">${escapeHtml(r.prioridad)}</span>
            </div>
          `).join('') || '<div style="color:var(--text-muted);padding:14px;text-align:center">No hay remisiones pendientes.</div>'}
        </div>
      </div>
    </div>
  `;
}

// 4. Agenda View
function viewAgenda() {
  const isAdmin = state.user.rol === 'admin';
  const isMed = state.user.rol === 'medico';
  const isEsp = state.user.rol === 'especialista';
  const isDoctor = isMed || isEsp;

  const list = isDoctor
    ? state.appointmentsList.filter(a => a.med === state.user.nombre)
    : state.appointmentsList;

  const total = list.length;
  const pendientes = list.filter(a => a.est === 'Pendiente').length;
  const enSala = list.filter(a => a.est === 'Confirmada en Recepción').length;
  const atendidas = list.filter(a => a.est === 'Atendida').length;

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Agenda y Recepción de Pacientes</h1>
        <p class="page-subtitle">${isAdmin ? 'Gestión centralizada de turnos, confirmación de llegada (check-in) y citas' : 'Consultas programadas y pacientes confirmados en sala de espera'}</p>
      </div>
      <div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="openModalCita()">+ Agendar Nueva Cita</button>` : ''}
      </div>
    </div>

    <!-- Counters -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Total Programadas</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-meta">📅 Agenda global</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pendientes de Llegada</div>
        <div class="kpi-value" style="color:var(--warning)">${pendientes}</div>
        <div class="kpi-meta">⏳ Sin confirmar en recepción</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">En Sala de Espera</div>
        <div class="kpi-value" style="color:var(--success)">${enSala}</div>
        <div class="kpi-meta">🟢 Confirmados y listos</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Atendidas Hoy</div>
        <div class="kpi-value" style="color:var(--info)">${atendidas}</div>
        <div class="kpi-meta">✓ Consulta completada</div>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Fecha & Hora</th>
            <th>Paciente / Identificación</th>
            <th>Especialidad</th>
            <th>Médico Asignado</th>
            <th>Consultorio</th>
            <th>Estado & Check-in</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(c => {
            const isPendiente = c.est === 'Pendiente';
            const isConfirmadaEnSala = c.est === 'Confirmada en Recepción';
            const isAtendida = c.est === 'Atendida';
            const isEnConsulta = c.est === 'En consulta';

            let badgeHtml = '';
            if (isPendiente) {
              badgeHtml = `<span class="badge badge-warning">⏳ Pendiente Llegada</span>`;
            } else if (isConfirmadaEnSala) {
              badgeHtml = `<span class="badge badge-success">🟢 En Sala (${c.checkInHora || 'Confirmado'})</span>`;
            } else if (isEnConsulta) {
              badgeHtml = `<span class="badge badge-info">🩺 En Consulta</span>`;
            } else if (isAtendida) {
              badgeHtml = `<span class="badge badge-neutral">✓ Atendida</span>`;
            } else {
              badgeHtml = `<span class="badge badge-danger">${escapeHtml(c.est)}</span>`;
            }

            return `
              <tr>
                <td>
                  <b>${escapeHtml(c.hora)}</b>
                  <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.fecha)}</div>
                </td>
                <td>
                  <b>${escapeHtml(c.pacNombre)}</b>
                  <div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(c.pacDoc || c.pacId)} · ${escapeHtml(c.pacEps || 'Particular')}</div>
                </td>
                <td><span style="font-weight:600">${escapeHtml(c.esp)}</span></td>
                <td>${escapeHtml(c.med)}</td>
                <td><span class="badge badge-neutral">${escapeHtml(c.consultorio || 'Cons. General')}</span></td>
                <td>${badgeHtml}</td>
                <td>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${isAdmin && isPendiente ? `
                      <button class="btn btn-success btn-sm" onclick="confirmarCheckinCita('${c.id}')" title="Confirmar que el paciente llegó a la clínica para habilitar la atención médica">
                        ✓ Confirmar Llegada
                      </button>
                    ` : ''}

                    ${isDoctor && isConfirmadaEnSala ? `
                      <button class="btn btn-primary btn-sm" onclick="iniciarAtencionCita('${c.id}', '${c.pacId}')">
                        ▶ Atender Paciente
                      </button>
                    ` : ''}

                    ${isDoctor && isPendiente ? `
                      <button class="btn btn-secondary btn-sm" disabled style="opacity:0.5;cursor:not-allowed" title="El paciente debe confirmar su llegada en recepción antes de pasar a consulta">
                        ⏳ Sin check-in
                      </button>
                    ` : ''}

                    ${isDoctor && (isEnConsulta || isAtendida) ? `
                      <button class="btn btn-secondary btn-sm" onclick="selectPatient('${c.pacId}')">
                        📋 Ver Expediente
                      </button>
                    ` : ''}

                    ${isAdmin && !isAtendida && c.est !== 'Cancelada' ? `
                      <button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="cambiarEstadoCita('${c.id}', 'Cancelada')">
                        Cancelar
                      </button>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('') || `<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">No hay citas en este filtro.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

// 5. Directorio de Pacientes View
function viewPacientes() {
  const isAdmin = state.user.rol === 'admin';
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Directorio de Pacientes</h1>
        <p class="page-subtitle">Registro maestro de expedientes clínicos y consentimiento de datos</p>
      </div>
      <div>
        ${isAdmin ? `<button class="btn btn-primary" onclick="openModalCita()">+ Nueva Cita / Paciente</button>` : ''}
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>ID Clínico</th>
            <th>Nombre Completo</th>
            <th>Documento</th>
            <th>Edad & Sexo</th>
            <th>Aseguradora (EPS)</th>
            <th>Médico Asignado</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.patientsList.map(p => `
            <tr>
              <td><code>${p.id}</code></td>
              <td><b>${escapeHtml(p.nombre)}</b></td>
              <td>${escapeHtml(p.tipoDoc || 'CC')} ${escapeHtml(p.doc)}</td>
              <td>${p.edad || '—'} años · ${p.sexo || '—'}</td>
              <td>${escapeHtml(p.eps || 'Particular')} <span style="font-size:11px;color:var(--text-muted)">(${p.regimen || 'Particular'})</span></td>
              <td>${escapeHtml(p.medico || 'Sin asignar')}</td>
              <td><span class="badge ${p.estado === 'Activo' ? 'badge-success' : 'badge-warning'}">${escapeHtml(p.estado || 'Activo')}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-secondary btn-sm" onclick="selectPatient('${p.id}')">
                    📋 Expediente
                  </button>
                  ${isAdmin ? `
                    <button class="btn btn-secondary btn-sm" onclick="openModalReasignarDoc('${p.id}', '${escapeHtml(p.medico || '')}')">
                      Médico
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 6. Historia Clínica View
function viewHistoria() {
  if (!state.selectedPatientId || !state.patientData) {
    return `
      <div class="page-header">
        <h1 class="page-title">Historia Clínica Electrónica (HCE)</h1>
      </div>
      <div class="card-glass" style="text-align:center;padding:50px">
        <p style="font-size:16px;color:var(--text-muted);margin-bottom:18px">Seleccione un paciente de la agenda o use el buscador rápido para cargar el expediente clínico.</p>
        <button class="btn btn-primary" onclick="openPalette()">Buscar Paciente (Ctrl + K)</button>
      </div>
    `;
  }

  const p = state.patientData.patient;
  const tabs = [
    ['resumen', 'Resumen Clínico'],
    ['evolucion', 'Consulta & Asistente Clínico'],
    ['remisiones', 'Remisiones a Especialistas'],
    ['recetas', 'Fórmulas y Recetas'],
    ['laboratorio', 'Laboratorio (LIS)'],
    ['signos', 'Signos Vitales'],
    ['citas', 'Historial de Citas'],
    ['fhir', 'Interoperabilidad FHIR R4']
  ];

  return `
    <!-- Patient Master Header -->
    <div class="card-glass" style="margin-bottom:20px;border-left:4px solid var(--primary)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px">
        <div style="display:flex;gap:16px;align-items:center">
          <div class="user-avatar" style="width:54px;height:54px;font-size:18px">
            ${(p.nombre || 'P').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style="display:flex;gap:10px;align-items:center">
              <h2 style="font-size:22px;font-weight:800">${escapeHtml(p.nombre)}</h2>
              <span class="badge badge-info">${p.id}</span>
              <span class="badge ${p.estado === 'Activo' ? 'badge-success' : 'badge-warning'}">${p.estado}</span>
            </div>
            <div style="font-size:13.5px;color:var(--text-muted);margin-top:3px">
              ${p.tipoDoc || 'CC'} ${p.doc} · ${p.edad || '—'} años · ${p.sexo} · ${escapeHtml(p.eps)} (${escapeHtml(p.regimen)}) · Tel: ${escapeHtml(p.tel || 'No registrado')}
            </div>
          </div>
        </div>

        <div style="display:flex;gap:10px;align-items:center">
          <button class="btn btn-break-glass btn-sm" onclick="openModalBreakGlass('${p.id}')">
            ⚠️ Acceso de Emergencia
          </button>
          <button class="btn btn-secondary btn-sm" onclick="window.print()">
            🖨️ Imprimir
          </button>
        </div>
      </div>

      <!-- Allergy Warning Banner -->
      ${p.alergias && p.alergias.length > 0 ? `
        <div style="margin-top:16px;padding:10px 14px;background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:var(--radius-sm);display:flex;gap:10px;align-items:center">
          <span style="font-size:16px">🚨</span>
          <div style="font-size:13px;color:var(--danger);font-weight:700">
            ALERGIAS REGISTRADAS: ${p.alergias.map(a => `<span class="badge badge-danger" style="margin-left:4px">${escapeHtml(a)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>

    <!-- Tabs Navigation -->
    <div class="tabs-nav no-print">
      ${tabs.map(([key, label]) => `
        <button class="tab-btn ${state.ehrTab === key ? 'active' : ''}" onclick="state.ehrTab='${key}';render()">
          ${label}
        </button>
      `).join('')}
    </div>

    <!-- Tab Contents -->
    <div id="tab-content">
      ${renderEhrTabContent(p)}
    </div>
  `;
}

function renderEhrTabContent(p) {
  if (state.ehrTab === 'resumen') {
    return `
      <div class="grid grid-2">
        <!-- Antecedentes y Alergias -->
        <div class="card-glass">
          <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Antecedentes Médicos</h3>
          <ul style="padding-left:18px;margin-bottom:16px;font-size:13.5px">
            ${(p.antec || []).map(a => `<li>${escapeHtml(a)}</li>`).join('') || '<li style="color:var(--text-muted)">Sin antecedentes patológicos relevantes</li>'}
          </ul>

          <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Alergias Conocidas</h3>
          <div>
            ${(p.alergias || []).map(a => `<span class="badge badge-danger" style="margin-right:6px">${escapeHtml(a)}</span>`).join('') || '<span style="color:var(--text-muted);font-size:13px">Sin alergias documentadas</span>'}
          </div>
        </div>

        <!-- Diagnósticos Activos CIE-10 -->
        <div class="card-glass">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-size:15px;font-weight:700">Diagnósticos Activos (CIE-10)</h3>
            <button class="btn btn-secondary btn-sm" onclick="openModalDiagnostico('${p.id}')">+ Agregar</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px">
            ${(p.dx || []).map((d, idx) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
                <span style="font-weight:600;font-size:13.5px">🔍 ${escapeHtml(d)}</span>
                <button class="btn btn-secondary btn-sm" style="color:var(--danger);padding:2px 8px" onclick="eliminarDiagnostico('${p.id}', ${idx})">✕</button>
              </div>
            `).join('') || '<div style="color:var(--text-muted);font-size:13px">No registra diagnósticos activos.</div>'}
          </div>
        </div>

        <!-- Signos Vitales Actuales -->
        <div class="card-glass" style="grid-column: 1 / -1">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-size:15px;font-weight:700">Última Toma de Signos Vitales</h3>
            <button class="btn btn-primary btn-sm" onclick="openModalSignos('${p.id}')">Actualizar Signos</button>
          </div>
          <div class="grid grid-4">
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">Presión Arterial</div>
              <div style="font-size:20px;font-weight:800">${p.signos?.presion || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">Frecuencia Cardíaca</div>
              <div style="font-size:20px;font-weight:800">${p.signos?.fc || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">Temperatura</div>
              <div style="font-size:20px;font-weight:800">${p.signos?.temp || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">IMC / Peso</div>
              <div style="font-size:20px;font-weight:800">${p.signos?.imc || p.signos?.peso || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'evolucion') {
    return `
      <!-- Asistente Clínico Inteligente y Autogenerador de Problemas -->
      <div class="card-glass" style="margin-bottom:20px;border-top:3px solid var(--primary)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:var(--text-main)">⚡ Asistente Clínico: Estado del Paciente y Autogenerador de Problemas</h3>
            <p style="font-size:12.5px;color:var(--text-muted)">Escriba cómo está el paciente, sus síntomas referidos o hallazgos. El sistema detectará automáticamente los problemas y códigos CIE-10 correspondientes.</p>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px">
          <textarea id="clinico-relato" class="form-textarea" rows="3" placeholder="Ejemplo: Paciente femenina refiere dolor de cabeza pulsátil persistente de 3 días con náuseas y fotofobia. Además comenta cifras de presión arterial en 155/95 y mucha sed en las últimas semanas..."></textarea>
        </div>

        <div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <button type="button" class="btn btn-primary" onclick="ejecutarAnalisisClinico('${p.id}')">
            ⚡ Analizar y Autogenerar Problemas Clínicos (CIE-10)
          </button>
          <button type="button" class="btn btn-secondary" onclick="guardarEvolucionDesdeRelato('${p.id}')">
            💾 Guardar como Nota de Evolución
          </button>
        </div>

        <!-- Contenedor dinámico de diagnósticos y problemas autogenerados -->
        <div id="clinico-problemas-autogenerados"></div>
      </div>

      <!-- Historial de Notas de Evolución -->
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="font-size:16px;font-weight:700">Historial de Evoluciones Clínicas</h3>
          <button class="btn btn-secondary btn-sm" onclick="openModalEvolucion('${p.id}')">+ Nueva Nota Manual</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:14px">
          ${(p.evol || []).map(e => `
            <div style="padding:16px;border-left:3px solid var(--primary);background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div style="display:flex;justify-content:space-between;margin-bottom:6px">
                <b>${escapeHtml(e.tipo || 'Evolución')}</b>
                <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(e.fecha)} · ${escapeHtml(e.autor)}</span>
              </div>
              <p style="font-size:13.5px;color:var(--text-main);white-space:pre-line">${escapeHtml(e.nota)}</p>
            </div>
          `).join('') || '<div style="color:var(--text-muted)">Sin notas registradas.</div>'}
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'remisiones') {
    const patientRefs = (state.referralsList || []).filter(r => r.pacId === p.id);
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="font-size:16px;font-weight:700">Órdenes de Remisión e Interconsulta Médica</h3>
            <p style="font-size:12.5px;color:var(--text-muted)">Derivación formal a médicos especialistas de la clínica para diagnóstico o tratamiento avanzado</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="openModalRemitirEspecialista('${p.id}')">
            + Nueva Remisión a Especialista
          </button>
        </div>

        <div style="display:flex;flex-direction:column;gap:12px">
          ${patientRefs.map(r => `
            <div style="padding:16px;background:var(--border-subtle);border-radius:var(--radius-sm);border-left:4px solid ${r.prioridad === 'Prioritaria' ? 'var(--danger)' : 'var(--primary)'}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div>
                  <span style="font-size:16px;font-weight:800">Especialidad: ${escapeHtml(r.especialidadRequerida)}</span>
                  <span class="badge ${r.prioridad === 'Prioritaria' ? 'badge-danger' : 'badge-neutral'}" style="margin-left:8px">${escapeHtml(r.prioridad)}</span>
                  <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
                    Solicitante: <b>${escapeHtml(r.solicitante)}</b> · Especialista sugerido: ${escapeHtml(r.especialistaSugerido)} · Fecha: ${escapeHtml(r.fecha)}
                  </div>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                  <span class="badge ${r.est === 'Atendida' ? 'badge-success' : 'badge-warning'}">${escapeHtml(r.est)}</span>
                  <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('remision', '${r.id}')">🖨️ Imprimir</button>
                </div>
              </div>
              <div style="font-size:13.5px;color:var(--text-main);margin-bottom:6px">
                <b>Motivo de la remisión:</b> ${escapeHtml(r.motivo)}
              </div>
              <div style="font-size:13px;color:var(--text-muted)">
                <b>Resumen clínico:</b> ${escapeHtml(r.resumenClinico)}
              </div>
              ${r.conceptoEspecialista ? `
                <div style="margin-top:10px;padding:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:6px;font-size:13px">
                  <b style="color:var(--success)">✓ Concepto del Especialista (${escapeHtml(r.especialistaAtendio || 'Especialista')}):</b>
                  <div>${escapeHtml(r.conceptoEspecialista)}</div>
                  ${r.conducta ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px"><b>Conducta:</b> ${escapeHtml(r.conducta)}</div>` : ''}
                </div>
              ` : ''}
            </div>
          `).join('') || '<div style="color:var(--text-muted);padding:20px;text-align:center">No hay remisiones a especialistas para este paciente.</div>'}
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'laboratorio') {
    const labs = (state.patientData.labs || []);
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="font-size:16px;font-weight:700">Resultados del Laboratorio Clínico (LIS)</h3>
          <button class="btn btn-primary btn-sm" onclick="openModalOrdenLab('${p.id}')">+ Ordenar Examen</button>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          ${labs.map(l => `
            <div style="padding:16px;background:var(--border-subtle);border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <div>
                  <b style="font-size:15px">${escapeHtml(l.ex)}</b>
                  <div style="font-size:12px;color:var(--text-muted)">CUPS: ${l.cups} · Solicitado por: ${escapeHtml(l.med)} (${l.fechaSolicitud})</div>
                </div>
                <div style="display:flex;gap:8px;align-items:center">
                  <span class="badge ${l.est === 'Publicado' ? 'badge-success' : 'badge-warning'}">${l.est}</span>
                  ${l.est === 'Publicado' ? `<button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('lab', '${l.id}')">🖨️ Imprimir</button>` : ''}
                </div>
              </div>

              ${l.est === 'Publicado' ? `
                <div class="table-responsive">
                  <table>
                    <thead><tr><th>Parámetro</th><th>Resultado</th><th>Referencia</th><th>Estado</th></tr></thead>
                    <tbody>
                      ${l.res.map(r => `
                        <tr>
                          <td>${escapeHtml(r.p)}</td>
                          <td><b>${escapeHtml(r.v)}</b></td>
                          <td>${escapeHtml(r.r)}</td>
                          <td><span class="badge ${r.f === 'Normal' ? 'badge-success' : 'badge-danger'}">${r.f}</span></td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:8px">Validado por: ${escapeHtml(l.bacteriologo || 'Laboratorio')} · ${l.fechaPublicacion}</div>
              ` : `
                <div style="padding:12px;background:var(--warning-bg);color:var(--warning);border-radius:6px;font-size:13px">
                  ⏳ Muestra en procesamiento en el laboratorio clínico. Se notificará a la HCE tan pronto sea publicado.
                </div>
              `}
            </div>
          `).join('') || '<div style="color:var(--text-muted)">No hay exámenes solicitados para este paciente.</div>'}
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'recetas') {
    const rx = (state.patientData.prescriptions || []);
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="font-size:16px;font-weight:700">Fórmulas y Prescripciones Médicas (e-Prescribing)</h3>
          <button class="btn btn-primary btn-sm" onclick="openModalReceta('${p.id}')">+ Nueva Prescripción</button>
        </div>

        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Medicamento</th>
                <th>Dosis & Frecuencia</th>
                <th>Médico</th>
                <th>Fecha Emisión</th>
                <th>Estado Farmacia</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${rx.map(f => `
                <tr>
                  <td><b>${escapeHtml(f.med)}</b><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(f.pres)}</div></td>
                  <td>${escapeHtml(f.dosis)} · ${escapeHtml(f.frec)}</td>
                  <td>${escapeHtml(f.prof)}</td>
                  <td>${escapeHtml(f.fechaOrden)}</td>
                  <td><span class="badge ${f.est === 'Dispensado' ? 'badge-success' : f.est === 'Parcial' ? 'badge-warning' : 'badge-neutral'}">${f.est}</span></td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('receta', '${f.id}')">🖨️ Receta</button>
                  </td>
                </tr>
              `).join('') || `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No hay prescripciones activas.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'signos') {
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="font-size:16px;font-weight:700">Registro de Signos Vitales</h3>
          <button class="btn btn-primary btn-sm" onclick="openModalSignos('${p.id}')">Actualizar Signos</button>
        </div>
        <div class="grid grid-3">
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">Presión Arterial</div>
            <div style="font-size:22px;font-weight:800">${p.signos?.presion || '—'}</div>
          </div>
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">Frecuencia Cardíaca</div>
            <div style="font-size:22px;font-weight:800">${p.signos?.fc || '—'}</div>
          </div>
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">Frecuencia Respiratoria</div>
            <div style="font-size:22px;font-weight:800">${p.signos?.fr || '—'}</div>
          </div>
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">Temperatura</div>
            <div style="font-size:22px;font-weight:800">${p.signos?.temp || '—'}</div>
          </div>
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">Saturación O2</div>
            <div style="font-size:22px;font-weight:800">${p.signos?.satO2 || '—'}</div>
          </div>
          <div style="padding:14px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <div class="kpi-label">IMC / Estado Nutricional</div>
            <div style="font-size:20px;font-weight:800">${p.signos?.imc || '—'}</div>
          </div>
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'citas') {
    const citas = (state.patientData.appointments || []);
    return `
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:16px">Historial de Citas del Paciente</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr><th>Fecha</th><th>Hora</th><th>Especialidad</th><th>Profesional</th><th>Estado</th></tr>
            </thead>
            <tbody>
              ${citas.map(c => `
                <tr>
                  <td>${escapeHtml(c.fecha)}</td>
                  <td>${escapeHtml(c.hora)}</td>
                  <td>${escapeHtml(c.esp)}</td>
                  <td>${escapeHtml(c.med)}</td>
                  <td><span class="badge ${c.est === 'Atendida' ? 'badge-info' : c.est === 'Confirmada en Recepción' ? 'badge-success' : 'badge-neutral'}">${escapeHtml(c.est)}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Sin citas previas.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'fhir') {
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div>
            <h3 style="font-size:16px;font-weight:700">Interoperabilidad Estándar HL7 FHIR R4</h3>
            <p style="font-size:13px;color:var(--text-muted)">Bundle FHIR JSON con Patient, Condition, Observation, MedicationRequest y DiagnosticReport.</p>
          </div>
          <button class="btn btn-primary btn-sm" onclick="descargarFhir('${p.id}')">Descargar FHIR JSON</button>
        </div>
        <pre style="background:var(--bg-main);padding:16px;border-radius:var(--radius-sm);overflow:auto;max-height:480px;font-size:12.5px;color:var(--info)" id="fhir-json-view">
Cargando Bundle FHIR R4 desde API...
        </pre>
      </div>
    `;
  }

  return `<div class="card-glass">Sección en desarrollo</div>`;
}

// 7. Remisiones e Interconsultas View
function viewRemisiones() {
  const isEsp = state.user.rol === 'especialista';
  const isAdmin = state.user.rol === 'admin';
  const list = state.referralsList || [];

  const total = list.length;
  const pendientes = list.filter(r => r.est === 'Pendiente').length;
  const atendidas = list.filter(r => r.est === 'Atendida').length;

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Bandeja de Interconsultas y Remisiones a Especialistas</h1>
        <p class="page-subtitle">${isEsp ? 'Pacientes derivados a su especialidad para evaluación y concepto médico' : 'Gestión y seguimiento de derivaciones entre medicina general y especialidades'}</p>
      </div>
    </div>

    <!-- Counters -->
    <div class="grid grid-3" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Total Remisiones</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-meta">🔄 Flujo de interconsulta</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pendientes por Atender</div>
        <div class="kpi-value" style="color:var(--warning)">${pendientes}</div>
        <div class="kpi-meta">⏳ Requieren valoración especializada</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Conceptos Emitidos</div>
        <div class="kpi-value" style="color:var(--success)">${atendidas}</div>
        <div class="kpi-meta">✓ Valoración completada</div>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Paciente / Identificación</th>
            <th>Especialidad Requerida</th>
            <th>Médico Solicitante</th>
            <th>Prioridad</th>
            <th>Motivo de Remisión</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r => `
            <tr>
              <td>${escapeHtml(r.fecha)}</td>
              <td>
                <b>${escapeHtml(r.pacNombre)}</b>
                <div style="font-size:11.5px;color:var(--text-muted)">${escapeHtml(r.pacDoc || r.pacId)} · ${escapeHtml(r.pacEps || 'Particular')}</div>
              </td>
              <td><b>${escapeHtml(r.especialidadRequerida)}</b><div style="font-size:11px;color:var(--text-muted)">Sugerido: ${escapeHtml(r.especialistaSugerido)}</div></td>
              <td>${escapeHtml(r.solicitante)}</td>
              <td><span class="badge ${r.prioridad === 'Prioritaria' ? 'badge-danger' : 'badge-neutral'}">${escapeHtml(r.prioridad)}</span></td>
              <td style="max-width:240px;font-size:13px">${escapeHtml(r.motivo)}</td>
              <td><span class="badge ${r.est === 'Atendida' ? 'badge-success' : 'badge-warning'}">${escapeHtml(r.est)}</span></td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm" onclick="selectPatient('${r.pacId}')">
                    📋 Expediente
                  </button>
                  ${(isEsp || isAdmin) && r.est !== 'Atendida' ? `
                    <button class="btn btn-primary btn-sm" onclick="openModalConceptoEspecialista('${r.id}')">
                      ✍️ Emitir Concepto
                    </button>
                  ` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('remision', '${r.id}')">
                    🖨️
                  </button>
                </div>
              </td>
            </tr>
          `).join('') || '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No hay remisiones registradas.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

// 8. Laboratorio View
function viewLaboratorio() {
  const isLab = state.user.rol === 'laboratorio';
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Laboratorio Clínico (LIS)</h1>
        <p class="page-subtitle">Recepción de muestras, captura de parámetros analíticos y certificación de resultados</p>
      </div>
    </div>

    <!-- Counters -->
    <div class="grid grid-3" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Total Órdenes</div>
        <div class="kpi-value">${state.labOrders.length}</div>
        <div class="kpi-meta">🧪 Pruebas solicitadas</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pendientes de Proceso</div>
        <div class="kpi-value" style="color:var(--warning)">${state.labOrders.filter(l => l.est === 'Pendiente' || l.est === 'En proceso').length}</div>
        <div class="kpi-meta">⏳ En banco de análisis</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Publicadas y Certificadas</div>
        <div class="kpi-value" style="color:var(--success)">${state.labOrders.filter(l => l.est === 'Publicado').length}</div>
        <div class="kpi-meta">✓ Disponibles en la HCE</div>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>ID Orden</th>
            <th>Paciente</th>
            <th>Examen Solicitado</th>
            <th>CUPS</th>
            <th>Médico</th>
            <th>Fecha Solicitud</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.labOrders.map(l => `
            <tr>
              <td><code>${l.id}</code></td>
              <td><b>${escapeHtml(l.pacNombre)}</b></td>
              <td>${escapeHtml(l.ex)}</td>
              <td><code>${l.cups}</code></td>
              <td>${escapeHtml(l.med)}</td>
              <td>${escapeHtml(l.fechaSolicitud)}</td>
              <td><span class="badge ${l.est === 'Publicado' ? 'badge-success' : 'badge-warning'}">${l.est}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  ${isLab && l.est !== 'Publicado' ? `
                    <button class="btn btn-primary btn-sm" onclick="openModalEditarLab('${l.id}')">Capturar Resultados</button>
                  ` : ''}
                  ${l.est === 'Publicado' ? `
                    <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('lab', '${l.id}')">🖨️ Informe</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 9. Farmacia View
function viewFarmacia() {
  const isFarm = state.user.rol === 'farmacia';
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Farmacia Hospitalaria</h1>
        <p class="page-subtitle">Dispensación segura de medicamentos con verificación de alergias y control de inventario</p>
      </div>
    </div>

    <!-- Counters -->
    <div class="grid grid-3" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Total Prescripciones</div>
        <div class="kpi-value">${state.pharmacyOrders.length}</div>
        <div class="kpi-meta">💊 Recetas electrónicas</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pendientes de Entrega</div>
        <div class="kpi-value" style="color:var(--warning)">${state.pharmacyOrders.filter(f => f.est === 'Pendiente').length}</div>
        <div class="kpi-meta">⏳ Por dispensar</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Stock Crítico</div>
        <div class="kpi-value" style="color:var(--danger)">${state.medsCatalog.filter(m => m.stock < m.min).length}</div>
        <div class="kpi-meta">⚠️ Medicamentos bajo mínimo</div>
      </div>
    </div>

    <!-- Prescripciones -->
    <div class="card-glass" style="margin-bottom:24px">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Prescripciones Médicas Recibidas</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>ID Receta</th>
              <th>Paciente</th>
              <th>Medicamento</th>
              <th>Dosis & Frecuencia</th>
              <th>Médico Tratante</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${state.pharmacyOrders.map(f => `
              <tr>
                <td><code>${f.id}</code></td>
                <td><b>${escapeHtml(f.pacNombre)}</b></td>
                <td><b>${escapeHtml(f.med)}</b><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(f.pres)}</div></td>
                <td>${escapeHtml(f.dosis)} · ${escapeHtml(f.frec)}</td>
                <td>${escapeHtml(f.prof)}</td>
                <td><span class="badge ${f.est === 'Dispensado' ? 'badge-success' : f.est === 'Parcial' ? 'badge-warning' : 'badge-neutral'}">${f.est}</span></td>
                <td>
                  <div style="display:flex;gap:6px">
                    ${isFarm && f.est !== 'Dispensado' ? `
                      <button class="btn btn-primary btn-sm" onclick="openModalDispensar('${f.id}')">Dispensar</button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('receta', '${f.id}')">🖨️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Catálogo de Medicamentos e Inventario -->
    <div class="card-glass">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Inventario de Medicamentos</h3>
      <div class="table-responsive">
        <table>
          <thead>
            <tr>
              <th>Medicamento</th>
              <th>Presentación</th>
              <th>Stock Actual</th>
              <th>Stock Mínimo</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${state.medsCatalog.map(m => {
              const critico = m.stock < m.min;
              return `
                <tr>
                  <td><b>${escapeHtml(m.n)}</b></td>
                  <td>${escapeHtml(m.pres)}</td>
                  <td><b>${m.stock}</b></td>
                  <td>${m.min}</td>
                  <td><span class="badge ${critico ? 'badge-danger' : 'badge-success'}">${critico ? 'Bajo Stock' : 'Disponible'}</span></td>
                  <td>
                    ${isFarm ? `
                      <button class="btn btn-secondary btn-sm" onclick="reabastecerStock('${m.id}')">+ Reabastecer</button>
                    ` : ''}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// 10. Facturación View
function viewFacturacion() {
  const isFact = state.user.rol === 'facturacion' || state.user.rol === 'admin';
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Facturación y Cartera Hospitalaria</h1>
        <p class="page-subtitle">Liquidación de servicios médicos, copagos por régimen y recaudos</p>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Factura</th>
            <th>Paciente / Documento</th>
            <th>Aseguradora</th>
            <th>Servicio Clínico</th>
            <th>Valor Total</th>
            <th>Copago Paciente</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.invoices.map(i => `
            <tr>
              <td><b>${escapeHtml(i.fac)}</b></td>
              <td><b>${escapeHtml(i.pacNombre)}</b><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(i.doc || i.pacId)}</div></td>
              <td>${escapeHtml(i.eps)}</td>
              <td>${escapeHtml(i.serv)}</td>
              <td><b>${formatMoney(i.valorTotal)}</b></td>
              <td>${formatMoney(i.copagoPaciente)}</td>
              <td><span class="badge ${i.est === 'Pagada' ? 'badge-success' : i.est === 'Por confirmar' ? 'badge-warning' : 'badge-neutral'}">${i.est}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  ${isFact && i.est === 'Por confirmar' ? `
                    <button class="btn btn-primary btn-sm" onclick="confirmarFactura('${i.id}')">Confirmar</button>
                  ` : ''}
                  ${isFact && i.est === 'Confirmada' ? `
                    <button class="btn btn-success btn-sm" onclick="registrarPagoFactura('${i.id}')">Cobrar</button>
                  ` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="imprimirDocumento('factura', '${i.id}')">🖨️ Recibo</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 11. Accesos y Personal (Usuarios) View - EXCLUSIVO ADMIN
function viewUsuarios() {
  const list = state.usersList || [];
  const total = list.length;
  const medicos = list.filter(u => u.rol === 'medico').length;
  const especialistas = list.filter(u => u.rol === 'especialista').length;
  const administrativos = list.filter(u => u.rol === 'admin').length;

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Gestión de Personal y Control de Accesos</h1>
        <p class="page-subtitle">Administración de colaboradores, credenciales, perfiles y políticas de seguridad</p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="openModalNuevoUsuario()">+ Crear Colaborador</button>
      </div>
    </div>

    <!-- Counters -->
    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Total Colaboradores</div>
        <div class="kpi-value">${total}</div>
        <div class="kpi-meta">🔑 Cuentas activas</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Médicos Generales</div>
        <div class="kpi-value" style="color:var(--primary)">${medicos}</div>
        <div class="kpi-meta">🩺 Atención primaria</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Médicos Especialistas</div>
        <div class="kpi-value" style="color:var(--secondary)">${especialistas}</div>
        <div class="kpi-meta">🔬 Consulta especializada</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Administración & Admisión</div>
        <div class="kpi-value" style="color:var(--info)">${administrativos}</div>
        <div class="kpi-meta">📋 Gestión operativa</div>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Usuario</th>
            <th>Nombre Completo</th>
            <th>Rol / Perfil</th>
            <th>Cargo</th>
            <th>Correo Institucional</th>
            <th>Acciones de Seguridad</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(u => `
            <tr>
              <td><code>${escapeHtml(u.user)}</code></td>
              <td><b>${escapeHtml(u.nombre)}</b></td>
              <td>
                <span class="badge ${
                  u.rol === 'admin' ? 'badge-primary' :
                  u.rol === 'medico' ? 'badge-info' :
                  u.rol === 'especialista' ? 'badge-warning' :
                  u.rol === 'laboratorio' ? 'badge-success' : 'badge-neutral'
                }">
                  ${escapeHtml(u.rol)}
                </span>
              </td>
              <td>${escapeHtml(u.cargo || '—')}</td>
              <td>${escapeHtml(u.email || '—')}</td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm" onclick="openModalCambiarRol('${u.id}', '${escapeHtml(u.user)}', '${u.rol}')">
                    Rol
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick="solicitarResetClave('${u.id}', '${escapeHtml(u.user)}')">
                    Reset Clave
                  </button>
                  ${u.id !== state.user.id ? `
                    <button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="eliminarUsuario('${u.id}', '${escapeHtml(u.user)}')">
                      Revocar
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 12. Reportes View
function viewReportes() {
  const d = state.kpisData || { clinicos: {}, operaciones: {}, finanzas: {} };
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Indicadores Gerenciales y Calidad</h1>
        <p class="page-subtitle">Analítica hospitalaria, tiempos de servicio y balance de cartera</p>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:24px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Ocupación de Camas</div>
        <div class="kpi-value">${d.operaciones.ocupacionCamas || '78%'}</div>
        <div class="kpi-meta">Hospitalización general</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Tiempo Espera Consulta</div>
        <div class="kpi-value">${d.operaciones.tiempoEsperaPromedioMin || '18'} min</div>
        <div class="kpi-meta">Desde check-in a llamado médico</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Facturación Mensual</div>
        <div class="kpi-value">${formatMoney(d.finanzas.recaudoMes || 42800000)}</div>
        <div class="kpi-meta">Liquidado y convenios EPS</div>
      </div>
    </div>
  `;
}

// 13. Auditoría View
function viewAuditoria() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Auditoría & Trazabilidad</h1>
        <p class="page-subtitle">Bitácora inmutable de accesos clínicos, check-in de pacientes y eventos de seguridad</p>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Marca de Tiempo</th>
            <th>Usuario</th>
            <th>Perfil / Rol</th>
            <th>Acción</th>
            <th>Paciente</th>
            <th>Detalle Técnico</th>
          </tr>
        </thead>
        <tbody>
          ${state.auditLogs.map(l => `
            <tr>
              <td><span style="font-size:12px;color:var(--text-muted)">${new Date(l.timestamp).toLocaleString('es-CO')}</span></td>
              <td><b>${escapeHtml(l.usuario)}</b></td>
              <td><span class="badge badge-neutral">${escapeHtml(l.rol)}</span></td>
              <td><span class="badge ${l.accion.includes('EMERGENCIA') ? 'badge-danger' : l.accion.includes('FALLIDO') ? 'badge-warning' : 'badge-info'}">${l.accion}</span></td>
              <td>${l.pacienteId ? `<code>${l.pacienteId}</code>` : '—'}</td>
              <td style="font-size:13px">${escapeHtml(l.detalle)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

/* ==========================================================================
   MODALES Y OPERACIONES
   ========================================================================== */

// Modal Universal de Cita Médica (para personas nuevas o registradas)
function openModalCita() {
  const doctors = [
    { n: "Dr. Andrés Martínez", esp: "Medicina general" },
    { n: "Dra. Laura Gómez", esp: "Ginecología" },
    { n: "Dr. Julián Restrepo", esp: "Neumología" }
  ];

  window._citaPacId = null;

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Agendar Cita Médica (Universal)</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
      Asigne cita a cualquier persona. Ingrese el número de documento: si ya existe en el sistema se asociará a su historia clínica; si es primera vez se creará su expediente automáticamente.
    </p>

    <form onsubmit="event.preventDefault(); guardarCita()">
      <!-- Cédula y Búsqueda -->
      <div style="background:var(--border-subtle);padding:14px;border-radius:10px;margin-bottom:16px">
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Tipo de Documento</label>
            <select id="cita-tipo-doc" class="form-select">
              <option value="CC">Cédula de Ciudadanía (CC)</option>
              <option value="TI">Tarjeta de Identidad (TI)</option>
              <option value="CE">Cédula de Extranjería (CE)</option>
              <option value="PA">Pasaporte (PA)</option>
              <option value="RC">Registro Civil (RC)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Número de Documento *</label>
            <input id="cita-doc-input" class="form-input" placeholder="Ej: 1032458771" required
              oninput="verificarDocumentoCita(this.value)">
          </div>
        </div>
        <div id="cita-paciente-status" style="margin-top:8px"></div>
      </div>

      <!-- Datos Personales Completos -->
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Nombre Completo del Paciente *</label>
          <input id="cita-nombre" class="form-input" placeholder="Nombres y Apellidos" required>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono / Celular de Contacto *</label>
          <input id="cita-tel" class="form-input" placeholder="Ej: 310 555 0182" required>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Correo Electrónico</label>
          <input id="cita-email" type="email" class="form-input" placeholder="correo@ejemplo.com">
        </div>
        <div class="form-group">
          <label class="form-label">Dirección de Residencia</label>
          <input id="cita-dir" class="form-input" placeholder="Dirección y Ciudad">
        </div>
      </div>

      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Seguro Médico / EPS *</label>
          <select id="cita-eps" class="form-select">
            <option value="Sura EPS">Sura EPS</option>
            <option value="Sanitas EPS">Sanitas EPS</option>
            <option value="Nueva EPS">Nueva EPS</option>
            <option value="Salud Total">Salud Total</option>
            <option value="Compensar">Compensar</option>
            <option value="Coomeva">Coomeva</option>
            <option value="Particular / Sin EPS">Particular / Sin EPS</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Régimen</label>
          <select id="cita-regimen" class="form-select">
            <option value="Contributivo">Contributivo</option>
            <option value="Subsidiado">Subsidiado</option>
            <option value="Particular">Particular</option>
            <option value="Especial">Especial</option>
          </select>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Edad (años)</label>
          <input id="cita-edad" type="number" class="form-input" placeholder="Ej: 34" min="0" max="120">
        </div>
        <div class="form-group">
          <label class="form-label">Sexo</label>
          <select id="cita-sexo" class="form-select">
            <option value="F">Femenino</option>
            <option value="M">Masculino</option>
          </select>
        </div>
      </div>

      <!-- Contacto de emergencia -->
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Contacto de Emergencia (Nombre)</label>
          <input id="cita-cont-nombre" class="form-input" placeholder="Familiar o Acompañante">
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono de Emergencia</label>
          <input id="cita-cont-tel" class="form-input" placeholder="Teléfono de emergencia">
        </div>
      </div>

      <!-- Datos de la Cita Médica -->
      <div style="border-top:1px solid var(--border-subtle);padding-top:14px;margin-top:10px">
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Especialidad Requerida</label>
            <select id="cita-esp" class="form-select" onchange="actualizarMedicosSegunEsp(this.value)">
              <option value="Medicina general">Medicina general</option>
              <option value="Ginecología">Ginecología</option>
              <option value="Neumología">Neumología</option>
              <option value="Cardiología preventiva">Cardiología preventiva</option>
              <option value="Endocrinología">Endocrinología</option>
              <option value="Pediatría">Pediatría</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Médico o Especialista Asignado *</label>
            <select id="cita-med" class="form-select">
              ${doctors.map(d => `<option value="${d.n}" data-esp="${d.esp}">${d.n} (${d.esp})</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">Fecha de la Cita *</label>
            <input id="cita-fecha" type="date" class="form-input" value="${new Date().toISOString().slice(0, 10)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Horario de Atención *</label>
            <select id="cita-hora" class="form-select">
              <option>07:30</option>
              <option>08:00</option>
              <option selected>08:30</option>
              <option>09:00</option>
              <option>09:30</option>
              <option>10:00</option>
              <option>10:30</option>
              <option>11:00</option>
              <option>11:30</option>
              <option>14:00</option>
              <option>14:30</option>
              <option>15:00</option>
              <option>15:30</option>
              <option>16:00</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Motivo de Consulta</label>
          <input id="cita-motivo" class="form-input" placeholder="Ej: Control general, dolor de cabeza persistente o revisión de exámenes">
        </div>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Confirmar Agendamiento</button>
      </div>
    </form>
  `);
}

function actualizarMedicosSegunEsp(esp) {
  const medSelect = document.getElementById('cita-med');
  if (!medSelect) return;
  const docs = [
    { n: "Dr. Andrés Martínez", esp: "Medicina general" },
    { n: "Dra. Laura Gómez", esp: "Ginecología" },
    { n: "Dr. Julián Restrepo", esp: "Neumología" }
  ];
  const matching = docs.filter(d => d.esp.toLowerCase().includes(esp.toLowerCase()));
  const finalDocs = matching.length > 0 ? matching : docs;
  medSelect.innerHTML = finalDocs.map(d => `<option value="${d.n}">${d.n} (${d.esp})</option>`).join('');
}

let _lookupTimeout = null;
function verificarDocumentoCita(docValue) {
  clearTimeout(_lookupTimeout);
  const statusBox = document.getElementById('cita-paciente-status');
  if (!statusBox) return;

  const digits = String(docValue || '').replace(/\D/g, '');
  if (digits.length < 5) {
    statusBox.innerHTML = '';
    window._citaPacId = null;
    return;
  }

  _lookupTimeout = setTimeout(async () => {
    try {
      const res = await api.get(`/patients/by-doc/${digits}`, { silent: true });
      if (res.exists && res.patient) {
        const p = res.patient;
        window._citaPacId = p.id;
        statusBox.innerHTML = `
          <div style="padding:10px 14px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:8px;font-size:13px;color:var(--success)">
            <b>✅ Paciente registrado:</b> ${escapeHtml(p.nombre)} (ID: ${p.id}) · EPS: ${escapeHtml(p.eps)}
            <div style="font-size:12px;color:var(--text-main);margin-top:2px">La cita se vinculará a su historia clínica preexistente para continuidad médica.</div>
          </div>
        `;
        // Autocompletar datos si están vacíos
        const nomEl = document.getElementById('cita-nombre');
        const telEl = document.getElementById('cita-tel');
        const emailEl = document.getElementById('cita-email');
        const epsEl = document.getElementById('cita-eps');
        const regEl = document.getElementById('cita-regimen');
        const edadEl = document.getElementById('cita-edad');

        if (nomEl) nomEl.value = p.nombre || '';
        if (telEl) telEl.value = p.tel || '';
        if (emailEl) emailEl.value = p.email || '';
        if (epsEl && p.eps) epsEl.value = p.eps;
        if (regEl && p.regimen) regEl.value = p.regimen;
        if (edadEl && p.edad) edadEl.value = p.edad;
      } else {
        window._citaPacId = null;
        statusBox.innerHTML = `
          <div style="padding:10px 14px;background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.35);border-radius:8px;font-size:13px;color:var(--info)">
            <b>🆕 Paciente Nuevo (Primera Cita):</b>
            <div style="font-size:12px;color:var(--text-main);margin-top:2px">No existe expediente previo con este documento. Se creará automáticamente su Historia Clínica con los datos ingresados.</div>
          </div>
        `;
      }
    } catch (e) {}
  }, 300);
}

async function guardarCita() {
  const pacId = window._citaPacId || null;
  const tipoDoc = document.getElementById('cita-tipo-doc')?.value || 'CC';
  const doc = document.getElementById('cita-doc-input')?.value || '';
  const nombre = document.getElementById('cita-nombre')?.value || '';
  const tel = document.getElementById('cita-tel')?.value || '';
  const email = document.getElementById('cita-email')?.value || '';
  const direccion = document.getElementById('cita-dir')?.value || '';
  const eps = document.getElementById('cita-eps')?.value || 'Particular';
  const regimen = document.getElementById('cita-regimen')?.value || 'Particular';
  const edad = document.getElementById('cita-edad')?.value || '';
  const sexo = document.getElementById('cita-sexo')?.value || 'F';
  const contNombre = document.getElementById('cita-cont-nombre')?.value || '';
  const contTel = document.getElementById('cita-cont-tel')?.value || '';

  const esp = document.getElementById('cita-esp')?.value || 'Medicina general';
  const med = document.getElementById('cita-med')?.value || 'Dr. Andrés Martínez';
  const fecha = document.getElementById('cita-fecha')?.value || '';
  const hora = document.getElementById('cita-hora')?.value || '';
  const motivo = document.getElementById('cita-motivo')?.value || '';

  try {
    const res = await api.post('/appointments', {
      pacId,
      tipoDoc,
      doc,
      nombre,
      tel,
      email,
      direccion,
      eps,
      regimen,
      edad,
      sexo,
      contactoEmergencia: { nombre: contNombre, tel: contTel },
      esp,
      med,
      fecha,
      hora,
      motivo
    });

    closeModal();
    toast(res.message || 'Cita agendada exitosamente en recepción');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function confirmarCheckinCita(id) {
  try {
    const res = await api.patch(`/appointments/${id}/checkin`, {});
    toast(res.message || 'Llegada confirmada. El paciente ya puede ser atendido por el médico.');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function iniciarAtencionCita(aptId, pacId) {
  try {
    await api.patch(`/appointments/${aptId}/status`, { est: 'En consulta' });
    toast('Consulta iniciada');
    await loadModuleData();
    selectPatient(pacId);
  } catch (e) {}
}

async function cambiarEstadoCita(id, est) {
  try {
    await api.patch(`/appointments/${id}/status`, { est });
    toast(`Estado de la cita actualizado a ${est}`);
    await loadModuleData();
    render();
  } catch (e) {}
}

// Asistente Clínico Inteligente (Autogenerador de problemas CIE-10)
async function ejecutarAnalisisClinico(pacId) {
  const txtEl = document.getElementById('clinico-relato');
  const box = document.getElementById('clinico-problemas-autogenerados');
  if (!txtEl || !box) return;
  const texto = txtEl.value.trim();
  if (!texto) {
    toast('Ingrese el relato o estado del paciente para analizar', 'warning');
    return;
  }

  box.innerHTML = `<div style="padding:14px;color:var(--text-muted);text-align:center">Analizando síntomas y signos clínicos con motor CIE-10...</div>`;

  try {
    const res = await api.post('/patients/analyze-symptoms', { texto });
    if (!res.problemas || res.problemas.length === 0) {
      box.innerHTML = `<div style="padding:12px;background:var(--border-subtle);border-radius:8px;font-size:13px;color:var(--text-muted)">No se detectaron problemas agudos específicos. Puede complementar el relato o registrar un diagnóstico general.</div>`;
      return;
    }

    box.innerHTML = `
      <div style="padding:14px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.3);border-radius:12px">
        <div style="font-weight:800;font-size:14px;color:var(--primary);margin-bottom:10px">
          💡 Se detectaron ${res.problemas.length} problemas clínicos a partir del estado del paciente:
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${res.problemas.map(prob => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg-surface);border-radius:8px;border:1px solid var(--border-subtle);flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:700;font-size:13.5px">
                  ${prob.urgente ? '<span class="badge badge-danger">🚨 URGENTE</span> ' : ''}
                  ${prob.alerta ? '<span class="badge badge-warning">⚠️ Alerta</span> ' : ''}
                  ${escapeHtml(prob.nombre)}
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">
                  ${escapeHtml(prob.sugerencia)} · <b>Especialidad sugerida:</b> ${escapeHtml(prob.especialidadSugerida)}
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="agregarDiagnosticoAutogenerado('${pacId}', '${escapeHtml(prob.nombre)}')">
                  + Agregar a Diagnósticos (HCE)
                </button>
                ${prob.especialidadSugerida !== 'Medicina general' ? `
                  <button class="btn btn-primary btn-sm" onclick="openModalRemitirEspecialista('${pacId}', '${escapeHtml(prob.especialidadSugerida)}', '${escapeHtml(prob.problema)}')">
                    🔄 Remitir a ${escapeHtml(prob.especialidadSugerida)}
                  </button>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div style="color:var(--danger)">Error al procesar el análisis de síntomas: ${escapeHtml(e.message)}</div>`;
  }
}

async function agregarDiagnosticoAutogenerado(pacId, dx) {
  try {
    await api.post(`/patients/${pacId}/diagnoses`, { diagnostico: dx });
    toast(`Diagnóstico agregado: ${dx}`);
    await loadModuleData();
    render();
  } catch (e) {}
}

async function guardarEvolucionDesdeRelato(pacId) {
  const txtEl = document.getElementById('clinico-relato');
  if (!txtEl || !txtEl.value.trim()) {
    toast('Ingrese una nota o descripción para guardar', 'warning');
    return;
  }
  try {
    await api.post(`/patients/${pacId}/evolution`, { nota: txtEl.value.trim(), tipo: 'Consulta Médica' });
    toast('Nota de evolución guardada en el expediente');
    txtEl.value = '';
    await loadModuleData();
    render();
  } catch (e) {}
}

// Modal de Remisión a Especialista
function openModalRemitirEspecialista(pacId, espSugerida = '', motSugerido = '') {
  const specialties = [
    "Ginecología",
    "Neumología",
    "Cardiología preventiva",
    "Endocrinología",
    "Pediatría",
    "Ortopedia y Traumatología",
    "Neurología",
    "Dermatología"
  ];

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Generar Orden de Remisión a Especialista</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Derivación formal para interconsulta con especialista clínico.</p>

    <form onsubmit="event.preventDefault(); guardarRemisionEspecialista('${pacId}')">
      <div class="form-group">
        <label class="form-label">Especialidad Requerida *</label>
        <select id="rem-esp" class="form-select" required>
          ${specialties.map(s => `<option value="${s}" ${s.toLowerCase().includes(espSugerida.toLowerCase()) && espSugerida ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>

      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Prioridad de Atención *</label>
          <select id="rem-prioridad" class="form-select">
            <option value="Normal">Normal (Consulta Externa)</option>
            <option value="Prioritaria">Prioritaria / Urgente</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Especialista Sugerido</label>
          <input id="rem-esp-nombre" class="form-input" placeholder="Ej: Dr. Julián Restrepo o Primer disponible" value="Primer especialista disponible">
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Motivo de la Remisión *</label>
        <input id="rem-motivo" class="form-input" placeholder="Ej: Evaluación por asma no controlada / sospecha de arritmia" value="${escapeHtml(motSugerido)}" required>
      </div>

      <div class="form-group">
        <label class="form-label">Resumen Clínico y Hallazgos Relevantes</label>
        <textarea id="rem-resumen" class="form-textarea" rows="4" placeholder="Describa el cuadro actual, antecedentes, medicamentos que recibe y el objetivo de la interconsulta..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Emitir Orden de Remisión</button>
      </div>
    </form>
  `);
}

async function guardarRemisionEspecialista(pacId) {
  const especialidadRequerida = document.getElementById('rem-esp')?.value;
  const prioridad = document.getElementById('rem-prioridad')?.value;
  const especialistaSugerido = document.getElementById('rem-esp-nombre')?.value;
  const motivo = document.getElementById('rem-motivo')?.value;
  const resumenClinico = document.getElementById('rem-resumen')?.value;

  try {
    const res = await api.post('/referrals', {
      pacId,
      especialidadRequerida,
      prioridad,
      especialistaSugerido,
      motivo,
      resumenClinico
    });

    closeModal();
    toast('Orden de remisión a especialista emitida correctamente');
    await loadModuleData();
    render();
  } catch (e) {}
}

// Modal para que el Especialista emita su concepto
function openModalConceptoEspecialista(refId) {
  const ref = (state.referralsList || []).find(r => r.id === refId);
  if (!ref) return;

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Emitir Concepto Médico Especializado</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
      Paciente: <b>${escapeHtml(ref.pacNombre)}</b> · Motivo: ${escapeHtml(ref.motivo)}
    </p>

    <form onsubmit="event.preventDefault(); guardarConceptoEspecialista('${ref.id}')">
      <div class="form-group">
        <label class="form-label">Concepto y Valoración Especializada *</label>
        <textarea id="conc-texto" class="form-textarea" rows="4" placeholder="Juicio clínico especializado, confirmación o descarte diagnóstico..." required></textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Conducta / Plan de Manejo Recomendado</label>
        <textarea id="conc-conducta" class="form-textarea" rows="2" placeholder="Ajuste terapéutico, solicitud de exámenes de alta complejidad o contrarreferencia..."></textarea>
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar Concepto y Finalizar</button>
      </div>
    </form>
  `);
}

async function guardarConceptoEspecialista(refId) {
  const concepto = document.getElementById('conc-texto')?.value;
  const conducta = document.getElementById('conc-conducta')?.value;

  try {
    await api.patch(`/referrals/${refId}/concepto`, { concepto, conducta });
    closeModal();
    toast('Concepto especializado registrado exitosamente');
    await loadModuleData();
    render();
  } catch (e) {}
}

// Gestión de Usuarios (Admin)
function openModalNuevoUsuario() {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Crear Nuevo Colaborador / Usuario</h2>
    <form onsubmit="event.preventDefault(); guardarNuevoUsuario()">
      <div class="form-group">
        <label class="form-label">Nombre Completo *</label>
        <input id="nu-nombre" class="form-input" placeholder="Ej: Dr. Roberto Gómez" required>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Nombre de Usuario (Login) *</label>
          <input id="nu-user" class="form-input" placeholder="Ej: dr.gomez" required>
        </div>
        <div class="form-group">
          <label class="form-label">Contraseña Inicial (mínimo 8 caract.) *</label>
          <input id="nu-pw" type="password" class="form-input" placeholder="••••••••" required minlength="8">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Rol del Sistema *</label>
          <select id="nu-rol" class="form-select" required>
            <option value="admin">admin (Administración y Admisiones)</option>
            <option value="medico">medico (Médico General / Atención Primaria)</option>
            <option value="especialista">especialista (Médico Especialista)</option>
            <option value="laboratorio">laboratorio (Laboratorio Clínico)</option>
            <option value="farmacia">farmacia (Farmacia Hospitalaria)</option>
            <option value="facturacion">facturacion (Facturación y Cartera)</option>
            <option value="gerencia">gerencia (Dirección Médica)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cargo Institucional</label>
          <input id="nu-cargo" class="form-input" placeholder="Ej: Médico Especialista en Cardiología">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Correo Electrónico</label>
        <input id="nu-email" type="email" class="form-input" placeholder="roberto.gomez@saluddigital.com">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Crear Usuario</button>
      </div>
    </form>
  `);
}

async function guardarNuevoUsuario() {
  const nombre = document.getElementById('nu-nombre')?.value;
  const user = document.getElementById('nu-user')?.value;
  const pw = document.getElementById('nu-pw')?.value;
  const rol = document.getElementById('nu-rol')?.value;
  const cargo = document.getElementById('nu-cargo')?.value;
  const email = document.getElementById('nu-email')?.value;

  try {
    await api.post('/auth/users', { nombre, user, pw, rol, cargo, email });
    closeModal();
    toast('Colaborador creado exitosamente');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalCambiarRol(userId, userName, currentRol) {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Modificar Rol de Usuario</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Usuario: <b>${escapeHtml(userName)}</b></p>
    <form onsubmit="event.preventDefault(); guardarCambioRol('${userId}')">
      <div class="form-group">
        <label class="form-label">Nuevo Perfil / Rol</label>
        <select id="cr-rol" class="form-select">
          <option value="admin" ${currentRol === 'admin' ? 'selected' : ''}>Administración y Admisiones</option>
          <option value="medico" ${currentRol === 'medico' ? 'selected' : ''}>Médico General</option>
          <option value="especialista" ${currentRol === 'especialista' ? 'selected' : ''}>Médico Especialista</option>
          <option value="laboratorio" ${currentRol === 'laboratorio' ? 'selected' : ''}>Laboratorio Clínico</option>
          <option value="farmacia" ${currentRol === 'farmacia' ? 'selected' : ''}>Farmacia Hospitalaria</option>
          <option value="facturacion" ${currentRol === 'facturacion' ? 'selected' : ''}>Facturación y Cartera</option>
          <option value="gerencia" ${currentRol === 'gerencia' ? 'selected' : ''}>Dirección Médica</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Cambio</button>
      </div>
    </form>
  `);
}

async function guardarCambioRol(userId) {
  const rol = document.getElementById('cr-rol')?.value;
  try {
    await api.patch(`/auth/users/${userId}/role`, { rol });
    closeModal();
    toast('Rol de usuario actualizado');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function solicitarResetClave(userId, userName) {
  if (!confirm(`¿Desea resetear la contraseña del usuario ${userName}? Se cerrarán todas sus sesiones activas y se generará una contraseña temporal.`)) return;
  try {
    const res = await api.post(`/auth/users/${userId}/reset-password`, {});
    openModal(`
      <h2 style="font-size:20px;font-weight:800;margin-bottom:10px">Contraseña Temporal Generada</h2>
      <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:16px">
        Entregue esta clave temporal al usuario <b>${escapeHtml(userName)}</b> por un canal seguro:
      </p>
      <div style="background:var(--bg-main);padding:14px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border:1px solid var(--border-medium)">
        <code style="font-size:18px;font-weight:800;letter-spacing:1px;color:var(--primary)">${escapeHtml(res.temporaryPassword)}</code>
        <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${escapeHtml(res.temporaryPassword)}'); toast('Contraseña copiada al portapapeles')">
          📋 Copiar
        </button>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button class="btn btn-primary" onclick="closeModal()">Entendido</button>
      </div>
    `);
  } catch (e) {}
}

async function eliminarUsuario(userId, userName) {
  if (!confirm(`¿Está seguro de que desea revocar el acceso y eliminar permanentemente la cuenta de ${userName}?`)) return;
  try {
    await api.del(`/auth/users/${userId}`);
    toast('Usuario revocado');
    await loadModuleData();
    render();
  } catch (e) {}
}

// Impresión de Documentos Médicos Formales
function imprimirDocumento(tipo, id) {
  let docTitle = 'Documento Clínico';
  let bodyHtml = '';
  const now = new Date().toLocaleString('es-CO');

  if (tipo === 'remision') {
    const r = (state.referralsList || []).find(x => x.id === id);
    if (!r) return;
    docTitle = 'Orden de Remisión e Interconsulta Médica';
    bodyHtml = `
      <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
        <h2 style="margin:0;font-size:20px;text-transform:uppercase">SaludDigital Clínica Privada S.A.S.</h2>
        <div style="font-size:12px;color:#555">NIT: 901.442.819-3 · Calle 33 Sur # 42B - 10, Medellín · PBX: (604) 448-9000</div>
        <h3 style="margin-top:12px;font-size:16px;color:#1e3a8a">ORDEN DE INTERCONSULTA / REMISIÓN A ESPECIALISTA</h3>
      </div>
      <table style="width:100%;margin-bottom:16px;font-size:13px;border-collapse:collapse">
        <tr><td><b>ID Remisión:</b> ${r.id}</td><td><b>Fecha:</b> ${r.fecha}</td><td><b>Prioridad:</b> ${r.prioridad}</td></tr>
        <tr><td><b>Paciente:</b> ${escapeHtml(r.pacNombre)}</td><td><b>Documento:</b> ${r.pacDoc || '—'}</td><td><b>EPS:</b> ${escapeHtml(r.pacEps || 'Particular')}</td></tr>
        <tr><td><b>Especialidad Solicitada:</b> ${escapeHtml(r.especialidadRequerida)}</td><td colspan="2"><b>Especialista Sugerido:</b> ${escapeHtml(r.especialistaSugerido)}</td></tr>
      </table>
      <div style="margin-bottom:14px;font-size:13px">
        <b>MOTIVO DE LA REMISIÓN:</b>
        <p style="margin:4px 0 10px 0">${escapeHtml(r.motivo)}</p>
      </div>
      <div style="margin-bottom:24px;font-size:13px">
        <b>RESUMEN CLÍNICO Y HALLAZGOS:</b>
        <p style="margin:4px 0">${escapeHtml(r.resumenClinico)}</p>
      </div>
      <div style="margin-top:50px;display:flex;justify-content:space-between">
        <div style="border-top:1px solid #000;width:240px;text-align:center;font-size:12px;padding-top:4px">
          Firma Médico Solicitante<br><b>${escapeHtml(r.solicitante)}</b>
        </div>
        <div style="border-top:1px solid #000;width:240px;text-align:center;font-size:12px;padding-top:4px">
          Sello y Firma Especialista Receptor
        </div>
      </div>
    `;
  } else if (tipo === 'receta') {
    const rx = (state.pharmacyOrders || []).find(x => x.id === id);
    if (!rx) return;
    docTitle = 'Fórmula Médica Hospitalaria';
    bodyHtml = `
      <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
        <h2 style="margin:0;font-size:20px;text-transform:uppercase">SaludDigital Clínica Privada S.A.S.</h2>
        <div style="font-size:12px;color:#555">NIT: 901.442.819-3 · Calle 33 Sur # 42B - 10, Medellín · PBX: (604) 448-9000</div>
        <h3 style="margin-top:12px;font-size:16px;color:#1e3a8a">PRESCRIPCIÓN MÉDICA ELECTRÓNICA</h3>
      </div>
      <table style="width:100%;margin-bottom:16px;font-size:13px;border-collapse:collapse">
        <tr><td><b>ID Receta:</b> ${rx.id}</td><td><b>Fecha:</b> ${rx.fechaOrden}</td></tr>
        <tr><td><b>Paciente:</b> ${escapeHtml(rx.pacNombre)}</td><td><b>ID Paciente:</b> ${rx.pacId}</td></tr>
        <tr><td><b>Médico Tratante:</b> ${escapeHtml(rx.prof)}</td><td><b>Estado:</b> ${rx.est}</td></tr>
      </table>
      <div style="border:1px solid #ccc;padding:14px;border-radius:6px;margin-bottom:20px">
        <div style="font-size:16px;font-weight:800;color:#000">${escapeHtml(rx.med)} (${escapeHtml(rx.pres)})</div>
        <div style="font-size:14px;margin-top:4px"><b>Dosificación:</b> ${escapeHtml(rx.dosis)}</div>
        <div style="font-size:14px;margin-top:2px"><b>Frecuencia:</b> ${escapeHtml(rx.frec)} · <b>Duración:</b> ${escapeHtml(rx.duracion || '10 días')}</div>
      </div>
      <div style="margin-top:60px;border-top:1px solid #000;width:260px;text-align:center;font-size:12px;padding-top:4px">
        Firma y Registro Médico<br><b>${escapeHtml(rx.prof)}</b>
      </div>
    `;
  } else if (tipo === 'lab') {
    const l = (state.labOrders || []).find(x => x.id === id);
    if (!l) return;
    docTitle = 'Informe de Laboratorio Clínico';
    bodyHtml = `
      <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
        <h2 style="margin:0;font-size:20px;text-transform:uppercase">SaludDigital · Laboratorio Clínico Especializado</h2>
        <div style="font-size:12px;color:#555">Habilitación Seccional de Salud · PBX: (604) 448-9000</div>
        <h3 style="margin-top:12px;font-size:16px;color:#1e3a8a">CERTIFICADO DE RESULTADOS ANALÍTICOS</h3>
      </div>
      <table style="width:100%;margin-bottom:16px;font-size:13px;border-collapse:collapse">
        <tr><td><b>Examen:</b> ${escapeHtml(l.ex)}</td><td><b>CUPS:</b> ${l.cups}</td></tr>
        <tr><td><b>Paciente:</b> ${escapeHtml(l.pacNombre)}</td><td><b>Solicitado por:</b> ${escapeHtml(l.med)}</td></tr>
        <tr><td><b>Validado por:</b> ${escapeHtml(l.bacteriologo || 'Laboratorio')}</td><td><b>Fecha Validación:</b> ${l.fechaPublicacion}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
        <thead>
          <tr style="border-bottom:2px solid #333;text-align:left">
            <th style="padding:6px">Parámetro</th>
            <th style="padding:6px">Resultado</th>
            <th style="padding:6px">Valor de Referencia</th>
            <th style="padding:6px">Flag</th>
          </tr>
        </thead>
        <tbody>
          ${(l.res || []).map(r => `
            <tr style="border-bottom:1px solid #ddd">
              <td style="padding:6px">${escapeHtml(r.p)}</td>
              <td style="padding:6px;font-weight:700">${escapeHtml(r.v)}</td>
              <td style="padding:6px">${escapeHtml(r.r)}</td>
              <td style="padding:6px">${r.f}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="margin-top:50px;border-top:1px solid #000;width:260px;text-align:center;font-size:12px;padding-top:4px">
        Bacteriólogo(a) Certificador(a)<br><b>${escapeHtml(l.bacteriologo || 'Laboratorio')}</b>
      </div>
    `;
  } else if (tipo === 'factura') {
    const f = (state.invoices || []).find(x => x.id === id);
    if (!f) return;
    docTitle = 'Recibo de Caja y Factura';
    bodyHtml = `
      <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:16px">
        <h2 style="margin:0;font-size:20px;text-transform:uppercase">SaludDigital Clínica Privada S.A.S.</h2>
        <div style="font-size:12px;color:#555">NIT: 901.442.819-3 · Factura Electrónica de Venta</div>
        <h3 style="margin-top:12px;font-size:16px;color:#1e3a8a">RECIBO DE CAJA Y LIQUIDACIÓN ${f.fac}</h3>
      </div>
      <table style="width:100%;margin-bottom:16px;font-size:13px;border-collapse:collapse">
        <tr><td><b>Paciente:</b> ${escapeHtml(f.pacNombre)}</td><td><b>Documento:</b> ${f.doc}</td></tr>
        <tr><td><b>Aseguradora:</b> ${escapeHtml(f.eps)}</td><td><b>Fecha:</b> ${f.fecha}</td></tr>
        <tr><td><b>Servicio:</b> ${escapeHtml(f.serv)}</td><td><b>Estado:</b> ${f.est}</td></tr>
      </table>
      <div style="background:#f5f5f5;padding:14px;border-radius:6px;margin-bottom:20px;font-size:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Valor Total:</span> <b>${formatMoney(f.valorTotal)}</b></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span>Cubierto por Aseguradora (EPS):</span> <span>${formatMoney(f.cubiertoEps)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:#1e3a8a;border-top:1px solid #ccc;padding-top:6px"><span>Copago Paciente a Cancelar:</span> <span>${formatMoney(f.copagoPaciente)}</span></div>
      </div>
    `;
  }

  const printWin = window.open('', '_blank', 'width=800,height=700');
  if (printWin) {
    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${docTitle}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 30px; color: #111; line-height: 1.5; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${bodyHtml}
        <script>window.onload = function() { window.print(); };</script>
      </body>
      </html>
    `);
    printWin.document.close();
  }
}

// Otros modales existentes (Evolución, Diagnósticos, Signos, Laboratorio, Dispensar, BreakGlass)
function openModalEvolucion(pacId) {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Nueva Nota de Evolución Clínica</h2>
    <form onsubmit="event.preventDefault(); guardarEvolucion('${pacId}')">
      <div class="form-group">
        <label class="form-label">Tipo de Nota</label>
        <select id="evo-tipo" class="form-select">
          <option>Consulta Médica</option>
          <option>Nota de evolución</option>
          <option>Control ambulatorio</option>
          <option>Interconsulta / Valoración</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción Clínica</label>
        <textarea id="evo-nota" class="form-textarea" rows="5" placeholder="Subjetivo, Objetivo, Evaluación y Plan..." required></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar Nota</button>
      </div>
    </form>
  `);
}

async function guardarEvolucion(pacId) {
  const nota = document.getElementById('evo-nota').value;
  const tipo = document.getElementById('evo-tipo').value;
  try {
    await api.post(`/patients/${pacId}/evolution`, { nota, tipo });
    closeModal();
    toast('Nota clínica registrada');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalDiagnostico(pacId) {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Agregar Diagnóstico CIE-10</h2>
    <form onsubmit="event.preventDefault(); guardarDiagnostico('${pacId}')">
      <div class="form-group">
        <label class="form-label">Diagnóstico Clínico</label>
        <input id="dx-input" class="form-input" placeholder="Ej: Hipertensión arterial esencial (I10)" required>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Agregar</button>
      </div>
    </form>
  `);
}

async function guardarDiagnostico(pacId) {
  const dx = document.getElementById('dx-input').value;
  try {
    await api.post(`/patients/${pacId}/diagnoses`, { diagnostico: dx });
    closeModal();
    toast('Diagnóstico agregado');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function eliminarDiagnostico(pacId, idx) {
  if (!confirm('¿Desea retirar este diagnóstico de la historia clínica activa?')) return;
  try {
    await api.del(`/patients/${pacId}/diagnoses/${idx}`);
    toast('Diagnóstico retirado');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalSignos(pacId) {
  const p = state.patientData?.patient || {};
  const s = p.signos || {};
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Toma de Signos Vitales</h2>
    <form onsubmit="event.preventDefault(); guardarSignos('${pacId}')">
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Presión Arterial (mmHg)</label>
          <input id="sv-pa" class="form-input" value="${escapeHtml(s.presion || '120/80')}" required>
        </div>
        <div class="form-group">
          <label class="form-label">Frecuencia Cardíaca (lpm)</label>
          <input id="sv-fc" type="number" class="form-input" value="${parseInt(s.fc) || 72}" required>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Frecuencia Respiratoria (rpm)</label>
          <input id="sv-fr" type="number" class="form-input" value="${parseInt(s.fr) || 16}">
        </div>
        <div class="form-group">
          <label class="form-label">Temperatura (°C)</label>
          <input id="sv-temp" type="number" step="0.1" class="form-input" value="${parseFloat(s.temp) || 36.5}">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Peso (kg)</label>
          <input id="sv-peso" type="number" step="0.1" class="form-input" value="${parseFloat(s.peso) || 70}">
        </div>
        <div class="form-group">
          <label class="form-label">Talla (m)</label>
          <input id="sv-talla" type="number" step="0.01" class="form-input" value="${parseFloat(s.talla) || 1.70}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Saturación de Oxígeno (%)</label>
        <input id="sv-sat" type="number" class="form-input" value="${parseInt(s.satO2) || 98}">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Signos</button>
      </div>
    </form>
  `);
}

async function guardarSignos(pacId) {
  const presion = document.getElementById('sv-pa').value;
  const fc = document.getElementById('sv-fc').value;
  const fr = document.getElementById('sv-fr').value;
  const temp = document.getElementById('sv-temp').value;
  const peso = document.getElementById('sv-peso').value;
  const talla = document.getElementById('sv-talla').value;
  const satO2 = document.getElementById('sv-sat').value;

  try {
    await api.patch(`/patients/${pacId}/vitals`, { presion, fc, fr, temp, peso, talla, satO2 });
    closeModal();
    toast('Signos vitales actualizados');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalBreakGlass(pacId) {
  openModal(`
    <div style="padding:10px;background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:var(--radius-sm);margin-bottom:14px">
      <b style="color:var(--danger)">⚠️ Acceso de Emergencia (Break-Glass)</b>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
        Otorga acceso temporal de 30 minutos a la historia clínica de un paciente no asignado. Este evento queda grabado con su usuario y hora en la bitácora inmutable de auditoría.
      </div>
    </div>
    <form onsubmit="event.preventDefault(); activarBreakGlass('${pacId}')">
      <div class="form-group">
        <label class="form-label">Motivo Clínico de Urgencia *</label>
        <textarea id="bg-motivo" class="form-textarea" rows="3" placeholder="Ej.: Paciente ingresa por triage de urgencias con dificultad respiratoria aguda..." required></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-danger">Activar Acceso de Emergencia</button>
      </div>
    </form>
  `);
}

async function activarBreakGlass(pacId) {
  const motivo = document.getElementById('bg-motivo').value;
  try {
    await api.post(`/patients/${pacId}/emergency-break-glass`, { motivo });
    closeModal();
    toast('Acceso de emergencia activado por 30 minutos');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalOrdenLab(pacId) {
  const catalog = [
    "Hemograma completo y plaquetas",
    "Glicemia en ayunas",
    "Perfil lipídico completo",
    "Creatinina y Tasa de Filtración Glomerular",
    "Uroanálisis microscópico",
    "Hormona Estimulante de Tiroides (TSH)"
  ];
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Solicitar Orden de Laboratorio (LIS)</h2>
    <form onsubmit="event.preventDefault(); guardarOrdenLab('${pacId}')">
      <div class="form-group">
        <label class="form-label">Prueba de Laboratorio</label>
        <select id="ol-examen" class="form-select">
          ${catalog.map(ex => `<option value="${ex}">${ex}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Observaciones Clínicas para el Laboratorio</label>
        <input id="ol-obs" class="form-input" placeholder="Ej: Control de glicemia y perfil lipídico">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Generar Orden LIS</button>
      </div>
    </form>
  `);
}

async function guardarOrdenLab(pacId) {
  const examen = document.getElementById('ol-examen').value;
  const observaciones = document.getElementById('ol-obs').value;
  try {
    await api.post('/lab/order', { pacId, examen, observaciones });
    closeModal();
    toast('Orden de laboratorio creada');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalReceta(pacId) {
  const meds = [
    { n: "Loratadina", pres: "Caja x 10 tabletas 10 mg", dosis: "1 tableta al día", frec: "Cada 24 horas", dur: "10 días" },
    { n: "Salbutamol Inhalador", pres: "Inhalador 200 dosis (100 mcg/dosis)", dosis: "2 inhalaciones", frec: "Cada 6 horas SOS", dur: "30 días" },
    { n: "Amoxicilina", pres: "Caja x 21 cápsulas 500 mg", dosis: "1 cápsula", frec: "Cada 8 horas", dur: "7 días" },
    { n: "Losartán", pres: "Caja x 30 tabletas 50 mg", dosis: "1 tableta", frec: "Cada 12 horas", dur: "30 días" },
    { n: "Atorvastatina", pres: "Caja x 30 tabletas 20 mg", dosis: "1 tableta", frec: "Cada 24 horas (noche)", dur: "30 días" },
    { n: "Omeprazol", pres: "Caja x 28 cápsulas 20 mg", dosis: "1 cápsula en ayunas", frec: "Cada 24 horas", dur: "28 días" },
    { n: "Ibuprofeno", pres: "Caja x 20 tabletas 400 mg", dosis: "1 tableta", frec: "Cada 8 horas", dur: "3 días" }
  ];

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Nueva Prescripción Médica Electrónica</h2>
    <form onsubmit="event.preventDefault(); guardarReceta('${pacId}')">
      <div class="form-group">
        <label class="form-label">Medicamento</label>
        <select id="rx-med" class="form-select" onchange="actualizarCamposReceta(this.value)">
          ${meds.map(m => `<option value="${m.n}" data-dosis="${m.dosis}" data-frec="${m.frec}" data-dur="${m.dur}">${m.n} · ${m.pres}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Dosis</label>
          <input id="rx-dosis" class="form-input" value="1 tableta al día" required>
        </div>
        <div class="form-group">
          <label class="form-label">Frecuencia</label>
          <input id="rx-frec" class="form-input" value="Cada 24 horas" required>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Duración del Tratamiento</label>
        <input id="rx-dur" class="form-input" value="10 días" required>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Emitir Prescripción</button>
      </div>
    </form>
  `);
}

function actualizarCamposReceta(val) {
  const sel = document.getElementById('rx-med');
  if (!sel) return;
  const opt = sel.selectedOptions[0];
  document.getElementById('rx-dosis').value = opt.getAttribute('data-dosis') || '';
  document.getElementById('rx-frec').value = opt.getAttribute('data-frec') || '';
  document.getElementById('rx-dur').value = opt.getAttribute('data-dur') || '';
}

async function guardarReceta(pacId) {
  const medicamento = document.getElementById('rx-med').value;
  const dosis = document.getElementById('rx-dosis').value;
  const frecuencia = document.getElementById('rx-frec').value;
  const duracion = document.getElementById('rx-dur').value;
  try {
    const res = await api.post('/pharmacy/prescribe', { pacId, medicamento, dosis, frecuencia, duracion });
    closeModal();
    if (res.allergyWarning) {
      alert(`⚠️ ALERTA DE SEGURIDAD CLÍNICA:\n${res.allergyWarning}`);
    }
    toast('Prescripción emitida a Farmacia');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalEditarLab(orderId) {
  const order = state.labOrders.find(l => l.id === orderId);
  if (!order) return;

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Captura de Resultados: ${escapeHtml(order.ex)}</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Paciente: <b>${escapeHtml(order.pacNombre)}</b></p>
    <form onsubmit="event.preventDefault(); guardarResultadosLab('${order.id}')">
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
        ${order.res.map((r, i) => `
          <div class="grid grid-2" style="align-items:center;padding:10px;background:var(--border-subtle);border-radius:6px">
            <div>
              <b>${escapeHtml(r.p)}</b>
              <div style="font-size:11px;color:var(--text-muted)">Referencia: ${escapeHtml(r.r)}</div>
            </div>
            <div>
              <input id="lab-val-${i}" class="form-input" value="${escapeHtml(r.v || '')}" placeholder="Valor medido" required>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="form-group">
        <label class="form-label">Observaciones Técnicas del Bacteriólogo</label>
        <input id="lab-obs" class="form-input" value="${escapeHtml(order.observaciones || '')}">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="button" class="btn btn-secondary" onclick="guardarResultadosLab('${order.id}', false)">Guardar Borrador</button>
        <button type="submit" class="btn btn-primary">Certificar y Publicar</button>
      </div>
    </form>
  `);
}

async function guardarResultadosLab(orderId, publicar = true) {
  const order = state.labOrders.find(l => l.id === orderId);
  if (!order) return;
  const newRes = order.res.map((r, i) => {
    const el = document.getElementById(`lab-val-${i}`);
    return { ...r, v: el ? el.value.trim() : r.v };
  });
  const obs = document.getElementById('lab-obs')?.value || '';

  try {
    await api.put(`/lab/${orderId}/results`, { res: newRes, observaciones: obs, estado: publicar ? 'En proceso' : 'En proceso' });
    if (publicar) {
      await api.post(`/lab/${orderId}/publish`, {});
      toast('Resultados certificados y publicados en la HCE');
    } else {
      toast('Borrador guardado');
    }
    closeModal();
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalDispensar(rxId) {
  const rx = state.pharmacyOrders.find(f => f.id === rxId);
  if (!rx) return;
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Registro de Dispensación Farmacéutica</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Paciente: <b>${escapeHtml(rx.pacNombre)}</b> · ${escapeHtml(rx.med)}</p>
    <form onsubmit="event.preventDefault(); confirmarDispensacion('${rx.id}')">
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Nombre de Quien Recibe *</label>
          <input id="disp-recibe" class="form-input" placeholder="Nombre completo" required>
        </div>
        <div class="form-group">
          <label class="form-label">Cédula / Documento *</label>
          <input id="disp-doc" class="form-input" placeholder="Número de documento" required>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Parentesco</label>
          <select id="disp-rel" class="form-select">
            <option>Mismo paciente</option>
            <option>Familiar / Acompañante</option>
            <option>Tutor legal</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Cantidad a Entregar</label>
          <input id="disp-cant" type="number" class="form-input" value="30" required min="1">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar Dispensación</button>
      </div>
    </form>
  `);
}

async function confirmarDispensacion(rxId) {
  const recibeNombre = document.getElementById('disp-recibe')?.value;
  const recibeDoc = document.getElementById('disp-doc')?.value;
  const parentesco = document.getElementById('disp-rel')?.value;
  const cantEntregada = parseInt(document.getElementById('disp-cant')?.value, 10);

  try {
    await api.post(`/pharmacy/${rxId}/dispense`, {
      tipoEntrega: 'Completo',
      cantEntregada,
      recibeNombre,
      recibeDoc,
      parentesco
    });
    closeModal();
    toast('Medicamento dispensado e inventario descontado');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function reabastecerStock(medId) {
  const cant = prompt('Ingrese cantidad a sumar al stock:', '50');
  if (!cant || isNaN(parseInt(cant, 10))) return;
  try {
    await api.patch(`/pharmacy/inventory/${medId}/stock`, { cantidad: parseInt(cant, 10) });
    toast('Stock reabastecido');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function confirmarFactura(facId) {
  try {
    await api.patch(`/billing/${facId}/confirm`, {});
    toast('Servicio confirmado para liquidación');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function registrarPagoFactura(facId) {
  try {
    await api.post(`/billing/${facId}/pay`, { metodoPago: 'Tarjeta débito' });
    toast('Pago registrado y liquidado');
    await loadModuleData();
    render();
  } catch (e) {}
}

async function descargarFhir(pacId) {
  try {
    const bundle = await api.get(`/fhir/Patient/${pacId}/everything`);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/fhir+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FHIR_R4_Patient_${pacId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Bundle FHIR R4 descargado');
  } catch (e) {}
}

function openModalReasignarDoc(pacId, currMed) {
  const doctors = [
    { n: "Dr. Andrés Martínez", esp: "Medicina general" },
    { n: "Dra. Laura Gómez", esp: "Ginecología" },
    { n: "Dr. Julián Restrepo", esp: "Neumología" }
  ];
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Reasignar Médico Tratante</h2>
    <form onsubmit="event.preventDefault(); guardarReasignacionDoc('${pacId}')">
      <div class="form-group">
        <label class="form-label">Médico Tratante</label>
        <select id="rd-med" class="form-select">
          ${doctors.map(d => `<option value="${d.n}" ${d.n === currMed ? 'selected' : ''}>${d.n} (${d.esp})</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Reasignación</button>
      </div>
    </form>
  `);
}

async function guardarReasignacionDoc(pacId) {
  const medico = document.getElementById('rd-med')?.value;
  try {
    await api.patch(`/patients/${pacId}/doctor`, { medico });
    closeModal();
    toast('Médico tratante reasignado');
    await loadModuleData();
    render();
  } catch (e) {}
}

// Initial Render Controller
function render() {
  const root = document.getElementById('root');
  if (!root) return;

  if (!state.user) {
    root.innerHTML = viewLogin();
    return;
  }

  let contentHtml = '';
  switch (state.module) {
    case 'inicio': contentHtml = viewInicio(); break;
    case 'agenda': contentHtml = viewAgenda(); break;
    case 'remisiones': contentHtml = viewRemisiones(); break;
    case 'pacientes': contentHtml = viewPacientes(); break;
    case 'historia': contentHtml = viewHistoria(); break;
    case 'laboratorio': contentHtml = viewLaboratorio(); break;
    case 'farmacia': contentHtml = viewFarmacia(); break;
    case 'facturacion': contentHtml = viewFacturacion(); break;
    case 'usuarios': contentHtml = viewUsuarios(); break;
    case 'reportes': contentHtml = viewReportes(); break;
    case 'auditoria': contentHtml = viewAuditoria(); break;
    default: contentHtml = viewInicio(); break;
  }

  root.innerHTML = renderShell(contentHtml);

  // If in FHIR tab, populate JSON view
  if (state.module === 'historia' && state.ehrTab === 'fhir' && state.selectedPatientId) {
    const fhirBox = document.getElementById('fhir-json-view');
    if (fhirBox) {
      api.get(`/fhir/Patient/${state.selectedPatientId}/everything`)
        .then(data => {
          fhirBox.textContent = JSON.stringify(data, null, 2);
        })
        .catch(err => {
          fhirBox.textContent = 'Error cargando recurso FHIR: ' + err.message;
        });
    }
  }
}

// App Bootstrap
async function initApp() {
  if (state.token) {
    try {
      const me = await api.req('/auth/me', { silent: true });
      state.user = me.user;
      localStorage.setItem('sd_user', JSON.stringify(me.user));
    } catch (e) {
      clearSessionState();
    }
  }
  await loadInitialData();
  render();
}

window.addEventListener('DOMContentLoaded', initApp);
