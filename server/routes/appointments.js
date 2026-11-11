const express = require('express');
const store = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isNonEmptyString, isDate, nextId } = require('../lib/validate');

const router = express.Router();

const HORARIOS = ['07:30', '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00'];
const ESTADOS = ['Pendiente', 'Confirmada en Recepción', 'En consulta', 'Atendida', 'Cancelada', 'No asistió'];

router.get('/', requireAuth, (req, res) => {
  const { fecha, medico, pacId, estado } = req.query;
  let list = store.data.appointments;
  if (fecha) list = list.filter(a => a.fecha === fecha);
  if (medico) list = list.filter(a => a.med === medico);
  if (pacId) list = list.filter(a => a.pacId === pacId);
  if (estado && estado !== 'Todos') list = list.filter(a => a.est === estado);

  if (req.user.rol === 'laboratorio' || req.user.rol === 'farmacia' || req.user.rol === 'facturacion') {
    return res.status(403).json({ error: 'Su perfil no consulta la agenda clínica.' });
  }

  res.json({ appointments: list, doctors: store.data.doctors, specialties: store.data.specialties });
});

router.get('/available-slots', requireAuth, (req, res) => {
  const { medico, fecha } = req.query;
  if (!medico || !isDate(fecha)) return res.status(400).json({ error: 'Debe indicar médico y fecha (AAAA-MM-DD)' });
  const booked = store.data.appointments
    .filter(a => a.med === medico && a.fecha === fecha && a.est !== 'Cancelada')
    .map(a => a.hora);
  res.json({ medico, fecha, availableSlots: HORARIOS.filter(h => !booked.includes(h)) });
});

// Agendar cita: SOLO el área de Administración / Admisiones agenda citas.
// Permite agendar a pacientes registrados o a personas nuevas (recopilando seguro, cédula, teléfono y datos completos).
// Si la cédula ya existe, vincula a su historia clínica previa; si es primera cita, genera su historia clínica.
router.post('/', ...requireRole('admin'), (req, res) => {
  const user = req.user;
  const {
    pacId,
    // Información personal del paciente
    nombre, tipoDoc = 'CC', doc, tel, email, direccion, eps, regimen, edad, fechaNacimiento, sexo,
    contactoEmergencia,
    // Datos de la cita médica
    esp, med, fecha, hora, motivo, canal = 'Recepción', triage = 'Verde'
  } = req.body || {};

  if (!esp || !med || !isDate(fecha) || !HORARIOS.includes(hora)) {
    return res.status(400).json({ error: 'Especialidad, médico tratante, fecha (AAAA-MM-DD) y hora válida son obligatorios.' });
  }

  // Buscar paciente por ID o por Cédula (sin puntos ni guiones)
  let patient = null;
  const cleanDoc = String(doc || '').trim();
  const digits = cleanDoc.replace(/\D/g, '');

  if (pacId) {
    patient = store.data.patients.find(p => p.id === pacId);
  }
  if (!patient && digits) {
    patient = store.data.patients.find(p => p.doc.replace(/\D/g, '') === digits);
  }

  let esPrimeraCita = false;

  // Si no existe, crear la historia clínica automáticamente
  if (!patient) {
    if (!isNonEmptyString(nombre) || !isNonEmptyString(cleanDoc) || !isNonEmptyString(tel)) {
      return res.status(400).json({
        error: 'Para un paciente nuevo debe registrar Nombre completo, Cédula/Documento y Teléfono de contacto.'
      });
    }

    patient = {
      id: nextId(store.data.patients, 'SD-'),
      tipoDoc: tipoDoc || 'CC',
      doc: cleanDoc,
      nombre: nombre.trim(),
      sexo: sexo || 'F',
      fechaNacimiento: fechaNacimiento || null,
      edad: Number(edad) || null,
      eps: eps || 'Particular / Sin EPS',
      regimen: regimen || 'Particular',
      tel: String(tel).trim(),
      email: email ? String(email).trim() : '',
      direccion: direccion ? String(direccion).trim() : '',
      contactoEmergencia: contactoEmergencia || { nombre: '', tel: '' },
      medico: med,
      estado: 'Activo',
      consentimientoDatos: true,
      fechaConsentimiento: new Date().toISOString(),
      alergias: [], antec: [], dx: [], meds: [],
      signos: { presion: '', fc: '', fr: '', temp: '', peso: '', talla: '', imc: '', satO2: '' },
      evol: [{
        fecha: new Date().toLocaleString('es-CO'),
        autor: user.nombre,
        tipo: 'Apertura de Expediente',
        nota: `Apertura de historia clínica por primera cita médica programada (${esp} con ${med}).`
      }]
    };

    store.data.patients.push(patient);
    esPrimeraCita = true;

    store.logAudit({
      usuario: user.user, rol: user.rol, accion: 'APERTURA_HISTORIA_CLINICA',
      detalle: `Expediente clínico ${patient.id} creado para ${patient.nombre} (Doc: ${patient.tipoDoc} ${patient.doc})`,
      pacienteId: patient.id, ip: req.ip
    });
  }

  // Verificar disponibilidad de horario del profesional
  const conflict = store.data.appointments.some(
    a => a.med === med && a.fecha === fecha && a.hora === hora && a.est !== 'Cancelada'
  );
  if (conflict) {
    return res.status(409).json({ error: 'El horario seleccionado ya no está disponible para este especialista.' });
  }

  const docRecord = store.data.doctors.find(d => d.n === med);
  const newApt = {
    id: nextId(store.data.appointments, 'apt-', 'id', 101),
    fecha, hora,
    pacId: patient.id,
    pacNombre: patient.nombre,
    pacDoc: `${patient.tipoDoc} ${patient.doc}`,
    pacTel: patient.tel,
    pacEps: patient.eps,
    esp, med,
    consultorio: docRecord ? docRecord.consultorio : 'Cons. General',
    est: 'Pendiente', // Inicia en Pendiente hasta que el paciente confirme llegada en recepción
    canal,
    motivo: isNonEmptyString(motivo) ? motivo.trim() : 'Consulta médica',
    triage,
    esPrimeraCita,
    creadoEn: new Date().toISOString(),
    checkInHora: null
  };
  store.data.appointments.push(newApt);

  // Cargo de consulta a facturación
  const chargeExists = store.data.invoices.some(i => i.pacId === patient.id && i.serv.includes(esp) && i.fecha === fecha);
  if (!chargeExists) {
    const valorTotal = esp !== 'Medicina general' ? 120000 : 85000;
    const copago = patient.regimen === 'Subsidiado' ? 0 : (patient.regimen === 'Particular' ? valorTotal : 12000);
    store.data.invoices.push({
      id: nextId(store.data.invoices, 'fac-'),
      fac: nextId(store.data.invoices.map(i => ({ id: i.fac })), 'FE-', 'id', 3400),
      pacId: patient.id,
      pacNombre: patient.nombre,
      doc: `${patient.tipoDoc} ${patient.doc}`,
      eps: patient.eps,
      serv: `Consulta ${esp}`,
      tipo: 'Consulta Médica',
      fecha,
      valorTotal,
      cubiertoEps: valorTotal - copago,
      copagoPaciente: copago,
      est: 'Por confirmar',
      metodoPago: null,
      conf: null
    });
  }

  store.save();
  store.logAudit({
    usuario: user.user, rol: user.rol, accion: 'AGENDAR_CITA',
    detalle: `Cita agendada para ${patient.nombre} (${patient.id}) con ${med} el ${fecha} a las ${hora}. Estado: Pendiente de confirmación.`,
    pacienteId: patient.id, ip: req.ip
  });

  res.status(201).json({
    success: true,
    appointment: newApt,
    esPrimeraCita,
    patientId: patient.id,
    message: esPrimeraCita ? 'Historia clínica creada y cita programada.' : 'Cita vinculada a historia clínica existente.'
  });
});

