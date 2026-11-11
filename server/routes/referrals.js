const express = require('express');
const store = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isNonEmptyString, nextId } = require('../lib/validate');

const router = express.Router();

const STAFF_ROLES = ['admin', 'medico', 'especialista', 'gerencia'];

// Listado de remisiones e interconsultas a especialistas
router.get('/', ...requireRole(...STAFF_ROLES), (req, res) => {
  const { especialidad, especialista, pacId, estado } = req.query;
  let list = store.data.referrals || [];

  if (pacId) list = list.filter(r => r.pacId === pacId);
  if (especialidad && especialidad !== 'Todas') list = list.filter(r => r.especialidadRequerida === especialidad);
  if (especialista) list = list.filter(r => r.especialistaSugerido === especialista);
  if (estado && estado !== 'Todos') list = list.filter(r => r.est === estado);

  // Si es especialista, por defecto ve las de su especialidad o dirigidas a él
  if (req.user.rol === 'especialista' && !pacId && !especialidad) {
    list = list.filter(r =>
      r.especialistaSugerido === req.user.nombre ||
      (req.user.especialidad && r.especialidadRequerida.toLowerCase().includes(req.user.especialidad.toLowerCase()))
    );
  }

  res.json({
    referrals: list,
    specialties: store.data.specialties,
    doctors: store.data.doctors
  });
});

// Detalle de una remisión
router.get('/:id', ...requireRole(...STAFF_ROLES), (req, res) => {
  const ref = (store.data.referrals || []).find(r => r.id === req.params.id);
  if (!ref) return res.status(404).json({ error: 'Remisión no encontrada.' });

  const patient = store.data.patients.find(p => p.id === ref.pacId);
  res.json({
    referral: ref,
    patient: patient ? {
      id: patient.id,
      nombre: patient.nombre,
      tipoDoc: patient.tipoDoc,
      doc: patient.doc,
      edad: patient.edad,
      sexo: patient.sexo,
      eps: patient.eps,
      tel: patient.tel,
      alergias: patient.alergias,
      dx: patient.dx,
      signos: patient.signos
    } : null
  });
});

// Generar nueva remisión / interconsulta a especialista
// Solo médicos generales o especialistas tratantes pueden emitir remisiones
router.post('/', ...requireRole('medico', 'especialista', 'admin'), (req, res) => {
  const {
    pacId,
    especialidadRequerida,
    especialistaSugerido,
    prioridad = 'Normal',
    motivo,
    resumenClinico
  } = req.body || {};

  if (!isNonEmptyString(pacId) || !isNonEmptyString(especialidadRequerida) || !isNonEmptyString(motivo)) {
    return res.status(400).json({
      error: 'Paciente, especialidad requerida y motivo clínico de la remisión son obligatorios.'
    });
  }

  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado.' });

  store.data.referrals = store.data.referrals || [];
  const newRef = {
    id: nextId(store.data.referrals, 'rem-', 'id', 101),
    pacId: patient.id,
    pacNombre: patient.nombre,
    pacDoc: `${patient.tipoDoc} ${patient.doc}`,
    pacEps: patient.eps,
    solicitante: req.user.nombre,
    solicitanteCargo: req.user.cargo || 'Médico tratante',
    especialidadRequerida: especialidadRequerida.trim(),
    especialistaSugerido: especialistaSugerido ? especialistaSugerido.trim() : 'Primer especialista disponible',
    prioridad: prioridad === 'Prioritaria' ? 'Prioritaria' : 'Normal',
    motivo: motivo.trim(),
    resumenClinico: isNonEmptyString(resumenClinico) ? resumenClinico.trim() : 'Remisión para valoración y plan de manejo especializado.',
    fecha: new Date().toLocaleDateString('es-CO'),
    creadoEn: new Date().toISOString(),
    est: 'Pendiente', // Pendiente, En atención, Atendida, Cancelada
    fechaAtencion: null,
    especialistaAtendio: null,
    conceptoEspecialista: null
  };

  store.data.referrals.unshift(newRef);

  // Añadir nota en la evolución del paciente
  patient.evol.unshift({
    fecha: new Date().toLocaleString('es-CO'),
    autor: req.user.nombre,
    tipo: 'Remisión a Especialista',
    nota: `Se emite orden de remisión a ${newRef.especialidadRequerida} (${newRef.prioridad}). Motivo: ${newRef.motivo}`
  });

  store.save();
  store.logAudit({
    usuario: req.user.user,
    rol: req.user.rol,
    accion: 'ORDEN_REMISION_CREADA',
    detalle: `Remisión a ${newRef.especialidadRequerida} (${newRef.prioridad}) emitida para ${patient.nombre}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.status(201).json({ success: true, referral: newRef });
});

// Especialista atiende o registra concepto sobre la remisión
router.patch('/:id/concepto', ...requireRole('especialista', 'medico', 'admin'), (req, res) => {
  store.data.referrals = store.data.referrals || [];
  const ref = store.data.referrals.find(r => r.id === req.params.id);
  if (!ref) return res.status(404).json({ error: 'Remisión no encontrada.' });

  const { concepto, conducta } = req.body || {};
  if (!isNonEmptyString(concepto)) {
    return res.status(400).json({ error: 'El concepto del especialista es obligatorio.' });
  }

  ref.est = 'Atendida';
  ref.fechaAtencion = new Date().toLocaleDateString('es-CO');
  ref.especialistaAtendio = req.user.nombre;
  ref.conceptoEspecialista = concepto.trim();
  ref.conducta = conducta ? conducta.trim() : 'Continuar seguimiento según pauta.';

  // Actualizar también la evolución del paciente
  const patient = store.data.patients.find(p => p.id === ref.pacId);
  if (patient) {
    patient.evol.unshift({
      fecha: new Date().toLocaleString('es-CO'),
      autor: req.user.nombre,
      tipo: `Concepto Especializado (${ref.especialidadRequerida})`,
      nota: `Concepto: ${ref.conceptoEspecialista}. Conducta: ${ref.conducta}`
    });
  }

  store.save();
  store.logAudit({
    usuario: req.user.user,
    rol: req.user.rol,
    accion: 'CONCEPTO_ESPECIALISTA_EMITIDO',
    detalle: `Concepto especializado emitido para remisión ${ref.id} (${ref.pacNombre})`,
    pacienteId: ref.pacId,
    ip: req.ip
  });

  res.json({ success: true, referral: ref });
});

module.exports = router;
