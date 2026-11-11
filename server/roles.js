// Perfiles de acceso del personal clínico y administrativo
const ROLES = {
  admin: {
    nombre: "Administración, Recepción y Admisiones",
    modulos: ["inicio", "agenda", "pacientes", "usuarios", "facturacion", "auditoria"],
    descripcion: "Agenda citas para cualquier persona, admite pacientes, realiza check-in de llegada en sala, administra colaboradores y coordina facturación."
  },
  medico: {
    nombre: "Médico General / Atención Primaria",
    modulos: ["inicio", "agenda", "pacientes", "historia"],
    descripcion: "Atiende pacientes confirmados en sala, evalúa el estado del paciente con autogeneración de problemas clínicos, prescribe medicamentos, ordena laboratorios y remite a especialistas."
  },
  especialista: {
    nombre: "Médico Especialista / Interconsultas",
    modulos: ["inicio", "agenda", "remisiones", "pacientes", "historia"],
    descripcion: "Recibe interconsultas y remisiones de medicina general, evalúa casos de alta complejidad, emite conceptos especializados y tratamientos."
  },
  laboratorio: {
    nombre: "Laboratorio Clínico",
    modulos: ["inicio", "laboratorio"],
    descripcion: "Recibe muestras y órdenes, procesa parámetros, alerta valores críticos y certifica resultados con informe oficial."
  },
  farmacia: {
    nombre: "Farmacia Hospitalaria",
    modulos: ["inicio", "farmacia"],
    descripcion: "Recibe prescripciones electrónicas, verifica inventario y alergias, y registra la dispensación segura de medicamentos."
  },
  facturacion: {
    nombre: "Facturación y Cartera",
    modulos: ["inicio", "facturacion"],
    descripcion: "Confirma atenciones prestadas, liquida copagos según EPS y régimen, emite facturas y gestiona recaudos."
  },
  gerencia: {
    nombre: "Dirección Médica y Gerencia",
    modulos: ["inicio", "reportes", "auditoria"],
    descripcion: "Indicadores de gestión hospitalaria, ocupación, tiempos de atención, auditoría y control de calidad asistencial."
  }
};

const ROLE_KEYS = Object.keys(ROLES);

module.exports = { ROLES, ROLE_KEYS };
