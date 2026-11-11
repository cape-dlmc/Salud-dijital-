// Pruebas de integración: usan una base de datos temporal, no tocan db.json
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-')), 'db.json');
process.env.DB_FILE = tmpDb;
process.env.DEMO_MODE = 'true';

const app = require('../server/index');
let server, base;

before(async () => {
  await new Promise(resolve => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});
after(() => new Promise(r => server.close(r)));

async function call(method, url, { token, body, headers = {} } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function login(user, pw) {
  const r = await call('POST', '/api/auth/login', { body: { user, pw } });
  assert.equal(r.status, 200, `login ${user}: ${JSON.stringify(r.json)}`);
  return r.json.token;
}

const PW = { admin: 'Admin2026*', medico: 'Medico2026*', lab: 'Lab2026*', farm: 'Farm2026*', fact: 'Fact2026*', ger: 'Gerencia2026*' };

test('cuentas de demostración no exponen contraseñas', async () => {
  const r = await call('GET', '/api/auth/demo-accounts');
  assert.equal(r.status, 200);
  assert.ok(r.json.users.length >= 8);
  assert.ok(r.json.users.every(u => !('pw' in u)));
});

test('contraseñas guardadas cifradas en el archivo de datos', () => {
  const raw = fs.readFileSync(tmpDb, 'utf8');
  assert.ok(!raw.includes('Admin2026*'), 'la contraseña no debe quedar en texto plano');
  assert.ok(raw.includes('scrypt$'));
});

test('login: credenciales incorrectas y correctas', async () => {
  const bad = await call('POST', '/api/auth/login', { body: { user: 'admin.pena', pw: 'mala' } });
  assert.equal(bad.status, 401);
  const ok = await login('admin.pena', PW.admin);
  assert.ok(ok.length >= 32);
});

test('sin token no hay acceso a datos clínicos', async () => {
  assert.equal((await call('GET', '/api/patients')).status, 401);
  assert.equal((await call('GET', '/api/patients/SD-10482')).status, 401);
});

test('el header x-user-id ya no sirve para suplantar identidad', async () => {
  const r = await call('GET', '/api/patients', { headers: { 'x-user-id': 'u1' } });
  assert.equal(r.status, 401);
});

test('admin ve datos administrativos, no diagnósticos', async () => {
  const t = await login('admin.pena', PW.admin);
  const r = await call('GET', '/api/patients/SD-10482', { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.json.patient.dx, undefined);
  assert.equal(r.json.patient.alergias, undefined);
});

test('médico asignado ve la historia; médico no asignado recibe 403', async () => {
  const martinez = await login('dr.martinez', PW.medico);
  const ok = await call('GET', '/api/patients/SD-10482', { token: martinez });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.json.patient.dx));

  const gomez = await login('dra.gomez', PW.medico);
  const denied = await call('GET', '/api/patients/SD-10482', { token: gomez });
  assert.equal(denied.status, 403);
});

test('médicos no agendan citas y solo atienden citas confirmadas en recepción', async () => {
  const doc = await login('dr.martinez', PW.medico);
  const badApt = await call('POST', '/api/appointments', {
    token: doc,
    body: { pacId: 'SD-10482', esp: 'Medicina general', med: 'Dr. Andrés Martínez', fecha: '2026-11-20', hora: '10:00' }
  });
  assert.equal(badApt.status, 403, 'médicos no deben poder agendar citas');

  const adm = await login('admin.pena', PW.admin);
  const okApt = await call('POST', '/api/appointments', {
    token: adm,
    body: {
      nombre: 'Pedro Nel Gómez', doc: '98.765.432', tel: '300 111 2233', eps: 'Sura EPS',
      esp: 'Medicina general', med: 'Dr. Andrés Martínez', fecha: '2026-11-20', hora: '10:00'
    }
  });
  assert.equal(okApt.status, 201);
  assert.equal(okApt.json.appointment.est, 'Pendiente');

  const cantAttend = await call('PATCH', `/api/appointments/${okApt.json.appointment.id}/status`, {
    token: doc, body: { est: 'En consulta' }
  });
  assert.equal(cantAttend.status, 400, 'no puede atender cita sin checkin');

  const checkin = await call('PATCH', `/api/appointments/${okApt.json.appointment.id}/checkin`, { token: adm });
  assert.equal(checkin.status, 200);

  const canAttend = await call('PATCH', `/api/appointments/${okApt.json.appointment.id}/status`, {
    token: doc, body: { est: 'En consulta' }
  });
  assert.equal(canAttend.status, 200);
});

test('autogenerador de problemas detecta CIE-10 a partir del estado del paciente', async () => {
  const doc = await login('dr.martinez', PW.medico);
  const r = await call('POST', '/api/patients/analyze-symptoms', {
    token: doc,
    body: { texto: 'Paciente refiere dolor de cabeza intenso con náuseas y presión alta en toma casera' }
  });
  assert.equal(r.status, 200);
  assert.ok(r.json.problemas.some(p => p.cie10 === 'G43.9'));
  assert.ok(r.json.problemas.some(p => p.cie10 === 'I10'));
});

test('laboratorio no puede crear órdenes médicas', async () => {
  const t = await login('lab.ortega', PW.lab);
  const r = await call('POST', '/api/lab/order', { token: t, body: { pacId: 'SD-10482', examen: 'Glicemia en ayunas' } });
  assert.equal(r.status, 403);
});

test('médico crea orden de laboratorio (antes fallaba con ReferenceError)', async () => {
  const t = await login('dr.martinez', PW.medico);
  const r = await call('POST', '/api/lab/order', { token: t, body: { pacId: 'SD-10482', examen: 'Glicemia en ayunas' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.order.est, 'Pendiente');
});

test('prescripción con alerta de alergia (antes fallaba con ReferenceError)', async () => {
  const t = await login('dr.martinez', PW.medico);
  const r = await call('POST', '/api/pharmacy/prescribe', { token: t, body: { pacId: 'SD-10482', medicamento: 'Amoxicilina' } });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.ok(r.json.allergyWarning && r.json.allergyWarning.includes('Penicilina'));
});

test('cancelar una dispensación no descuenta inventario', async () => {
  const med = await login('farm.rojas', PW.farm);
  const before = (await call('GET', '/api/pharmacy', { token: med })).json.catalog.find(m => m.n === 'Loratadina').stock;
  const doc = await login('dr.martinez', PW.medico);
  const rx = await call('POST', '/api/pharmacy/prescribe', { token: doc, body: { pacId: 'SD-10482', medicamento: 'Loratadina' } });
  const r = await call('POST', `/api/pharmacy/${rx.json.prescription.id}/dispense`, { token: med, body: { tipoEntrega: 'Cancelado' } });
  assert.equal(r.status, 200);
  const after = (await call('GET', '/api/pharmacy', { token: med })).json.catalog.find(m => m.n === 'Loratadina').stock;
  assert.equal(after, before);
});

test('facturación no ve historia clínica ni dispensaciones', async () => {
  const t = await login('fact.vargas', PW.fact);
  const r = await call('GET', '/api/patients/SD-10482', { token: t });
  assert.equal(r.status, 200);
  assert.equal(r.json.patient.dx, undefined);
  assert.deepEqual(r.json.prescriptions, []);
});

test('gerencia no accede al detalle de pacientes', async () => {
  const t = await login('gerencia', PW.ger);
  assert.equal((await call('GET', '/api/patients/SD-10482', { token: t })).status, 403);
  const list = await call('GET', '/api/patients', { token: t });
  assert.ok(list.json.patients.every(p => p.nombre === undefined));
});

test('la bitácora solo la ven administración y gerencia', async () => {
  const med = await login('dr.martinez', PW.medico);
  assert.equal((await call('GET', '/api/audit', { token: med })).status, 403);
  const adm = await login('admin.pena', PW.admin);
  assert.equal((await call('GET', '/api/audit', { token: adm })).status, 200);
});

test('reseteo de clave por administrador y cambio de clave por el usuario', async () => {
  const adm = await login('admin.pena', PW.admin);
  const users = (await call('GET', '/api/auth/users', { token: adm })).json.users;
  const target = users.find(u => u.user === 'fact.vargas');
  const reset = await call('POST', `/api/auth/users/${target.id}/reset-password`, { token: adm });
  assert.equal(reset.status, 200);
  const newToken = await login('fact.vargas', reset.json.temporaryPassword);

  const change = await call('POST', '/api/auth/change-password', { token: newToken, body: { current: reset.json.temporaryPassword, next: 'NuevaClave2026' } });
  assert.equal(change.status, 200);
  await login('fact.vargas', 'NuevaClave2026');
});

test('bloqueo temporal tras varios intentos fallidos', async () => {
  let last;
  for (let i = 0; i < 5; i++) last = await call('POST', '/api/auth/login', { body: { user: 'gerencia', pw: 'x' + i } });
  assert.equal(last.status, 401);
  const locked = await call('POST', '/api/auth/login', { body: { user: 'gerencia', pw: PW.ger } });
  assert.equal(locked.status, 429);
});

test('ningún texto legal aparece en las respuestas de la API', async () => {
  const adm = await login('admin.pena', PW.admin);
  const body = JSON.stringify((await call('GET', '/api/patients', { token: adm })).json) +
    JSON.stringify((await call('GET', '/api/audit', { token: adm })).json);
  assert.ok(!/Ley 1581|Habeas/i.test(body));
});
