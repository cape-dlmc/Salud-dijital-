const store = require('../data/store');

// Role definitions from the TOGAF SaludDigital document
const ROLES = {
  admin: {
    nombre: "Administración y Admisiones",
    modulos: ["inicio", "agenda", "pacientes", "usuarios", "auditoria"],
    descripcion: "Agenda citas, admite pacientes, asigna médico de cabecera y administra accesos. Sin acceso clínico."
  },
  medico: {
    nombre: "Médico Tratante / Especialista",
    modulos: ["inicio", "agenda", "pacientes", "historia"],
    descripcion: "Consulta agenda, atiende pacientes asignados, formula medicamentos y solicita exámenes LIS."
  },
  laboratorio: {
    nombre: "Laboratorio Clínico (LIS)",
    modulos: ["inicio", "laboratorio"],
    descripcion: "Recibe muestras y órdenes, procesa parámetros, alerta valores críticos y publica resultados."
  },
  farmacia: {
    nombre: "Farmacia Hospitalaria",
    modulos: ["inicio", "farmacia"],
    descripcion: "Recibe prescripciones electrónicas, verifica inventario y registra dispensación con firma y 5 correctos."
  },
  facturacion: {
    nombre: "Facturación y Cartera",
    modulos: ["inicio", "facturacion"],
    descripcion: "Confirma servicios prestados (consultas, lab, farmacia), emite facturas y gestiona cartera. Sin datos clínicos."
  },
  gerencia: {
    nombre: "Dirección Médica y Gerencia",
    modulos: ["inicio", "reportes", "auditoria"],
    descripcion: "Indicadores agregados y anonimizados, analítica BI y control de KPIs TOGAF."
  },
  paciente: {
    nombre: "Portal del Paciente",
    modulos: ["inicio", "portal-paciente"],
    descripcion: "Autogestión de citas, consulta de resultados validados, fórmulas médicas y resumen clínico personal."
  }
};

function authMiddleware(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    // If running in development without auth header, allow anonymous or reject
    req.user = null;
    return next();
  }

  const user = store.data.users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: "Usuario no autenticado o sesión expirada" });
  }

  req.user = user;
  next();
}

function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Debe iniciar sesión para realizar esta acción" });
    }
    if (!allowedRoles.includes(req.user.rol)) {
      return res.status(403).json({
        error: `Acceso denegado: El rol ${req.user.rol} no tiene privilegios suficientes según la matriz de seguridad TOGAF.`
      });
    }
    next();
  };
}

module.exports = {
  ROLES,
  authMiddleware,
  requireRole
};
