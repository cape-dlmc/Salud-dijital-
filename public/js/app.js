/**
 * SaludDigital Healthcare Platform (TOGAF 5 Layers & HL7 FHIR R4)
 * Modern Enterprise Frontend Application
 */

const API_BASE = '/api';

// Application State
const state = {
  user: null,
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
  labOrders: [],
  medsCatalog: [],
  pharmacyOrders: [],
  invoices: [],
  kpisData: null,
  auditLogs: []
};

// Apply initial theme
document.documentElement.setAttribute('data-theme', state.theme);

// API Client Helper
const api = {
  async req(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(state.user ? { 'x-user-id': state.user.id } : {}),
      ...(options.headers || {})
    };
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error en la solicitud al servidor');
      }
      return data;
    } catch (err) {
      toast(err.message, 'error');
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
    p.nombre.toLowerCase().includes(query) ||
    p.doc.toLowerCase().includes(query) ||
    p.id.toLowerCase().includes(query)
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted)">No se encontraron pacientes coincidentes.</div>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 6).map(p => `
    <div class="palette-item" onclick="closePalette(); selectPatient('${p.id}')">
      <div>
        <div style="font-weight:700">${escapeHtml(p.nombre)}</div>
        <div style="font-size:12px;color:var(--text-muted)">${p.id} · ${p.tipoDoc || 'CC'} ${p.doc} · ${p.eps}</div>
      </div>
      <button class="btn btn-secondary btn-sm">Abrir</button>
    </div>
  `).join('');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openPalette();
  }
  if (e.key === 'Escape') {
    closeModal();
    closePalette();
  }
});

// Authentication Handlers
async function login(user, pw) {
  try {
    const res = await api.post('/auth/login', { user, pw });
    state.user = res.user;
    localStorage.setItem('sd_user', JSON.stringify(res.user));
    state.module = state.user.modulos[0] || 'inicio';
    toast(`Bienvenido, ${state.user.nombre}`);
    await loadInitialData();
    render();
  } catch (err) {
    // Error is handled in api.req
  }
}

function logout() {
  state.user = null;
  state.patientData = null;
  state.selectedPatientId = null;
  localStorage.removeItem('sd_user');
  render();
  toast('Sesión cerrada correctamente');
}

// Load Data From API
async function loadInitialData() {
  try {
    const demoRes = await api.get('/auth/demo-accounts');
    state.demoAccounts = demoRes.users;
    state.rolesConfig = demoRes.roles;

    if (state.user) {
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
    state.patientsList = pts.patients;
    state.appointmentsList = apts.appointments;

    if (state.module === 'historia' && state.selectedPatientId) {
      state.patientData = await api.get(`/patients/${state.selectedPatientId}`);
    }
    if (state.module === 'laboratorio') {
      const labRes = await api.get('/lab');
      state.labOrders = labRes.orders;
    }
    if (state.module === 'farmacia') {
      const farmRes = await api.get('/pharmacy');
      state.pharmacyOrders = farmRes.orders;
      state.medsCatalog = farmRes.catalog;
    }
    if (state.module === 'facturacion') {
      const factRes = await api.get('/billing');
      state.invoices = factRes.invoices;
    }
    if (state.module === 'reportes') {
      state.kpisData = await api.get('/kpis');
    }
    if (state.module === 'auditoria') {
      const audRes = await api.get('/audit');
      state.auditLogs = audRes.logs;
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
    agenda: ['Agenda de Citas', '📅'],
    pacientes: ['Directorio Pacientes', '👥'],
    historia: ['Historia Clínica (HCE)', '📋'],
    laboratorio: ['Laboratorio (LIS)', '🧪'],
    farmacia: ['Farmacia Hospitalaria', '💊'],
    facturacion: ['Facturación y Cartera', '🧾'],
    reportes: ['Dashboard TOGAF / BI', '📊'],
    usuarios: ['Accesos y Personal', '🔑'],
    auditoria: ['Auditoría Ley 1581', '🛡️'],
    'portal-paciente': ['Mi SaludDigital', '📱']
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
          <div class="user-profile-widget">
            <div class="user-avatar">${escapeHtml(u.ini || 'US')}</div>
            <div class="user-details">
              <div class="user-name">${escapeHtml(u.nombre)}</div>
              <div class="user-role-label">${escapeHtml(u.cargo)}</div>
            </div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" style="flex:1" onclick="toggleTheme()" title="Cambiar Tema">
              ${state.theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro'}
            </button>
            <button class="btn btn-secondary btn-sm" style="flex:1" onclick="logout()" title="Cerrar Sesión">
              Salir
            </button>
          </div>
        </div>
      </aside>

      <!-- Main Column -->
      <div style="min-width:0;display:flex;flex-direction:column">
        <header class="topbar no-print">
          <div class="topbar-left">
            <button class="quick-search-btn" onclick="openPalette()">
              <svg style="width:16px;height:16px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>Buscar paciente o registro...</span>
              <span class="kbd-shortcut">Ctrl K</span>
            </button>
          </div>
          <div class="topbar-right">
            <span class="badge badge-neutral" style="font-size:12px">
              ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <button class="btn btn-secondary btn-sm" onclick="window.print()">
              🖨️ Imprimir / PDF
            </button>
          </div>
        </header>

        <main class="main-content">
          <div class="print-header" style="display:none">
            <h2>SaludDigital Clínica Privada</h2>
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
    <button class="card-glass" style="text-align:left;cursor:pointer;padding:12px;border-radius:10px"
      onclick="document.getElementById('login-user').value='${acc.user}';document.getElementById('login-pw').value='${acc.pw}';login('${acc.user}','${acc.pw}')">
      <div style="font-weight:700;font-size:13.5px">${escapeHtml(acc.nombre)}</div>
      <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">${escapeHtml(acc.user)} · ${escapeHtml(acc.cargo)}</div>
    </button>
  `).join('');

  return `
    <div style="min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:stretch">
      <!-- Left Hero Banner -->
      <div style="background:linear-gradient(135deg,rgba(15,23,42,0.95),rgba(30,58,138,0.7)),url('data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 800 600\\'><circle cx=\\'400\\' cy=\\'300\\' r=\\'300\\' fill=\\'none\\' stroke=\\'white\\' stroke-opacity=\\'0.04\\' stroke-width=\\'2\\'/></svg>');background-size:cover;padding:60px;display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div class="brand-header" style="border:none;padding:0;margin-bottom:40px">
            <div class="brand-icon">+</div>
            <div class="brand-name">
              <span>SaludDigital</span>
              <span class="brand-tagline">Arquitectura Empresarial TOGAF & FHIR R4</span>
            </div>
          </div>

          <h1 style="font-size:46px;font-weight:800;letter-spacing:-1px;line-height:1.15;max-width:520px;margin-bottom:20px">
            Integración digital <span style="background:var(--brand-gradient);-webkit-background-clip:text;color:transparent">sin fricciones</span> para clínicas modernas
          </h1>
          <p style="font-size:16px;color:var(--text-muted);max-width:480px;line-height:1.6">
            Ecosistema hospitalario integral: Historia Clínica Electrónica centralizada, LIS de laboratorio, farmacia con control de dispensación y facturación automática en una arquitectura de cero redundancia.
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
            Estándares: HL7 FHIR R4 · Ley 1581 Habeas Data · Modelo de 5 Capas TOGAF
          </div>
        </div>
      </div>

      <!-- Right Login Form -->
      <div style="display:flex;align-items:center;justify-content:center;padding:40px;background:var(--bg-main)">
        <div class="card-glass" style="width:100%;max-width:460px;padding:36px">
          <h2 style="font-size:24px;font-weight:800;margin-bottom:6px">Iniciar Sesión</h2>
          <p style="font-size:14px;color:var(--text-muted);margin-bottom:24px">Acceda con sus credenciales institucionales o seleccione una cuenta demo.</p>

          <form onsubmit="event.preventDefault(); login(document.getElementById('login-user').value, document.getElementById('login-pw').value)">
            <div class="form-group">
              <label class="form-label" for="login-user">Usuario institucional</label>
              <input id="login-user" class="form-input" placeholder="ej.: dr.martinez" required autocomplete="username">
            </div>
            <div class="form-group">
              <label class="form-label" for="login-pw">Contraseña</label>
              <input id="login-pw" type="password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%;padding:13px;font-size:15px;margin-top:8px">
              Ingresar al Sistema
            </button>
          </form>

          <div style="margin-top:28px;padding-top:20px;border-top:1px solid var(--border-subtle)">
            <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px">
              Cuentas de Demostración (Click para autollenar e ingresar)
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
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

  return `
    <div class="hero-card">
      <div>
        <h1 class="page-title">Bienvenido, <span style="background:var(--brand-gradient);-webkit-background-clip:text;color:transparent">${escapeHtml(u.nombre)}</span></h1>
        <p class="page-subtitle" style="font-size:15px;max-width:600px;margin-top:6px">
          ${escapeHtml(u.cargo)} · Acceso según principio de mínimo privilegio (TOGAF).
        </p>
      </div>
      <div style="display:flex;gap:10px">
        ${u.rol === 'admin' ? `<button class="btn btn-primary" onclick="openModalCita()">+ Nueva Cita</button>` : ''}
        ${u.rol === 'medico' ? `<button class="btn btn-primary" onclick="navigateTo('agenda')">Ver Mi Agenda</button>` : ''}
      </div>
    </div>

    <!-- Quick Metrics Grid -->
    <div class="grid grid-4" style="margin-bottom:24px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Citas Programadas Hoy</div>
        <div class="kpi-value">${citasHoy.length}</div>
        <div class="kpi-meta">📅 100% integradas a la HCE</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pacientes en Seguimiento</div>
        <div class="kpi-value">${state.patientsList.length}</div>
        <div class="kpi-meta">👥 Identificador único clínico</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Órdenes de Laboratorio LIS</div>
        <div class="kpi-value">${state.labOrders.length}</div>
        <div class="kpi-meta">🧪 Interoperabilidad inmediata</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Recetas e-Prescribing</div>
        <div class="kpi-value">${state.pharmacyOrders.length}</div>
        <div class="kpi-meta">💊 Control cerrado de fármacos</div>
      </div>
    </div>

    <!-- Main Overview Sections -->
    <div class="grid grid-2">
      <!-- Citas de hoy -->
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:16px;font-weight:700">Agenda Activa de Consultas</h3>
          <button class="btn btn-secondary btn-sm" onclick="navigateTo('agenda')">Ver todas</button>
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
              ${citasHoy.slice(0, 5).map(c => `
                <tr>
                  <td><b>${escapeHtml(c.hora)}</b></td>
                  <td>${escapeHtml(c.pacNombre)}</td>
                  <td>${escapeHtml(c.med)}</td>
                  <td><span class="badge ${c.est === 'Atendida' ? 'badge-info' : c.est === 'Confirmada' ? 'badge-success' : 'badge-warning'}">${escapeHtml(c.est)}</span></td>
                </tr>
              `).join('') || `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--text-muted)">No hay citas programadas para hoy.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Acciones Rápidas y Flujo TOGAF -->
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Flujo Integrado de Información</h3>
        <p style="font-size:13.5px;color:var(--text-muted);margin-bottom:18px">
          En SaludDigital, cada acción desencadena automáticamente el proceso subsiguiente evitando recapturas manuales:
        </p>

        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <span style="font-size:20px">1️⃣</span>
            <div>
              <div style="font-weight:700;font-size:13.5px">Agendamiento & Admisión</div>
              <div style="font-size:12px;color:var(--text-muted)">Cita creada desde App o Recepción con verificación de EPS y consentimiento Ley 1581.</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <span style="font-size:20px">2️⃣</span>
            <div>
              <div style="font-weight:700;font-size:13.5px">Atención Médica en HCE Central</div>
              <div style="font-size:12px;color:var(--text-muted)">Registro de signos vitales, diagnósticos CIE-10, órdenes directas a LIS y Farmacia.</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;align-items:flex-start;padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
            <span style="font-size:20px">3️⃣</span>
            <div>
              <div style="font-weight:700;font-size:13.5px">Liquidación & Facturación Automática</div>
              <div style="font-size:12px;color:var(--text-muted)">Al publicar resultados o entregar medicamentos, el cargo viaja en tiempo real a Facturación.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 4. Agenda View
function viewAgenda() {
  const isAdmin = state.user.rol === 'admin';
  const isMed = state.user.rol === 'medico';
  const list = isMed 
    ? state.appointmentsList.filter(a => a.med === state.user.nombre)
    : state.appointmentsList;

  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Agenda Médica y Citas</h1>
        <p class="page-subtitle">${isAdmin ? 'Gestión centralizada de turnos de la clínica' : 'Su programación de consultas asignadas'}</p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="openModalCita()">+ Agendar Nueva Cita</button>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Fecha & Hora</th>
            <th>Paciente</th>
            <th>Especialidad</th>
            <th>Médico Asignado</th>
            <th>Consultorio</th>
            <th>Canal</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(c => `
            <tr>
              <td><b>${escapeHtml(c.hora)}</b> <span style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.fecha)}</span></td>
              <td><b>${escapeHtml(c.pacNombre)}</b><div style="font-size:11px;color:var(--text-muted)">${c.pacId}</div></td>
              <td>${escapeHtml(c.esp)}</td>
              <td>${escapeHtml(c.med)}</td>
              <td>${escapeHtml(c.consultorio)}</td>
              <td><span class="badge badge-neutral">${escapeHtml(c.canal || 'Recepción')}</span></td>
              <td><span class="badge ${c.est === 'Atendida' ? 'badge-info' : c.est === 'Confirmada' ? 'badge-success' : 'badge-danger'}">${escapeHtml(c.est)}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  ${c.est !== 'Atendida' ? `
                    <button class="btn btn-secondary btn-sm" onclick="cambiarEstadoCita('${c.id}', 'Atendida')">Atender</button>
                  ` : ''}
                  ${c.est !== 'Cancelada' && c.est !== 'Atendida' ? `
                    <button class="btn btn-secondary btn-sm" style="color:var(--danger)" onclick="cambiarEstadoCita('${c.id}', 'Cancelada')">Cancelar</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">No hay citas en este filtro.</td></tr>`}
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
        <p class="page-subtitle">Registro maestro clínico (MPI) con consentimiento informado de Habeas Data (Ley 1581 de 2012)</p>
      </div>
      <div>
        <button class="btn btn-primary" onclick="openModalNuevoPaciente()">+ Nuevo Paciente</button>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>ID Clínico</th>
            <th>Nombre Completo</th>
            <th>Documento</th>
            <th>Edad / Sexo</th>
            <th>Aseguradora (EPS)</th>
            <th>Médico de Cabecera</th>
            <th>Habeas Data</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.patientsList.map(p => `
            <tr>
              <td><code>${p.id}</code></td>
              <td><b>${escapeHtml(p.nombre)}</b></td>
              <td>${p.tipoDoc || 'CC'} ${p.doc}</td>
              <td>${p.edad} años · ${p.sexo}</td>
              <td><span class="badge badge-neutral">${escapeHtml(p.eps)}</span></td>
              <td>${escapeHtml(p.medico)}</td>
              <td>
                <span class="badge ${p.consentimientoHabeasData ? 'badge-success' : 'badge-danger'}">
                  ${p.consentimientoHabeasData ? '✓ Consentido' : 'Pendiente'}
                </span>
              </td>
              <td>
                <button class="btn btn-primary btn-sm" onclick="selectPatient('${p.id}')">
                  Abrir Historia
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 6. Historia Clínica Electrónica (HCE) View
function viewHistoria() {
  if (!state.selectedPatientId || !state.patientData) {
    return `
      <div class="page-header">
        <h1 class="page-title">Historia Clínica Electrónica (HCE)</h1>
      </div>
      <div class="card-glass" style="text-align:center;padding:50px">
        <p style="font-size:16px;color:var(--text-muted);margin-bottom:18px">Seleccione un paciente del directorio o use el buscador rápido para cargar el expediente clínico.</p>
        <button class="btn btn-primary" onclick="openPalette()">Buscar Paciente (Ctrl + K)</button>
      </div>
    `;
  }

  const p = state.patientData.patient;
  const isMine = p.medico === state.user.nombre;
  const tabs = [
    ['resumen', 'Resumen Clínico'],
    ['evolucion', 'Evolución & Notas (SOEP)'],
    ['laboratorio', 'Laboratorio (LIS)'],
    ['recetas', 'Fórmulas y Recetas'],
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
            ${p.nombre.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style="display:flex;gap:10px;align-items:center">
              <h2 style="font-size:22px;font-weight:800">${escapeHtml(p.nombre)}</h2>
              <span class="badge badge-info">${p.id}</span>
              <span class="badge ${p.estado === 'Activo' ? 'badge-success' : 'badge-warning'}">${p.estado}</span>
            </div>
            <div style="font-size:13.5px;color:var(--text-muted);margin-top:3px">
              ${p.tipoDoc || 'CC'} ${p.doc} · ${p.edad} años · ${p.sexo} · ${p.eps} (${p.regimen}) · Tel: ${p.tel}
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
              <div style="font-size:20px;font-weight:800">${p.signos.presion || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">Frecuencia Cardíaca</div>
              <div style="font-size:20px;font-weight:800">${p.signos.fc || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">Temperatura</div>
              <div style="font-size:20px;font-weight:800">${p.signos.temp || '—'}</div>
            </div>
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div class="kpi-label">IMC / Peso</div>
              <div style="font-size:20px;font-weight:800">${p.signos.imc || p.signos.peso || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (state.ehrTab === 'evolucion') {
    return `
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <h3 style="font-size:16px;font-weight:700">Notas de Evolución Médica (Formato SOEP)</h3>
          <button class="btn btn-primary btn-sm" onclick="openModalEvolucion('${p.id}')">+ Nueva Nota</button>
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
                <span class="badge ${l.est === 'Publicado' ? 'badge-success' : 'badge-warning'}">${l.est}</span>
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
                <th>Entrega</th>
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
                  <td>${f.entrega ? `<span style="font-size:12px">Recibió: ${escapeHtml(f.entrega.recibe)} (${f.entrega.rel})</span>` : 'Pendiente'}</td>
                </tr>
              `).join('') || `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted)">No hay prescripciones activas.</td></tr>`}
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

