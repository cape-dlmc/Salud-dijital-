const express = require('express');
const store = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');
const { canViewClinical, canWriteClinical, administrativeView, clinicalView, hasActiveBreakGlass } = require('../lib/access');
const { isNonEmptyString, nextId } = require('../lib/validate');
const { analyzeSymptoms } = require('../lib/nlp');
const { BREAK_GLASS_MS } = require('../config');

const router = express.Router();

const ALL_STAFF = ['admin', 'medico', 'especialista', 'laboratorio', 'farmacia', 'facturacion', 'gerencia'];

const findPatient = id => store.data.patients.find(p => p.id === id);
const stamp = () => new Date().toLocaleString('es-CO');

// Autogenerador inteligente de problemas y diagnósticos CIE-10 desde el relato clínico
router.post('/analyze-symptoms', ...requireRole('medico', 'especialista', 'admin'), (req, res) => {
  const { texto } = req.body || {};
  if (!texto || typeof texto !== 'string') {
    return res.status(400).json({ error: 'Texto de evaluación clínica requerido.' });
  }
  const problemas = analyzeSymptoms(texto);
  res.json({
    success: true,
    count: problemas.length,
    problemas
  });
});

// Búsqueda rápida por documento (cédula) para admisiones y agendamiento
router.get('/by-doc/:doc', ...requireRole(...ALL_STAFF), (req, res) => {
  const cleanDoc = String(req.params.doc || '').replace(/\D/g, '');
  if (!cleanDoc) return res.status(400).json({ error: 'Documento inválido' });

  const patient = store.data.patients.find(p => p.doc.replace(/\D/g, '') === cleanDoc);
  if (!patient) {
    return res.json({ exists: false, message: 'Documento no registrado. Se creará nueva historia clínica.' });
  }

  res.json({
    exists: true,
    patient: administrativeView(patient),
    message: `Paciente encontrado (${patient.id} - ${patient.nombre}). Se vinculará a su expediente existente.`
  });
});

// Listado según perfil de usuario
router.get('/', ...requireRole(...ALL_STAFF), (req, res) => {
  const user = req.user;
  const search = String(req.query.q || '').trim().toLowerCase();

  let list = store.data.patients;
  if (search) {
    list = list.filter(p =>
      p.nombre.toLowerCase().includes(search) ||
      p.doc.toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search) ||
      p.eps.toLowerCase().includes(search)
    );
  }

  switch (user.rol) {
    case 'medico':
    case 'especialista':
      return res.json({
        patients: list.map(p => ({
          ...administrativeView(p),
          esMiPaciente: p.medico === user.nombre,
          tieneRemision: (store.data.referrals || []).some(r => r.pacId === p.id && (r.especialistaSugerido === user.nombre || (user.especialidad && r.especialidadRequerida === user.especialidad))),
          tieneAccesoEmergencia: hasActiveBreakGlass(user, p.id)
        }))
      });
    case 'gerencia':
      // Indicadores agregados anonimizados
      return res.json({ patients: list.map(p => ({ id: p.id, eps: p.eps, regimen: p.regimen, estado: p.estado, edad: p.edad })) });
    default:
      return res.json({ patients: list.map(administrativeView) });
  }
});

