const express = require('express');
const router = express.Router();
const store = require('../data/store');

const HORARIOS_ESTANDAR = [
  "07:30", "08:00", "08:30", "09:00", "09:30", "10:00",
  "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"
];

// Get appointments with filtering
router.get('/', (req, res) => {
  const { fecha, medico, pacId, estado } = req.query;
  let list = store.data.appointments;

  if (fecha) list = list.filter(a => a.fecha === fecha);
  if (medico) list = list.filter(a => a.med === medico);
  if (pacId) list = list.filter(a => a.pacId === pacId);
  if (estado) list = list.filter(a => a.est === estado);

  // If logged in as patient, only return their appointments
  if (req.user && req.user.rol === 'paciente') {
    list = list.filter(a => a.pacId === req.user.pacId);
  }

  res.json({ appointments: list, doctors: store.data.doctors, specialties: store.data.specialties });
});

// Check available slots for a doctor on a specific date
router.get('/available-slots', (req, res) => {
  const { medico, fecha } = req.query;
  if (!medico || !fecha) {
    return res.status(400).json({ error: "Debe especificar médico y fecha" });
  }

  const bookedHours = store.data.appointments
    .filter(a => a.med === medico && a.fecha === fecha && a.est !== 'Cancelada')
    .map(a => a.hora);

  const available = HORARIOS_ESTANDAR.filter(h => !bookedHours.includes(h));
  res.json({ medico, fecha, availableSlots: available });
});

// Create appointment (Admin or Patient via App)
router.post('/', (req, res) => {
  const { pacId, esp, med, fecha, hora, motivo, canal = "Recepción", triage = "Verde" } = req.body;

  if (!pacId || !esp || !med || !fecha || !hora) {
    return res.status(400).json({ error: "Todos los campos de la cita son obligatorios" });
  }

  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  // Conflict check
  const conflict = store.data.appointments.some(
    a => a.med === med && a.fecha === fecha && a.hora === hora && a.est !== 'Cancelada'
  );
  if (conflict) {
    return res.status(409).json({ error: "El horario seleccionado ya no está disponible para este especialista" });
  }

  const docObj = store.data.doctors.find(d => d.n === med);
  const consultorio = docObj ? docObj.consultorio : "Cons. General";

  const newApt = {
    id: "apt-" + (store.data.appointments.length + 101),
    fecha,
    hora,
    pacId,
    pacNombre: patient.nombre,
    esp,
    med,
    consultorio,
    est: "Confirmada",
    canal,
    motivo: motivo || "Consulta médica general/especializada",
    triage
  };

  store.data.appointments.push(newApt);

  // Auto-generate appointment fee charge in billing if applicable
  const chargeExists = store.data.invoices.some(i => i.pacId === pacId && i.serv.includes(esp) && i.fecha === fecha);
  if (!chargeExists) {
    const isSpecialist = esp !== "Medicina general";
    const valorTotal = isSpecialist ? 120000 : 85000;
    const copago = 10000;
    store.data.invoices.push({
      id: "fac-" + (store.data.invoices.length + 1),
      fac: "FE-" + (3400 + store.data.invoices.length + 1),
      pacId: patient.id,
      pacNombre: patient.nombre,
      doc: `${patient.tipoDoc} ${patient.doc}`,
      eps: patient.eps,
      serv: `Consulta ${esp}`,
      tipo: "Consulta Médica",
      fecha,
      valorTotal,
      cubiertoEps: valorTotal - copago,
      copagoPaciente: copago,
      est: "Por confirmar",
      metodoPago: null,
      conf: null
    });
  }

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "paciente",
    rol: req.user ? req.user.rol : "paciente",
    accion: "AGENDAR_CITA",
    detalle: `Cita agendada para ${patient.nombre} con ${med} (${esp}) el ${fecha} a las ${hora} vía ${canal}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.status(201).json({ success: true, appointment: newApt });
});

// Update appointment status
router.patch('/:id/status', (req, res) => {
  const { id } = req.params;
  const { est, motivoCancelacion } = req.body;

  const apt = store.data.appointments.find(a => a.id === id);
  if (!apt) return res.status(404).json({ error: "Cita no encontrada" });

  const oldEst = apt.est;
  apt.est = est;
  if (motivoCancelacion) apt.motivoCancelacion = motivoCancelacion;
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "sistema",
    rol: req.user ? req.user.rol : "sistema",
    accion: "CAMBIO_ESTADO_CITA",
    detalle: `Estado de cita ${apt.id} modificado: de ${oldEst} a ${est} (${apt.pacNombre})`,
    pacienteId: apt.pacId,
    ip: req.ip
  });

  res.json({ success: true, appointment: apt });
});

// Delete / remove appointment
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const idx = store.data.appointments.findIndex(a => a.id === id);
  if (idx === -1) return res.status(404).json({ error: "Cita no encontrada" });

  const removed = store.data.appointments.splice(idx, 1)[0];
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "ELIMINAR_CITA",
    detalle: `Cita eliminada de la agenda: ${removed.pacNombre} - ${removed.med} (${removed.fecha})`,
    pacienteId: removed.pacId,
    ip: req.ip
  });

  res.json({ success: true });
});

module.exports = router;
