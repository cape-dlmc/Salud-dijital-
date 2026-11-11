const express = require('express');
const store = require('../data/store');
const config = require('../config');
const { ROLES, ROLE_KEYS } = require('../roles');
const { requireAuth, requireRole } = require('../middleware/auth');
const sec = require('../lib/security');
const { isNonEmptyString } = require('../lib/validate');

const router = express.Router();
const MIN_PW = 8;

const publicUser = u => ({
  id: u.id,
  user: u.user,
  nombre: u.nombre,
  rol: u.rol,
  cargo: u.cargo,
  ini: u.ini,
  email: u.email,
  pacId: u.pacId || null,
  especialidad: u.especialidad || null,
  regMedico: u.regMedico || null,
  modulos: ROLES[u.rol] ? ROLES[u.rol].modulos : []
});

const adminView = u => ({
  id: u.id, user: u.user, nombre: u.nombre, rol: u.rol, cargo: u.cargo, ini: u.ini, email: u.email
});

// Cuentas de demostración: sin contraseñas. Solo disponible con DEMO_MODE activo.
router.get('/demo-accounts', (req, res) => {
  if (!config.DEMO_MODE) return res.status(404).json({ error: 'No disponible' });
  res.json({
    users: store.data.users.map(u => ({ user: u.user, nombre: u.nombre, rol: u.rol, cargo: u.cargo, ini: u.ini })),
    roles: ROLES
  });
});

router.post('/login', (req, res) => {
  const { user, pw } = req.body || {};
  if (!isNonEmptyString(user) || !isNonEmptyString(pw)) {
    return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
  }
  const username = user.trim().toLowerCase();

  if (sec.isLocked(username)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos. Espere 15 minutos e intente de nuevo.' });
  }

  const u = store.data.users.find(x => x.user.toLowerCase() === username);
  if (!u || !sec.verifyPassword(pw, u.pw)) {
    sec.registerFailure(username);
    store.logAudit({
      usuario: username, rol: 'desconocido', accion: 'LOGIN_FALLIDO',
      detalle: 'Intento de inicio de sesión con credenciales inválidas', ip: req.ip
    });
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }

  sec.clearFailures(username);
  const session = sec.createSession(u.id);
  store.logAudit({
    usuario: u.user, rol: u.rol, accion: 'LOGIN_EXITOSO',
    detalle: `Inicio de sesión. Perfil: ${ROLES[u.rol] ? ROLES[u.rol].nombre : u.rol}`, ip: req.ip
  });

  res.json({ success: true, token: session.token, expiresAt: session.expires, user: publicUser(u) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/logout', requireAuth, (req, res) => {
  sec.destroySession(req.headers.authorization.slice(7).trim());
  store.logAudit({ usuario: req.user.user, rol: req.user.rol, accion: 'LOGOUT', detalle: 'Cierre de sesión', ip: req.ip });
  res.json({ success: true });
});

// El propio usuario cambia su contraseña
router.post('/change-password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  if (!isNonEmptyString(current) || !isNonEmptyString(next)) {
    return res.status(400).json({ error: 'Contraseña actual y nueva son obligatorias' });
  }
  if (next.length < MIN_PW) return res.status(400).json({ error: `La nueva contraseña debe tener al menos ${MIN_PW} caracteres` });
  if (!sec.verifyPassword(current, req.user.pw)) return res.status(401).json({ error: 'La contraseña actual no es correcta' });

  req.user.pw = sec.hashPassword(next);
  store.save();
  store.logAudit({ usuario: req.user.user, rol: req.user.rol, accion: 'CAMBIO_CONTRASENA', detalle: 'El usuario cambió su contraseña', ip: req.ip });
  res.json({ success: true });
});

router.get('/users', ...requireRole('admin'), (req, res) => {
  res.json({ users: store.data.users.map(adminView), roles: ROLES });
});

router.post('/users', ...requireRole('admin'), (req, res) => {
  const { nombre, user, pw, rol, cargo, email } = req.body || {};
  if (!isNonEmptyString(nombre) || !isNonEmptyString(user) || !isNonEmptyString(pw) || !rol) {
    return res.status(400).json({ error: 'Nombre, usuario, contraseña y rol son obligatorios' });
  }
  if (!ROLES[rol]) return res.status(400).json({ error: 'Rol inválido' });
  if (pw.length < MIN_PW) return res.status(400).json({ error: `La contraseña debe tener al menos ${MIN_PW} caracteres` });

  const cleanUser = user.trim().toLowerCase();
  if (store.data.users.some(u => u.user.toLowerCase() === cleanUser)) {
    return res.status(400).json({ error: 'Ese nombre de usuario ya está registrado' });
  }

  const initials = nombre.split(' ').filter(w => w.length > 2).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('') || 'US';

  const newUser = {
    id: 'u' + (Math.max(0, ...store.data.users.map(u => parseInt(u.id.slice(1), 10) || 0)) + 1),
    user: cleanUser,
    pw: sec.hashPassword(pw),
    nombre: nombre.trim(),
    rol,
    cargo: cargo || ROLES[rol].nombre,
    ini: initials,
    email: email || `${cleanUser}@saluddigital.com`
  };
  store.data.users.push(newUser);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'CREAR_USUARIO',
    detalle: `Nuevo usuario creado: ${newUser.user} (${newUser.rol})`, ip: req.ip
  });
  res.status(201).json({ success: true, user: adminView(newUser) });
});

router.patch('/users/:id/role', ...requireRole('admin'), (req, res) => {
  const u = store.data.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'No puede cambiar su propio perfil' });
  const { rol } = req.body || {};
  if (!ROLE_KEYS.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  const oldRol = u.rol;
  u.rol = rol;
  u.cargo = ROLES[rol].nombre;
  sec.destroyUserSessions(u.id);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'MODIFICAR_ROL',
    detalle: `Cambio de perfil para ${u.user}: de ${oldRol} a ${rol}`, ip: req.ip
  });
  res.json({ success: true, user: adminView(u) });
});

// Reseteo de clave por el administrador: devuelve una contraseña temporal una sola vez
router.post('/users/:id/reset-password', ...requireRole('admin'), (req, res) => {
  const u = store.data.users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const temporary = sec.generateTempPassword();
  u.pw = sec.hashPassword(temporary);
  sec.destroyUserSessions(u.id);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'RESET_CONTRASENA',
    detalle: `Contraseña reseteada para ${u.user}; sesiones activas cerradas`, ip: req.ip
  });
  res.json({ success: true, temporaryPassword: temporary, message: 'Entregue esta contraseña temporal al usuario por un canal seguro.' });
});

router.delete('/users/:id', ...requireRole('admin'), (req, res) => {
  const idx = store.data.users.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (store.data.users[idx].id === req.user.id) return res.status(400).json({ error: 'No puede eliminar su propio usuario' });

  const [removed] = store.data.users.splice(idx, 1);
  sec.destroyUserSessions(removed.id);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ELIMINAR_USUARIO',
    detalle: `Acceso revocado para usuario: ${removed.user} (${removed.nombre})`, ip: req.ip
  });
  res.json({ success: true });
});

module.exports = router;