// Detalle de paciente según perfil y relación asistencial
router.get('/:id', ...requireRole(...ALL_STAFF), (req, res) => {
  const user = req.user;
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (user.rol === 'gerencia') return res.status(403).json({ error: 'Gerencia accede solo a indicadores anonimizados.' });

  const isClinician = user.rol === 'medico' || user.rol === 'especialista';
  if (isClinician && !canViewClinical(user, patient)) {
    return res.status(403).json({ error: 'Paciente no asignado a usted. Solicite un acceso de emergencia si es urgente.' });
  }

  const clinical = isClinician;
  const body = clinical ? clinicalView(patient) : administrativeView(patient);
  if (user.rol === 'farmacia') {
    body.alergias = patient.alergias;
    body.meds = patient.meds;
  }

  store.logAudit({
    usuario: user.user, rol: user.rol, accion: 'CONSULTA_PACIENTE',
    detalle: `Consulta de expediente para ${patient.nombre} (${patient.id})`, pacienteId: patient.id, ip: req.ip
  });

  const labs = store.data.labOrders.filter(l => l.pacId === patient.id);
  const prescriptions = store.data.pharmacyOrders.filter(f => f.pacId === patient.id);
  const appointments = store.data.appointments.filter(a => a.pacId === patient.id);
  const invoices = store.data.invoices.filter(i => i.pacId === patient.id);
  const referrals = (store.data.referrals || []).filter(r => r.pacId === patient.id);

  res.json({
    patient: body,
    labs: ['medico', 'especialista', 'laboratorio'].includes(user.rol) ? labs : [],
    prescriptions: ['medico', 'especialista', 'farmacia'].includes(user.rol) ? prescriptions : [],
    referrals: ['medico', 'especialista', 'admin'].includes(user.rol) ? referrals : [],
    appointments,
    invoices: ['facturacion', 'admin'].includes(user.rol) ? invoices : []
  });
});

// Admisión manual de paciente nuevo
router.post('/', ...requireRole('admin'), (req, res) => {
  const { nombre, tipoDoc = 'CC', doc, edad, fechaNacimiento, sexo, eps, regimen, tel, email, direccion, medico, consentimientoDatos } = req.body || {};
  if (!isNonEmptyString(nombre) || !isNonEmptyString(doc)) {
    return res.status(400).json({ error: 'Nombre completo y documento son obligatorios' });
  }
  if (consentimientoDatos !== true) {
    return res.status(400).json({ error: 'Se requiere la aceptación expresa del consentimiento para el tratamiento de datos personales' });
  }

  const digits = String(doc).replace(/\D/g, '');
  if (store.data.patients.some(p => p.doc.replace(/\D/g, '') === digits)) {
    return res.status(400).json({ error: 'Ya existe un paciente con este número de documento en la clínica' });
  }

  const newPatient = {
    id: nextId(store.data.patients, 'SD-'),
    tipoDoc,
    doc: String(doc).trim(),
    nombre: nombre.trim(),
    sexo: sexo || 'F',
    fechaNacimiento: fechaNacimiento || null,
    edad: Number(edad) || null,
    eps: eps || 'Particular',
    regimen: regimen || 'Particular',
    tel: tel || '',
    email: email || '',
    direccion: direccion || '',
    contactoEmergencia: { nombre: '', tel: '' },
    medico: medico || (store.data.doctors[0] ? store.data.doctors[0].n : ''),
    estado: 'Activo',
    consentimientoDatos: true,
    fechaConsentimiento: new Date().toISOString(),
    alergias: [], antec: [], dx: [], meds: [],
    signos: { presion: '', fc: '', fr: '', temp: '', peso: '', talla: '', imc: '', satO2: '' },
    evol: [{ fecha: stamp(), autor: req.user.nombre, tipo: 'Ingreso al sistema', nota: 'Paciente registrado en admisión con consentimiento de datos personales.' }]
  };

  store.data.patients.push(newPatient);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'REGISTRO_PACIENTE',
    detalle: `Admisión de nuevo paciente ${newPatient.nombre} con ID ${newPatient.id}`, pacienteId: newPatient.id, ip: req.ip
  });
  res.status(201).json({ success: true, patient: administrativeView(newPatient) });
});

// Reasignación de médico tratante
router.patch('/:id/doctor', ...requireRole('admin'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  const { medico } = req.body || {};
  if (!store.data.doctors.some(d => d.n === medico)) return res.status(400).json({ error: 'Médico no válido' });

  const oldDoc = patient.medico;
  patient.medico = medico;
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'REASIGNAR_MEDICO',
    detalle: `Cambio de médico tratante para ${patient.nombre}: de ${oldDoc} a ${medico}`, pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, patient: administrativeView(patient) });
});