// Confirmar llegada del paciente en recepción (Check-in con Admin)
// Requisito indispensable para que el médico pueda atender
router.patch('/:id/checkin', ...requireRole('admin'), (req, res) => {
  const apt = store.data.appointments.find(a => a.id === req.params.id);
  if (!apt) return res.status(404).json({ error: 'Cita no encontrada.' });

  apt.est = 'Confirmada en Recepción';
  apt.checkInHora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  store.save();

  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'CHECKIN_PACIENTE',
    detalle: `Check-in realizado en recepción para ${apt.pacNombre} (Cita ${apt.id}). Listo para pasar con ${apt.med}.`,
    pacienteId: apt.pacId, ip: req.ip
  });

  res.json({
    success: true,
    appointment: apt,
    message: `Llegada confirmada. El paciente se encuentra en sala de espera y el médico ya puede atenderlo.`
  });
});

// Modificar estado de cita
router.patch('/:id/status', requireAuth, (req, res) => {
  const user = req.user;
  const apt = store.data.appointments.find(a => a.id === req.params.id);
  if (!apt) return res.status(404).json({ error: 'Cita no encontrada.' });

  const { est, motivoCancelacion } = req.body || {};
  if (!ESTADOS.includes(est)) return res.status(400).json({ error: 'Estado de cita inválido.' });

  // Reglas de negocio:
  // 1. Admin puede cambiar a cualquier estado
  // 2. Médicos y especialistas solo pueden cambiar sus citas a 'En consulta' o 'Atendida'
  const isDoctor = (user.rol === 'medico' || user.rol === 'especialista') && apt.med === user.nombre;
  const isAdmin = user.rol === 'admin';

  if (!isAdmin && !isDoctor) {
    return res.status(403).json({ error: 'No tiene permiso para modificar esta cita.' });
  }

  // Si el médico va a atender ('En consulta' o 'Atendida') pero el paciente sigue 'Pendiente', BLOQUEAR
  if (isDoctor && (est === 'En consulta' || est === 'Atendida') && apt.est === 'Pendiente') {
    return res.status(400).json({
      error: 'El paciente NO ha confirmado su llegada en recepción. El personal de admisiones debe realizar el check-in antes de que el médico pueda atenderlo.'
    });
  }

  const oldEst = apt.est;
  apt.est = est;
  if (motivoCancelacion) apt.motivoCancelacion = String(motivoCancelacion).slice(0, 300);
  if (est === 'Confirmada en Recepción' && !apt.checkInHora) {
    apt.checkInHora = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }
  if (est === 'Atendida') {
    apt.atendidaEn = new Date().toISOString();
  }

  store.save();
  store.logAudit({
    usuario: user.user, rol: user.rol, accion: 'CAMBIO_ESTADO_CITA',
    detalle: `Cita ${apt.id} actualizada de [${oldEst}] a [${est}] (${apt.pacNombre})`,
    pacienteId: apt.pacId, ip: req.ip
  });

  res.json({ success: true, appointment: apt });
});

router.delete('/:id', ...requireRole('admin'), (req, res) => {
  const idx = store.data.appointments.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Cita no encontrada.' });
  const [removed] = store.data.appointments.splice(idx, 1);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ELIMINAR_CITA',
    detalle: `Cita eliminada: ${removed.pacNombre} con ${removed.med} (${removed.fecha})`,
    pacienteId: removed.pacId, ip: req.ip
  });
  res.json({ success: true });
});

module.exports = router;
