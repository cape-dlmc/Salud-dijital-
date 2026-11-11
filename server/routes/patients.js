const express = require('express');
const router = express.Router();
const store = require('../data/store');

// Get patients list based on role
router.get('/', (req, res) => {
  const user = req.user;
  const search = (req.query.q || '').trim().toLowerCase();

  let list = store.data.patients;

  // Search filter
  if (search) {
    list = list.filter(p =>
      p.nombre.toLowerCase().includes(search) ||
      p.doc.toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search) ||
      p.eps.toLowerCase().includes(search)
    );
  }

  // Sanitized view according to RBAC
  if (user && user.rol === 'admin') {
    // Admin sees administrative and demographic data, NO clinical diagnoses
    const adminView = list.map(p => ({
      id: p.id,
      tipoDoc: p.tipoDoc,
      doc: p.doc,
      nombre: p.nombre,
      edad: p.edad,
      eps: p.eps,
      regimen: p.regimen,
      tel: p.tel,
      medico: p.medico,
      estado: p.estado,
      consentimientoHabeasData: p.consentimientoHabeasData
    }));
    return res.json({ patients: adminView });
  }

  if (user && user.rol === 'medico') {
    // Doctor sees assigned patients + check if break glass exists
    const doctorName = user.nombre;
    const activeEmergencies = store.data.emergencyAccesses.filter(
      e => e.usuario === user.user && new Date(e.expira) > new Date()
    );

    const doctorView = list.map(p => {
      const isMine = p.medico === doctorName;
      const hasEmergency = activeEmergencies.some(e => e.pacienteId === p.id);
      return {
        ...p,
        esMiPaciente: isMine,
        tieneAccesoEmergencia: hasEmergency
      };
    });
    return res.json({ patients: doctorView });
  }

  if (user && user.rol === 'paciente') {
    // Patient can only see their own record
    const myRecord = list.filter(p => p.id === user.pacId);
    return res.json({ patients: myRecord });
  }

  // Other roles (laboratorio, farmacia, facturacion, gerencia)
  res.json({ patients: list });
});

// Get single patient by ID with full clinical record or administrative view
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const user = req.user;

  // Log clinical access for audit (Ley 1581)
  if (user) {
    store.logAudit({
      usuario: user.user,
      rol: user.rol,
      accion: "CONSULTA_PACIENTE",
      detalle: `Consulta de expediente clínico para paciente ${patient.nombre} (${patient.id})`,
      pacienteId: patient.id,
      ip: req.ip
    });
  }

  // Associated lab results
  const labs = store.data.labOrders.filter(l => l.pacId === id);
  // Associated prescriptions
  const prescriptions = store.data.pharmacyOrders.filter(f => f.pacId === id);
  // Associated appointments
  const appointments = store.data.appointments.filter(a => a.pacId === id);
  // Associated invoices
  const invoices = store.data.invoices.filter(i => i.pacId === id);

  res.json({
    patient,
    labs,
    prescriptions,
    appointments,
    invoices
  });
});

// Create new patient (Admin / Admissions)
router.post('/', (req, res) => {
  const { nombre, tipoDoc, doc, edad, fechaNacimiento, sexo, eps, regimen, tel, email, direccion, medico, consentimientoHabeasData } = req.body;

  if (!nombre || !doc) {
    return res.status(400).json({ error: "Nombre completo y documento son obligatorios" });
  }

  if (!consentimientoHabeasData) {
    return res.status(400).json({ error: "Se requiere la aceptación expresa del consentimiento de Habeas Data (Ley 1581 de 2012)" });
  }

  // Check duplicate doc
  if (store.data.patients.some(p => p.doc.replace(/\D/g, '') === doc.replace(/\D/g, ''))) {
    return res.status(400).json({ error: "Ya existe un paciente con este número de documento en la clínica" });
  }

  const nextNum = 10400 + store.data.patients.length + 1;
  const newId = `SD-${nextNum}`;

  const newPatient = {
    id: newId,
    tipoDoc: tipoDoc || "CC",
    doc,
    nombre,
    sexo: sexo || "M",
    fechaNacimiento: fechaNacimiento || "1990-01-01",
    edad: edad || 30,
    eps: eps || "Sura EPS",
    regimen: regimen || "Contributivo",
    tel: tel || "300 000 0000",
    email: email || `${doc}@paciente.saluddigital.com`,
    direccion: direccion || "Medellín, Colombia",
    contactoEmergencia: { nombre: "Familiar responsable", tel: tel || "300 000 0000" },
    medico: medico || (store.data.doctors[0] ? store.data.doctors[0].n : "Dr. Andrés Martínez"),
    estado: "Activo",
    consentimientoHabeasData: true,
    fechaConsentimiento: new Date().toISOString(),
    alergias: [],
    antec: [],
    dx: [],
    meds: [],
    signos: {
      presion: "120/80",
      fc: "72 lpm",
      fr: "16 rpm",
      temp: "36.5 °C",
      peso: "70 kg",
      talla: "1.70 m",
      imc: "24.2 (Normal)",
      satO2: "98 %"
    },
    evol: [
      {
        fecha: new Date().toLocaleString("es-CO"),
        autor: req.user ? req.user.nombre : "Admisiones",
        tipo: "Ingreso al sistema",
        nota: "Paciente registrado en SaludDigital con consentimiento de protección de datos firmado."
      }
    ]
  };

  store.data.patients.push(newPatient);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "REGISTRO_PACIENTE",
    detalle: `Admisión de nuevo paciente ${newPatient.nombre} con ID ${newPatient.id} y consent. Ley 1581`,
    pacienteId: newPatient.id,
    ip: req.ip
  });

  res.status(201).json({ success: true, patient: newPatient });
});