// Nota de evolución clínica
router.post('/:id/evolution', ...requireRole('medico', 'especialista'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });
  const { nota, tipo = 'Nota de evolución' } = req.body || {};
  if (!isNonEmptyString(nota)) return res.status(400).json({ error: 'La nota clínica no puede estar vacía.' });

  patient.evol.unshift({ fecha: stamp(), autor: req.user.nombre, tipo, nota: nota.trim() });
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'REGISTRO_EVOLUCION',
    detalle: `Nota de evolución agregada por ${req.user.nombre}`, pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, evolution: patient.evol });
});

// Diagnósticos
router.post('/:id/diagnoses', ...requireRole('medico', 'especialista'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });
  const { diagnostico } = req.body || {};
  if (!isNonEmptyString(diagnostico)) return res.status(400).json({ error: 'El diagnóstico no puede estar vacío.' });

  patient.dx.push(diagnostico.trim());
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'AGREGAR_DIAGNOSTICO',
    detalle: `Diagnóstico agregado: ${diagnostico.trim()}`, pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, diagnoses: patient.dx });
});

router.delete('/:id/diagnoses/:index', ...requireRole('medico', 'especialista'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });
  const idx = Number.parseInt(req.params.index, 10);
  if (Number.isNaN(idx) || idx < 0 || idx >= patient.dx.length) return res.status(400).json({ error: 'Índice de diagnóstico inválido.' });

  const [removed] = patient.dx.splice(idx, 1);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ELIMINAR_DIAGNOSTICO',
    detalle: `Diagnóstico eliminado: ${removed}`, pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, diagnoses: patient.dx });
});

// Signos vitales
router.patch('/:id/vitals', ...requireRole('medico', 'especialista'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });
  const { presion, fc, fr, temp, peso, talla, satO2 } = req.body || {};

  let imc = patient.signos.imc;
  const kg = parseFloat(peso);
  const m = parseFloat(talla);
  if (!Number.isNaN(kg) && !Number.isNaN(m) && m > 0) {
    const val = (kg / (m * m)).toFixed(1);
    const cat = val < 18.5 ? 'Bajo peso' : val < 25 ? 'Normal' : val < 30 ? 'Sobrepeso' : 'Obesidad';
    imc = `${val} (${cat})`;
  }

  const s = patient.signos;
  patient.signos = {
    presion: presion || s.presion,
    fc: fc ? `${fc} lpm` : s.fc,
    fr: fr ? `${fr} rpm` : s.fr,
    temp: temp ? `${temp} °C` : s.temp,
    peso: peso ? `${peso} kg` : s.peso,
    talla: talla ? `${talla} m` : s.talla,
    imc,
    satO2: satO2 ? `${satO2} %` : s.satO2
  };
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ACTUALIZAR_SIGNOS_VITALES',
    detalle: `Signos vitales actualizados (TA=${patient.signos.presion}, FC=${patient.signos.fc}, SatO2=${patient.signos.satO2})`,
    pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, signos: patient.signos });
});

// Acceso de emergencia (break-glass)
router.post('/:id/emergency-break-glass', ...requireRole('medico', 'especialista'), (req, res) => {
  const patient = findPatient(req.params.id);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  const { motivo } = req.body || {};
  if (!isNonEmptyString(motivo)) return res.status(400).json({ error: 'El motivo clínico de emergencia es obligatorio' });

  const record = {
    id: 'brk-' + Date.now(),
    pacienteId: patient.id,
    pacienteNombre: patient.nombre,
    usuario: req.user.user,
    medicoNombre: req.user.nombre,
    motivo: motivo.trim(),
    timestamp: new Date().toISOString(),
    expira: new Date(Date.now() + BREAK_GLASS_MS).toISOString(),
    ip: req.ip
  };
  store.data.emergencyAccesses.push(record);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ACCESO_EMERGENCIA_ACTIVADO',
    detalle: `Acceso de emergencia activado por 30 minutos para ${patient.nombre} (${patient.id}). Motivo: ${record.motivo}`,
    pacienteId: patient.id, ip: req.ip
  });
  res.json({ success: true, message: 'Acceso de emergencia concedido por 30 minutos. Quedó registrado en la bitácora.', record });
});

module.exports = router;
