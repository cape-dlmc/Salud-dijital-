const store = require('../data/store');
const { getSession } = require('../lib/security');
const { ROLES } = require('../roles');

// Lee el token "Bearer" y adjunta el usuario a la petición (si es válido)
function authenticate(req, res, next) {
  req.user = null;
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    const session = getSession(header.slice(7).trim());
    if (session) {
      const user = store.data.users.find(u => u.id === session.userId);
      if (user) req.user = user;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Su sesión no es válida o expiró. Inicie sesión nuevamente.' });
  }
  next();
}

// Uso: router.get('/', ...requireRole('admin', 'medico'), handler)
function requireRole(...allowed) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!allowed.includes(req.user.rol)) {
        return res.status(403).json({
          error: `Su perfil (${ROLES[req.user.rol] ? ROLES[req.user.rol].nombre : req.user.rol}) no tiene permiso para esta acción.`
        });
      }
      next();
    }
  ];
}

module.exports = { authenticate, requireAuth, requireRole };