// 7. Laboratorio LIS View
function viewLaboratorio() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sistema de Información de Laboratorio (LIS)</h1>
        <p class="page-subtitle">Recepción de muestras, carga de parámetros y publicación automatizada a la HCE y facturación</p>
      </div>
    </div>

    <div class="grid grid-4" style="margin-bottom:20px">
      <div class="card-glass kpi-card">
        <div class="kpi-label">Pendientes por Procesar</div>
        <div class="kpi-value">${state.labOrders.filter(l => l.est === 'Pendiente').length}</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">En Análisis Técnico</div>
        <div class="kpi-value">${state.labOrders.filter(l => l.est === 'En proceso').length}</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Publicados al Médico</div>
        <div class="kpi-value">${state.labOrders.filter(l => l.est === 'Publicado').length}</div>
      </div>
      <div class="card-glass kpi-card">
        <div class="kpi-label">Tiempo Promedio</div>
        <div class="kpi-value">38 min</div>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>ID Orden</th>
            <th>Paciente</th>
            <th>Examen Solicitado</th>
            <th>Médico Remitente</th>
            <th>Fecha Solicitud</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.labOrders.map(l => `
            <tr>
              <td><code>${l.id}</code></td>
              <td><b>${escapeHtml(l.pacNombre)}</b><div style="font-size:11px;color:var(--text-muted)">${l.pacId}</div></td>
              <td><b>${escapeHtml(l.ex)}</b><div style="font-size:11px;color:var(--text-muted)">CUPS: ${l.cups}</div></td>
              <td>${escapeHtml(l.med)}</td>
              <td>${escapeHtml(l.fechaSolicitud)}</td>
              <td><span class="badge ${l.est === 'Publicado' ? 'badge-success' : l.est === 'En proceso' ? 'badge-info' : 'badge-warning'}">${l.est}</span></td>
              <td>
                <button class="btn btn-primary btn-sm" onclick="openModalEditarLab('${l.id}')">
                  ${l.est === 'Publicado' ? 'Ver / Editar' : 'Cargar Resultados'}
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 8. Farmacia View
function viewFarmacia() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Farmacia Hospitalaria & Dispensación</h1>
        <p class="page-subtitle">Circuito cerrado de medicación: control de inventario con alertas de stock mínimo y entrega segura (5 Correctos)</p>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:20px">
      <!-- Recetas por dispensar -->
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Prescripciones Pendientes</h3>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Medicamento</th>
                <th>Dosis</th>
                <th>Estado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              ${state.pharmacyOrders.map(f => `
                <tr>
                  <td><b>${escapeHtml(f.pacNombre)}</b></td>
                  <td>${escapeHtml(f.med)}</td>
                  <td>${escapeHtml(f.dosis)}</td>
                  <td><span class="badge ${f.est === 'Dispensado' ? 'badge-success' : 'badge-warning'}">${f.est}</span></td>
                  <td>
                    ${f.est !== 'Dispensado' ? `
                      <button class="btn btn-primary btn-sm" onclick="openModalDispensar('${f.id}')">Dispensar</button>
                    ` : `<span style="font-size:12px;color:var(--text-muted)">✓ Entregado</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Control de Inventario -->
      <div class="card-glass">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <h3 style="font-size:16px;font-weight:700">Inventario Farmacéutico</h3>
        </div>
        <div class="table-responsive">
          <table>
            <thead>
              <tr>
                <th>Fármaco</th>
                <th>Stock</th>
                <th>Lote / Vence</th>
                <th>Precio</th>
                <th>Reorden</th>
              </tr>
            </thead>
            <tbody>
              ${state.medsCatalog.map(m => `
                <tr>
                  <td><b>${escapeHtml(m.n)}</b><div style="font-size:11px;color:var(--text-muted)">${escapeHtml(m.pres)}</div></td>
                  <td>
                    <span class="badge ${m.stock < m.min ? 'badge-danger' : 'badge-success'}">
                      ${m.stock} un.
                    </span>
                  </td>
                  <td><span style="font-size:12px">${m.lote} · ${m.vence}</span></td>
                  <td>${formatMoney(m.precio)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="reabastecerStock('${m.id}')">+ Stock</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// 9. Facturación View
function viewFacturacion() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Facturación y Cartera Hospitalaria</h1>
        <p class="page-subtitle">Liquidación de servicios médicos, laboratorio y farmacia. Cumplimiento de mínimo privilegio (sin datos clínicos).</p>
      </div>
    </div>

    <div class="table-responsive">
      <table>
        <thead>
          <tr>
            <th>Factura #</th>
            <th>Paciente</th>
            <th>Servicio Liquidado</th>
            <th>EPS / Aseguradora</th>
            <th>Valor Total</th>
            <th>Copago Paciente</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${state.invoices.map(i => `
            <tr>
              <td><code>${i.fac}</code></td>
              <td><b>${escapeHtml(i.pacNombre)}</b></td>
              <td>${escapeHtml(i.serv)}</td>
              <td>${escapeHtml(i.eps)}</td>
              <td><b>${formatMoney(i.valorTotal)}</b></td>
              <td>${formatMoney(i.copagoPaciente)}</td>
              <td><span class="badge ${i.est === 'Pagada' ? 'badge-success' : i.est === 'Por confirmar' ? 'badge-warning' : 'badge-danger'}">${i.est}</span></td>
              <td>
                <div style="display:flex;gap:6px">
                  ${i.est === 'Por confirmar' ? `
                    <button class="btn btn-primary btn-sm" onclick="confirmarFactura('${i.id}')">Confirmar</button>
                  ` : ''}
                  ${i.est !== 'Pagada' ? `
                    <button class="btn btn-success btn-sm" onclick="registrarPagoFactura('${i.id}')">Cobrar</button>
                  ` : `<span style="font-size:12px;color:var(--success)">✓ Liquidada</span>`}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// 10. Dashboard Gerencial TOGAF / BI View
function viewReportes() {
  const kpis = state.kpisData ? state.kpisData.kpis : [];
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard Estratégico (TOGAF Layer 1)</h1>
        <p class="page-subtitle">Indicadores Clave de Éxito (KPIs) aprobados para el proyecto de integración SaludDigital</p>
      </div>
    </div>

    <!-- 5 KPIs Cards -->
    <div class="grid grid-3" style="margin-bottom:24px">
      ${kpis.map(k => `
        <div class="card-glass kpi-card">
          <div class="kpi-label">${escapeHtml(k.nombre)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0">
            <div class="kpi-value">${escapeHtml(k.valorActual)}</div>
            <span class="badge ${k.cumplimiento >= 85 ? 'badge-success' : 'badge-warning'}">
              ${k.cumplimiento}% Meta
            </span>
          </div>
          <div class="kpi-meta">${escapeHtml(k.meta)}</div>
          <p style="font-size:12px;color:var(--text-subtle);margin-top:8px">${escapeHtml(k.descripcion)}</p>
        </div>
      `).join('')}
    </div>

    <!-- Analytical Distribution Charts -->
    <div class="grid grid-2">
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Rendimiento Semanal de Citas</h3>
        <div style="display:flex;align-items:flex-end;gap:16px;height:180px;padding-top:20px">
          ${[
            ['Lun', 78, 6],
            ['Mar', 84, 4],
            ['Mié', 82, 5],
            ['Jue', 90, 5],
            ['Vie', 88, 3]
          ].map(([dia, real, canc]) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end">
              <div style="width:100%;display:flex;gap:4px;align-items:flex-end;height:140px">
                <div style="flex:1;background:var(--primary);height:${real}%;border-radius:6px 6px 2px 2px" title="${real} Realizadas"></div>
                <div style="flex:1;background:var(--danger);height:${canc * 5}%;border-radius:6px 6px 2px 2px" title="${canc} Canceladas"></div>
              </div>
              <span style="font-size:12px;color:var(--text-muted);margin-top:8px">${dia}</span>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:16px;margin-top:16px;font-size:12px;color:var(--text-muted)">
          <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;background:var(--primary);border-radius:2px"></span> Realizadas</span>
          <span style="display:flex;align-items:center;gap:6px"><span style="width:12px;height:12px;background:var(--danger);border-radius:2px"></span> Canceladas</span>
        </div>
      </div>

      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:14px">Salud Financiera & Cartera</h3>
        <div style="display:flex;flex-direction:column;gap:14px;margin-top:20px">
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
              <span>Recaudado Pagado</span>
              <b>${formatMoney(121000)}</b>
            </div>
            <div style="height:10px;background:var(--border-subtle);border-radius:999px;overflow:hidden">
              <div style="width:70%;height:100%;background:var(--success)"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
              <span>Por Confirmar</span>
              <b>${formatMoney(78000)}</b>
            </div>
            <div style="height:10px;background:var(--border-subtle);border-radius:999px;overflow:hidden">
              <div style="width:25%;height:100%;background:var(--warning)"></div>
            </div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
              <span>Cartera Vencida</span>
              <b>${formatMoney(120000)}</b>
            </div>
            <div style="height:10px;background:var(--border-subtle);border-radius:999px;overflow:hidden">
              <div style="width:30%;height:100%;background:var(--danger)"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 11. Auditoría Ley 1581 View
function viewAuditoria() {
  return `
    <div class="page-header">
      <div>
        <h1 class="page-title">Auditoría & Trazabilidad (Ley 1581 de 2012)</h1>
        <p class="page-subtitle">Bitácora inmutable de accesos clínicos, inicio de sesiones y eventos de Acceso de Emergencia</p>
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

// 12. Portal del Paciente View
function viewPortalPaciente() {
  const pId = state.user.pacId || 'SD-10482';
  const p = state.patientsList.find(pt => pt.id === pId) || state.patientsList[0];
  const misCitas = state.appointmentsList.filter(a => a.pacId === p.id);
  const misLabs = state.labOrders.filter(l => l.pacId === p.id && l.est === 'Publicado');
  const misRx = state.pharmacyOrders.filter(f => f.pacId === p.id);

  return `
    <div class="hero-card" style="margin-bottom:24px">
      <div>
        <h1 class="page-title">Portal de Autogestión · Mi SaludDigital</h1>
        <p class="page-subtitle">Bienvenido, ${escapeHtml(p.nombre)} · Sus citas, resultados de laboratorio y recetas médicas seguras.</p>
      </div>
      <button class="btn btn-primary" onclick="openModalCita()">+ Solicitar Cita</button>
    </div>

    <div class="grid grid-2">
      <!-- Mis Citas -->
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Mis Próximas Citas</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${misCitas.map(c => `
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center">
              <div>
                <b>${escapeHtml(c.esp)}</b> · ${escapeHtml(c.med)}
                <div style="font-size:12px;color:var(--text-muted)">${c.fecha} a las ${c.hora} (${c.consultorio})</div>
              </div>
              <span class="badge badge-success">${c.est}</span>
            </div>
          `).join('') || '<div style="color:var(--text-muted)">No tiene citas programadas.</div>'}
        </div>
      </div>

      <!-- Mis Resultados -->
      <div class="card-glass">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:12px">Resultados de Laboratorio Validados</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${misLabs.map(l => `
            <div style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <b>${escapeHtml(l.ex)}</b>
                <span class="badge badge-success">✓ Publicado</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Validado: ${l.fechaPublicacion}</div>
            </div>
          `).join('') || '<div style="color:var(--text-muted)">Aún no registra exámenes publicados.</div>'}
        </div>
      </div>
    </div>
  `;
}

// Modals Implementations
function openModalCita() {
  const doctors = [
    { n: "Dr. Andrés Martínez", esp: "Medicina general" },
    { n: "Dra. Laura Gómez", esp: "Ginecología" },
    { n: "Dr. Julián Restrepo", esp: "Neumología" }
  ];

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Agendar Nueva Cita Médica</h2>
    <form onsubmit="event.preventDefault(); guardarCita()">
      <div class="form-group">
        <label class="form-label">Paciente</label>
        <select id="modal-cita-pac" class="form-select">
          ${state.patientsList.map(p => `<option value="${p.id}">${escapeHtml(p.nombre)} (${p.id})</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Especialista y Consultorio</label>
        <select id="modal-cita-doc" class="form-select">
          ${doctors.map(d => `<option value="${d.n}" data-esp="${d.esp}">${d.n} · ${d.esp}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Fecha</label>
          <input id="modal-cita-fecha" type="date" class="form-input" value="2026-10-08" required>
        </div>
        <div class="form-group">
          <label class="form-label">Hora</label>
          <select id="modal-cita-hora" class="form-select">
            <option>08:00</option>
            <option>08:30</option>
            <option>09:00</option>
            <option>09:30</option>
            <option>10:00</option>
            <option>10:30</option>
            <option>11:00</option>
            <option>14:00</option>
            <option>15:00</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Motivo de Consulta</label>
        <input id="modal-cita-motivo" class="form-input" placeholder="Ej.: Control periódico o revisión de síntomas">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Confirmar Cita</button>
      </div>
    </form>
  `);
}

async function guardarCita() {
  const pacId = document.getElementById('modal-cita-pac').value;
  const docSelect = document.getElementById('modal-cita-doc');
  const med = docSelect.value;
  const esp = docSelect.selectedOptions[0].getAttribute('data-esp') || 'Medicina general';
  const fecha = document.getElementById('modal-cita-fecha').value;
  const hora = document.getElementById('modal-cita-hora').value;
  const motivo = document.getElementById('modal-cita-motivo').value;

  try {
    await api.post('/appointments', {
      pacId,
      med,
      esp,
      fecha,
      hora,
      motivo,
      canal: state.user.rol === 'paciente' ? 'App SaludDigital' : 'Recepción'
    });
    closeModal();
    toast('Cita agendada y confirmada en la agenda médica');
    await loadModuleData();
    render();
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

function openModalNuevoPaciente() {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Admisión de Nuevo Paciente</h2>
    <form onsubmit="event.preventDefault(); guardarNuevoPaciente()">
      <div class="form-group">
        <label class="form-label">Nombre Completo</label>
        <input id="np-nombre" class="form-input" placeholder="Ej.: Sofía Vargas Ortiz" required>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Documento</label>
          <input id="np-doc" class="form-input" placeholder="CC 1.000.000.000" required>
        </div>
        <div class="form-group">
          <label class="form-label">Edad</label>
          <input id="np-edad" type="number" class="form-input" value="30" required>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">EPS / Aseguradora</label>
          <select id="np-eps" class="form-select">
            <option>Sura EPS</option>
            <option>Sanitas EPS</option>
            <option>Compensar</option>
            <option>Nueva EPS</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Teléfono</label>
          <input id="np-tel" class="form-input" placeholder="310 000 0000" required>
        </div>
      </div>
      <div class="form-group" style="padding:12px;background:var(--border-subtle);border-radius:var(--radius-sm)">
        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-weight:600;font-size:13.5px">
          <input id="np-habeas" type="checkbox" required style="width:18px;height:18px">
          <span>Aceptación expresa de Tratamiento de Datos Personales (Ley 1581 de 2012)</span>
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar e Ingresar</button>
      </div>
    </form>
  `);
}

async function guardarNuevoPaciente() {
  const nombre = document.getElementById('np-nombre').value.trim();
  const doc = document.getElementById('np-doc').value.trim();
  const edad = parseInt(document.getElementById('np-edad').value, 10);
  const eps = document.getElementById('np-eps').value;
  const tel = document.getElementById('np-tel').value.trim();
  const consentimientoHabeasData = document.getElementById('np-habeas').checked;

  try {
    const res = await api.post('/patients', {
      nombre,
      doc,
      edad,
      eps,
      tel,
      consentimientoHabeasData
    });
    closeModal();
    toast(`Paciente ${nombre} registrado exitosamente con ID ${res.patient.id}`);
    await loadModuleData();
    selectPatient(res.patient.id);
  } catch (e) {}
}

function openModalBreakGlass(pacId) {
  openModal(`
    <div style="padding:10px;background:var(--danger-bg);border:1px solid var(--danger-border);border-radius:var(--radius-sm);margin-bottom:16px">
      <h3 style="color:var(--danger);font-size:16px;font-weight:800;margin-bottom:6px">⚠️ Protocolo de Acceso de Emergencia (Break-Glass)</h3>
      <p style="font-size:13px;color:var(--text-main)">
        Concede acceso ampliado auditado por <b>30 minutos</b>. Este evento se registra de forma obligatoria en la bitácora de cumplimiento de la <b>Ley 1581 de 2012</b> y se reporta al Comité de Seguridad Clínica.
      </p>
    </div>
    <form onsubmit="event.preventDefault(); activarBreakGlass('${pacId}')">
      <div class="form-group">
        <label class="form-label">Justificación Clínica Obligatoria</label>
        <select id="bg-motivo" class="form-select">
          <option>Urgencia vital · Paciente en paro cardiorrespiratorio o shock</option>
          <option>Trauma mayor / Paciente inconsciente sin acudiente</option>
          <option>Sospecha de reacción adversa medicamentosa grave / Anafilaxia</option>
          <option>Acceso extraordinario autorizado por Jefe de Guardia</option>
        </select>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-danger">Confirmar y Activar Acceso</button>
      </div>
    </form>
  `);
}

async function activarBreakGlass(pacId) {
  const motivo = document.getElementById('bg-motivo').value;
  try {
    const res = await api.post(`/patients/${pacId}/emergency-break-glass`, { motivo });
    closeModal();
    toast(res.message, 'warning');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalEvolucion(pacId) {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Nueva Nota de Evolución (SOEP)</h2>
    <form onsubmit="event.preventDefault(); guardarEvolucion('${pacId}')">
      <div class="form-group">
        <label class="form-label">Tipo de Nota</label>
        <select id="evo-tipo" class="form-select">
          <option>Consulta de control</option>
          <option>Evolución médica intrahospitalaria</option>
          <option>Interconsulta especializada</option>
          <option>Nota de egreso o alta médica</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Descripción Clínica</label>
        <textarea id="evo-nota" class="form-textarea" rows="5" placeholder="Subjetivo, Objetivo, Evaluación y Plan..." required></textarea>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Nota</button>
      </div>
    </form>
  `);
}

async function guardarEvolucion(pacId) {
  const tipo = document.getElementById('evo-tipo').value;
  const nota = document.getElementById('evo-nota').value.trim();
  try {
    await api.post(`/patients/${pacId}/evolution`, { tipo, nota });
    closeModal();
    toast('Nota de evolución agregada al expediente');
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

function openModalDiagnostico(pacId) {
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Agregar Diagnóstico CIE-10</h2>
    <form onsubmit="event.preventDefault(); guardarDiagnostico('${pacId}')">
      <div class="form-group">
        <label class="form-label">Diagnóstico Clínico Codificado</label>
        <input id="dx-input" class="form-input" placeholder="Ej.: Rinitis alérgica (J30.9) o Asma (J45.0)" required>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Agregar Diagnóstico</button>
      </div>
    </form>
  `);
}

async function guardarDiagnostico(pacId) {
  const diagnostico = document.getElementById('dx-input').value.trim();
  try {
    await api.post(`/patients/${pacId}/diagnoses`, { diagnostico });
    closeModal();
    toast('Diagnóstico CIE-10 registrado');
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

async function eliminarDiagnostico(pacId, idx) {
  try {
    await api.del(`/patients/${pacId}/diagnoses/${idx}`);
    toast('Diagnóstico retirado');
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

function openModalSignos(pacId) {
  const s = state.patientData.patient.signos;
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Actualizar Signos Vitales</h2>
    <form onsubmit="event.preventDefault(); guardarSignos('${pacId}')">
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Presión Arterial (mmHg)</label>
          <input id="sig-ta" class="form-input" value="${s.presion || '120/80'}">
        </div>
        <div class="form-group">
          <label class="form-label">Frecuencia Cardíaca (lpm)</label>
          <input id="sig-fc" type="number" class="form-input" value="${parseInt(s.fc) || 72}">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Temperatura (°C)</label>
          <input id="sig-temp" class="form-input" value="${parseFloat(s.temp) || 36.5}">
        </div>
        <div class="form-group">
          <label class="form-label">SatO2 (%)</label>
          <input id="sig-sato2" type="number" class="form-input" value="${parseInt(s.satO2) || 98}">
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Peso (kg)</label>
          <input id="sig-peso" type="number" step="0.1" class="form-input" value="${parseFloat(s.peso) || 70}">
        </div>
        <div class="form-group">
          <label class="form-label">Talla (m)</label>
          <input id="sig-talla" type="number" step="0.01" class="form-input" value="${parseFloat(s.talla) || 1.70}">
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar Signos</button>
      </div>
    </form>
  `);
}

async function guardarSignos(pacId) {
  const presion = document.getElementById('sig-ta').value;
  const fc = document.getElementById('sig-fc').value;
  const temp = document.getElementById('sig-temp').value;
  const satO2 = document.getElementById('sig-sato2').value;
  const peso = document.getElementById('sig-peso').value;
  const talla = document.getElementById('sig-talla').value;

  try {
    await api.patch(`/patients/${pacId}/vitals`, { presion, fc, temp, satO2, peso, talla });
    closeModal();
    toast('Signos vitales actualizados e IMC recalculado');
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

function openModalOrdenLab(pacId) {
  const examenes = [
    "Hemograma completo",
    "Glicemia en ayunas",
    "Perfil tiroideo (TSH)",
    "Hemoglobina glicosilada (HbA1c)",
    "Creatinina en suero",
    "Perfil lipídico completo"
  ];
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Solicitar Examen a Laboratorio (LIS)</h2>
    <form onsubmit="event.preventDefault(); guardarOrdenLab('${pacId}')">
      <div class="form-group">
        <label class="form-label">Catálogo de Pruebas Clínicas</label>
        <select id="lab-examen" class="form-select">
          ${examenes.map(e => `<option>${e}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Indicación Médica</label>
        <input id="lab-obs" class="form-input" placeholder="Control rutinario, sospecha diagnóstica...">
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Enviar Orden a LIS</button>
      </div>
    </form>
  `);
}

async function guardarOrdenLab(pacId) {
  const examen = document.getElementById('lab-examen').value;
  const observaciones = document.getElementById('lab-obs').value;
  try {
    await api.post('/lab/order', { pacId, examen, observaciones });
    closeModal();
    toast('Orden transmitida al Laboratorio Clínico');
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

function openModalReceta(pacId) {
  const meds = [
    "Loratadina",
    "Losartán Potásico",
    "Metformina Clorhidrato",
    "Ácido Fólico",
    "Salbutamol Aerosol",
    "Atorvastatina",
    "Amoxicilina",
    "Ibuprofeno"
  ];
  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:14px">Emitir Receta Médica (e-Prescribing)</h2>
    <form onsubmit="event.preventDefault(); guardarReceta('${pacId}')">
      <div class="form-group">
        <label class="form-label">Medicamento</label>
        <select id="rx-med" class="form-select">
          ${meds.map(m => `<option>${m}</option>`).join('')}
        </select>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Dosis</label>
          <input id="rx-dosis" class="form-input" placeholder="Ej.: 10 mg" required>
        </div>
        <div class="form-group">
          <label class="form-label">Frecuencia</label>
          <input id="rx-frec" class="form-input" placeholder="Ej.: 1 tableta cada 24 horas" required>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Transmitir a Farmacia</button>
      </div>
    </form>
  `);
}

async function guardarReceta(pacId) {
  const medicamento = document.getElementById('rx-med').value;
  const dosis = document.getElementById('rx-dosis').value;
  const frecuencia = document.getElementById('rx-frec').value;

  try {
    const res = await api.post('/pharmacy/prescribe', { pacId, medicamento, dosis, frecuencia });
    closeModal();
    if (res.allergyWarning) {
      toast(res.allergyWarning, 'error');
    } else {
      toast('Receta médica transmitida a Farmacia Hospitalaria');
    }
    state.patientData = await api.get(`/patients/${pacId}`);
    render();
  } catch (e) {}
}

function openModalEditarLab(orderId) {
  const order = state.labOrders.find(l => l.id === orderId);
  if (!order) return;

  const rowsHtml = order.res.map((r, i) => `
    <div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr;gap:8px;align-items:center;margin-bottom:8px">
      <input class="form-input" value="${escapeHtml(r.p)}" id="p-name-${i}">
      <input class="form-input" value="${escapeHtml(r.v)}" id="p-val-${i}" placeholder="Valor medido">
      <input class="form-input" value="${escapeHtml(r.r)}" id="p-ref-${i}">
      <select class="form-select" id="p-flag-${i}">
        <option ${r.f === 'Normal' ? 'selected' : ''}>Normal</option>
        <option ${r.f === 'Alto' ? 'selected' : ''}>Alto</option>
        <option ${r.f === 'Bajo' ? 'selected' : ''}>Bajo</option>
        <option ${r.f === 'Crítico' ? 'selected' : ''}>Crítico</option>
      </select>
    </div>
  `).join('');

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">${escapeHtml(order.ex)}</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Paciente: ${escapeHtml(order.pacNombre)} · Solicitado por: ${escapeHtml(order.med)}</p>

    <div style="font-weight:700;font-size:12px;text-transform:uppercase;margin-bottom:8px">Parámetros de Laboratorio</div>
    <div id="lab-params-container">${rowsHtml}</div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
      ${order.est === 'Publicado' ? `
        <button class="btn btn-secondary btn-sm" onclick="revertirLabBorrador('${order.id}')">Revertir a Borrador</button>
      ` : '<div></div>'}
      <div style="display:flex;gap:10px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button type="button" class="btn btn-primary" onclick="publicarLab('${order.id}')">Validar y Publicar al Médico</button>
      </div>
    </div>
  `);
}

async function publicarLab(orderId) {
  const order = state.labOrders.find(l => l.id === orderId);
  if (!order) return;

  const newParams = order.res.map((_, i) => ({
    p: document.getElementById(`p-name-${i}`).value,
    v: document.getElementById(`p-val-${i}`).value,
    r: document.getElementById(`p-ref-${i}`).value,
    f: document.getElementById(`p-flag-${i}`).value
  }));

  try {
    await api.put(`/lab/${orderId}/results`, { res: newParams, estado: 'En proceso' });
    const pubRes = await api.post(`/lab/${orderId}/publish`, {});
    closeModal();
    toast(pubRes.message);
    await loadModuleData();
    render();
  } catch (e) {}
}

async function revertirLabBorrador(orderId) {
  try {
    await api.post(`/lab/${orderId}/revert-draft`, {});
    closeModal();
    toast('Examen devuelto a borrador para ajustes');
    await loadModuleData();
    render();
  } catch (e) {}
}

function openModalDispensar(rxId) {
  const rx = state.pharmacyOrders.find(f => f.id === rxId);
  if (!rx) return;

  openModal(`
    <h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Registro de Dispensación Farmacéutica</h2>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Paciente: <b>${escapeHtml(rx.pacNombre)}</b> · ${escapeHtml(rx.med)} (${escapeHtml(rx.dosis)})</p>

    <form onsubmit="event.preventDefault(); confirmarDispensacion('${rx.id}')">
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Persona que Recibe</label>
          <input id="disp-recibe" class="form-input" placeholder="Nombre completo" required>
        </div>
        <div class="form-group">
          <label class="form-label">Documento de Identidad</label>
          <input id="disp-doc" class="form-input" placeholder="CC / TI" required>
        </div>
      </div>
      <div class="grid grid-2">
        <div class="form-group">
          <label class="form-label">Parentesco / Condición</label>
          <select id="disp-rel" class="form-select">
            <option>El mismo paciente</option>
            <option>Familiar directo (Cónyuge / Hijo / Padre)</option>
            <option>Acudiente legal o autorizado</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Tipo de Entrega</label>
          <select id="disp-tipo" class="form-select">
            <option value="Completa">Entrega Total</option>
            <option value="Parcial">Entrega Parcial</option>
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:20px">
        <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button type="submit" class="btn btn-primary">Confirmar Entrega y Generar Cargo</button>
      </div>
    </form>
  `);
}

async function confirmarDispensacion(rxId) {
  const recibeNombre = document.getElementById('disp-recibe').value.trim();
  const recibeDoc = document.getElementById('disp-doc').value.trim();
  const parentesco = document.getElementById('disp-rel').value;
  const tipoEntrega = document.getElementById('disp-tipo').value;

  try {
    const res = await api.post(`/pharmacy/${rxId}/dispense`, {
      recibeNombre,
      recibeDoc,
      parentesco,
      tipoEntrega,
      cantEntregada: 30
    });
    closeModal();
    toast(res.message);
    await loadModuleData();
    render();
  } catch (e) {}
}

async function reabastecerStock(medId) {
  const cant = prompt('Ingrese cantidad a sumar al stock:', '30');
  if (!cant || isNaN(parseInt(cant))) return;
  try {
    await api.patch(`/pharmacy/inventory/${medId}/stock`, { cantidad: parseInt(cant) });
    toast('Inventario reabastecido');
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
    toast('Pago registrado y factura liquidada');
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
    toast('Bundle FHIR R4 descargado exitosamente');
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
    case 'pacientes': contentHtml = viewPacientes(); break;
    case 'historia': contentHtml = viewHistoria(); break;
    case 'laboratorio': contentHtml = viewLaboratorio(); break;
    case 'farmacia': contentHtml = viewFarmacia(); break;
    case 'facturacion': contentHtml = viewFacturacion(); break;
    case 'reportes': contentHtml = viewReportes(); break;
    case 'auditoria': contentHtml = viewAuditoria(); break;
    case 'portal-paciente': contentHtml = viewPortalPaciente(); break;
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
  const savedUser = localStorage.getItem('sd_user');
  if (savedUser) {
    try {
      state.user = JSON.parse(savedUser);
    } catch (e) {
      state.user = null;
    }
  }
  await loadInitialData();
  render();
}

window.addEventListener('DOMContentLoaded', initApp);