// Update assigned doctor
router.patch('/:id/doctor', (req, res) => {
  const { id } = req.params;
  const { medico } = req.body;

  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const oldDoc = patient.medico;
  patient.medico = medico;
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "admin",
    rol: req.user ? req.user.rol : "admin",
    accion: "REASIGNAR_MEDICO",
    detalle: `Cambio de médico tratante para ${patient.nombre}: de ${oldDoc} a ${medico}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.json({ success: true, patient });
});

// Add evolution note (SOEP format)
router.post('/:id/evolution', (req, res) => {
  const { id } = req.params;
  const { nota, tipo = "Nota de evolución" } = req.body;

  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const autor = req.user ? req.user.nombre : "Médico tratante";

  const newNote = {
    fecha: new Date().toLocaleString("es-CO"),
    autor,
    tipo,
    nota
  };

  patient.evol.unshift(newNote);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "REGISTRO_EVOLUCION",
    detalle: `Nueva nota de evolución clínica agregada por ${autor}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.json({ success: true, evolution: patient.evol });
});

// Add diagnosis (CIE-10)
router.post('/:id/diagnoses', (req, res) => {
  const { id } = req.params;
  const { diagnostico } = req.body;

  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  if (!diagnostico) return res.status(400).json({ error: "El diagnóstico no puede estar vacío" });

  patient.dx.push(diagnostico);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "AGREGAR_DIAGNOSTICO",
    detalle: `Diagnóstico CIE-10 agregado: ${diagnostico}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.json({ success: true, diagnoses: patient.dx });
});

// Delete diagnosis
router.delete('/:id/diagnoses/:index', (req, res) => {
  const { id, index } = req.params;
  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const idx = parseInt(index, 10);
  if (isNaN(idx) || idx < 0 || idx >= patient.dx.length) {
    return res.status(400).json({ error: "Índice de diagnóstico inválido" });
  }

  const removed = patient.dx.splice(idx, 1)[0];
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "ELIMINAR_DIAGNOSTICO",
    detalle: `Diagnóstico eliminado: ${removed}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.json({ success: true, diagnoses: patient.dx });
});

// Update vital signs
router.patch('/:id/vitals', (req, res) => {
  const { id } = req.params;
  const { presion, fc, fr, temp, peso, talla, satO2 } = req.body;

  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  // Calculate BMI if height and weight are provided
  let imcText = patient.signos.imc;
  const pNum = parseFloat(peso);
  const tNum = parseFloat(talla);
  if (!isNaN(pNum) && !isNaN(tNum) && tNum > 0) {
    const imcVal = (pNum / (tNum * tNum)).toFixed(1);
    let cat = "Normal";
    if (imcVal < 18.5) cat = "Bajo peso";
    else if (imcVal >= 25 && imcVal < 30) cat = "Sobrepeso";
    else if (imcVal >= 30) cat = "Obesidad";
    imcText = `${imcVal} (${cat})`;
  }

  patient.signos = {
    presion: presion || patient.signos.presion,
    fc: fc ? `${fc} lpm` : patient.signos.fc,
    fr: fr ? `${fr} rpm` : patient.signos.fr,
    temp: temp ? `${temp} °C` : patient.signos.temp,
    peso: peso ? `${peso} kg` : patient.signos.peso,
    talla: talla ? `${talla} m` : patient.signos.talla,
    imc: imcText,
    satO2: satO2 ? `${satO2} %` : patient.signos.satO2
  };

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "ACTUALIZAR_SIGNOS_VITALES",
    detalle: `Signos vitales actualizados: TA=${patient.signos.presion}, FC=${patient.signos.fc}, SatO2=${patient.signos.satO2}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.json({ success: true, signos: patient.signos });
});

// Break-Glass Emergency Access (Document Section 4: Acceso de Emergencia)
router.post('/:id/emergency-break-glass', (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;

  const patient = store.data.patients.find(p => p.id === id);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  if (!motivo) {
    return res.status(400).json({ error: "El motivo clínico de emergencia es de carácter obligatorio" });
  }

  const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes access

  const record = {
    id: "brk-" + Date.now(),
    pacienteId: id,
    pacienteNombre: patient.nombre,
    usuario: req.user ? req.user.user : "medico.emergencia",
    medicoNombre: req.user ? req.user.nombre : "Médico Urgencias",
    motivo,
    timestamp: new Date().toISOString(),
    expira,
    ip: req.ip
  };

  store.data.emergencyAccesses.push(record);
  store.save();

  // High priority security audit entry
  store.logAudit({
    usuario: record.usuario,
    rol: req.user ? req.user.rol : "medico",
    accion: "ACCESO_EMERGENCIA_ACTIVADO",
    detalle: `¡ALERTA DE SEGURIDAD! Acceso de emergencia activado por 30 minutos para paciente ${patient.nombre} (${patient.id}). Motivo: ${motivo}`,
    pacienteId: id,
    ip: req.ip
  });

  res.json({
    success: true,
    message: "Acceso de emergencia concedido por 30 minutos. Esta sesión está siendo auditada por el comité de privacidad.",
    record
  });
});

module.exports = router;
