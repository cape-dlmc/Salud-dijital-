const express = require('express');
const router = express.Router();
const store = require('../data/store');
const { ROLES } = require('../middleware/auth');

// Get available demo users and role configurations
router.get('/demo-accounts', (req, res) => {
  const sanitized = store.data.users.map(u => ({
    id: u.id,
    user: u.user,
    pw: u.pw,
    nombre: u.nombre,
    rol: u.rol,
    cargo: u.cargo,
    ini: u.ini,
    pacId: u.pacId || null,
    rolNombre: ROLES[u.rol] ? ROLES[u.rol].nombre : u.rol
  }));
  res.json({ users: sanitized, roles: ROLES });
});

// Login
router.post('/login', (req, res) => {
  const { user, pw } = req.body;
  if (!user || !pw) {
    return res.status(400).json({ error: "Usuario y contraseña requeridos" });
  }

  const u = store.data.users.find(
    x => x.user.toLowerCase() === user.trim().toLowerCase() && x.pw === pw
  );

  if (!u) {
    store.logAudit({
      usuario: user,
      rol: "desconocido",
      accion: "LOGIN_FALLIDO",
      detalle: "Intento de inicio de sesión con credenciales inválidas",
      ip: req.ip
    });
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }

  store.logAudit({
    usuario: u.user,
    rol: u.rol,
    accion: "LOGIN_EXITOSO",
    detalle: `Inicio de sesión exitoso. Perfil: ${ROLES[u.rol]?.nombre || u.rol}`,
    ip: req.ip
  });

  const userData = {
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
    modulos: ROLES[u.rol]?.modulos || []
  };

  res.json({ success: true, user: userData });
});

// Get all users (Admin only)
router.get('/users', (req, res) => {
  const users = store.data.users.map(u => ({
    id: u.id,
    user: u.user,
    nombre: u.nombre,
    rol: u.rol,
    cargo: u.cargo,
    ini: u.ini,
    email: u.email
  }));
  res.json({ users, roles: ROLES });
});

// Create new user (Admin)
router.post('/users', (req, res) => {
  const { nombre, user, pw, rol, cargo, email } = req.body;
  if (!nombre || !user || !pw || !rol) {
    return res.status(400).json({ error: "Nombre, usuario, contraseña y rol son obligatorios" });
  }

  const cleanUser = user.trim().toLowerCase();
  if (store.data.users.some(u => u.user.toLowerCase() === cleanUser)) {
    return res.status(400).json({ error: "Ese nombre de usuario ya está registrado" });
  }

  const initials = nombre
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || "US";

  const newUser = {
    id: "u" + (store.data.users.length + 1),
    user: cleanUser,
    pw,
    nombre,
    rol,
    cargo: cargo || (ROLES[rol] ? ROLES[rol].nombre : "Personal"),
    ini: initials,
    email: email || `${cleanUser}@saluddigital.com`
  };

  store.data.users.push(newUser);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "CREAR_USUARIO",
    detalle: `Nuevo usuario creado: ${newUser.user} (${newUser.rol})`,
    ip: req.ip
  });

  res.status(201).json({ success: true, user: newUser });
});

// Update user role (Admin)
router.patch('/users/:id/role', (req, res) => {
  const { id } = req.params;
  const { rol } = req.body;

  const u = store.data.users.find(x => x.id === id);
  if (!u) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!ROLES[rol]) return res.status(400).json({ error: "Rol inválido" });

  const oldRol = u.rol;
  u.rol = rol;
  u.cargo = ROLES[rol].nombre;
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "MODIFICAR_ROL",
    detalle: `Cambio de perfil para ${u.user}: de ${oldRol} a ${rol}`,
    ip: req.ip
  });

  res.json({ success: true, user: u });
});

// Delete / remove user (Admin)
router.delete('/users/:id', (req, res) => {
  const { id } = req.params;
  const idx = store.data.users.findIndex(x => x.id === id);
  if (idx === -1) return res.status(404).json({ error: "Usuario no encontrado" });

  const removed = store.data.users.splice(idx, 1)[0];
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "ELIMINAR_USUARIO",
    detalle: `Acceso revocado para usuario: ${removed.user} (${removed.nombre})`,
    ip: req.ip
  });

  res.json({ success: true });
});

module.exports = router;
