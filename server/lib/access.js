const store = require('../data/store');
const { BREAK_GLASS_MS } = require('../config');

// ¿El médico tiene un acceso de emergencia vigente a este paciente?
function hasActiveBreakGlass(user, pacienteId) {
  const now = Date.now();
  return (store.data.emergencyAccesses || []).some(
    e => e.usuario === user.user && e.pacienteId === pacienteId && new Date(e.expira).getTime() > now
  );
}

// Un médico o especialista ve la historia clínica de sus pacientes asignados,
// o si tiene una interconsulta/remisión vigente asignada, o si tiene emergencia activa.
function canViewClinical(user, patient) {
  if (user.rol === 'medico' || user.rol === 'especialista') {
    if (patient.medico === user.nombre) return true;
    if (hasActiveBreakGlass(user, patient.id)) return true;
    if (store.data.referrals && store.data.referrals.some(r => r.pacId === patient.id && (r.especialistaSugerido === user.nombre || (user.especialidad && r.especialidadRequerida === user.especialidad)))) {
      return true;
    }
  }
  return false;
}

function canWriteClinical(user, patient) {
  if (user.rol === 'medico' || user.rol === 'especialista') {
    if (patient.medico === user.nombre) return true;
    if (hasActiveBreakGlass(user, patient.id)) return true;
    if (store.data.referrals && store.data.referrals.some(r => r.pacId === patient.id && (r.especialistaSugerido === user.nombre || (user.especialidad && r.especialidadRequerida === user.especialidad)))) {
      return true;
    }
  }
  return false;
}

// Datos demográficos: lo que necesita admisión, facturación y laboratorio
function administrativeView(p) {
  return {
    id: p.id,
    tipoDoc: p.tipoDoc,
    doc: p.doc,
    nombre: p.nombre,
    sexo: p.sexo,
    fechaNacimiento: p.fechaNacimiento,
    edad: p.edad,
    eps: p.eps,
    regimen: p.regimen,
    tel: p.tel,
    email: p.email,
    direccion: p.direccion,
    medico: p.medico,
    estado: p.estado,
    consentimientoDatos: p.consentimientoDatos
  };
}

// Historia clínica completa
function clinicalView(p) {
  return {
    ...administrativeView(p),
    contactoEmergencia: p.contactoEmergencia,
    alergias: p.alergias,
    antec: p.antec,
    dx: p.dx,
    meds: p.meds,
    signos: p.signos,
    evol: p.evol
  };
}

module.exports = {
  hasActiveBreakGlass, canViewClinical, canWriteClinical,
  administrativeView, clinicalView
};
