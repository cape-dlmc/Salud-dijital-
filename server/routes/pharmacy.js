const express = require('express');
const router = express.Router();
const store = require('../data/store');

// Get pharmacy orders and medication catalog
router.get('/', (req, res) => {
  const { pacId, estado } = req.query;
  let orders = store.data.pharmacyOrders;

  if (pacId) orders = orders.filter(f => f.pacId === pacId);
  if (estado && estado !== 'Todos') orders = orders.filter(f => f.est === estado);

  // If patient, only return their prescriptions
  if (req.user && req.user.rol === 'paciente') {
    orders = orders.filter(f => f.pacId === req.user.pacId);
  }

  const lowStockCount = store.data.medsCatalog.filter(m => m.stock < m.min).length;

  res.json({
    orders,
    catalog: store.data.medsCatalog,
    stats: {
      totalRecetas: store.data.pharmacyOrders.length,
      pendientes: store.data.pharmacyOrders.filter(f => f.est === 'Pendiente').length,
      parciales: store.data.pharmacyOrders.filter(f => f.est === 'Parcial').length,
      dispensadas: store.data.pharmacyOrders.filter(f => f.est === 'Dispensado').length,
      stockCritico: lowStockCount
    }
  });
});

// Create prescription from doctor consultation with Clinical Decision Support (Allergy check)
router.post('/prescribe', (req, res) => {
  const { pacId, medicamento, dosis, frecuencia, duracion } = req.body;

  if (!pacId || !medicamento) {
    return res.status(400).json({ error: "Paciente y medicamento son obligatorios" });
  }

  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const medItem = store.data.medsCatalog.find(m => m.n.toLowerCase().includes(medicamento.toLowerCase()));

  // Clinical Decision Support (CDS): Allergy conflict check
  let allergyWarning = null;
  if (patient.alergias && patient.alergias.length > 0) {
    for (const allergy of patient.alergias) {
      const aLower = allergy.toLowerCase();
      const mLower = medicamento.toLowerCase();
      if (
        (aLower.includes("penicilina") && (mLower.includes("amoxicilina") || mLower.includes("ampicilina"))) ||
        (aLower.includes("aines") && (mLower.includes("ibuprofeno") || mLower.includes("naproxeno") || mLower.includes("aspirina"))) ||
        (aLower.includes("sulf") && (mLower.includes("trimetoprim") || mLower.includes("sulfametoxazol"))) ||
        mLower.includes(aLower)
      ) {
        allergyWarning = `ALERTA CLÍNICA (CDS): El paciente tiene antecedente alérgico registrado a [${allergy}]. Posible reacción cruzada con [${medicamento}].`;
        break;
      }
    }
  }

  const newRx = {
    id: "rx-" + (store.data.pharmacyOrders.length + 201),
    pacId,
    pacNombre: patient.nombre,
    med: medItem ? medItem.n : medicamento,
    pres: medItem ? medItem.pres : "Presentación clínica estándar",
    dosis: dosis || "Según indicación médica",
    frec: frecuencia || "Cada 24 horas",
    duracion: duracion || "10 días",
    prof: req.user ? req.user.nombre : "Dr. Andrés Martínez",
    fechaOrden: new Date().toLocaleString("es-CO"),
    est: "Pendiente",
    advertenciaCDS: allergyWarning,
    entrega: null
  };

  store.data.pharmacyOrders.unshift(newRx);

  // Add to active patient medications if not present
  const medSummary = `${newRx.med} ${newRx.dosis}, ${newRx.frec}`;
  if (!patient.meds.some(m => m.toLowerCase().includes(newRx.med.toLowerCase()))) {
    patient.meds.push(medSummary);
  }

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "PRESCRIPCION_EMITIDA",
    detalle: `Fórmula electrónica emitida: ${newRx.med} (${newRx.dosis}) para ${patient.nombre}. ${allergyWarning ? '[ALERTA CDS DETECTADA]' : ''}`,
    pacienteId,
    ip: req.ip
  });

  res.status(201).json({
    success: true,
    prescription: newRx,
    allergyWarning
  });
});

// Dispense prescription (Pharmacist)
router.post('/:id/dispense', (req, res) => {
  const { id } = req.params;
  const { tipoEntrega, cantEntregada, recibeNombre, recibeDoc, parentesco, observacion } = req.body;

  const order = store.data.pharmacyOrders.find(f => f.id === id);
  if (!order) return res.status(404).json({ error: "Prescripción no encontrada" });

  if (!recibeNombre || !recibeDoc) {
    return res.status(400).json({ error: "Debe registrar nombre y documento de la persona que recibe el medicamento" });
  }

  const medItem = store.data.medsCatalog.find(m => m.n.toLowerCase().includes(order.med.toLowerCase()));
  const cant = parseInt(cantEntregada, 10) || 30;

  // Inventory decrement
  if (medItem) {
    if (medItem.stock < cant && tipoEntrega !== 'Cancelado') {
      return res.status(400).json({
        error: `Existencias insuficientes en inventario. Stock actual: ${medItem.stock}. Solicite reabastecimiento o realice entrega parcial.`
      });
    }
    medItem.stock = Math.max(0, medItem.stock - cant);
  }

  let finalEst = "Dispensado";
  if (tipoEntrega === 'Parcial') finalEst = "Parcial";
  if (tipoEntrega === 'Cancelado') finalEst = "Cancelado";

  order.est = finalEst;
  order.entrega = {
    por: req.user ? req.user.nombre : "Esteban Rojas (Químico Farmacéutico)",
    recibe: recibeNombre,
    doc: recibeDoc,
    rel: parentesco || "El mismo paciente",
    fecha: new Date().toLocaleString("es-CO"),
    cantEntregada: cant,
    lote: medItem ? medItem.lote : "L-GLOBAL",
    observacion: observacion || ""
  };

  // If dispensed, generate billing charge for the medication
  if (finalEst !== 'Cancelado') {
    const precio = medItem ? medItem.precio : 15000;
    const patient = store.data.patients.find(p => p.id === order.pacId);
    const newFacId = "FE-" + (3400 + store.data.invoices.length + 1);

    store.data.invoices.push({
      id: "fac-" + (store.data.invoices.length + 1),
      fac: newFacId,
      pacId: order.pacId,
      pacNombre: order.pacNombre,
      doc: patient ? `${patient.tipoDoc} ${patient.doc}` : "CC",
      eps: patient ? patient.eps : "Sura EPS",
      serv: `Medicamento: ${order.med} (${cant} unidades)`,
      tipo: "Farmacia",
      fecha: new Date().toLocaleDateString("es-CO"),
      valorTotal: precio,
      cubiertoEps: precio,
      copagoPaciente: 0,
      est: "Por confirmar",
      metodoPago: null,
      conf: null
    });
  }

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "farmacia",
    rol: req.user ? req.user.rol : "farmacia",
    accion: "DISPENSACION_FARMACIA",
    detalle: `Dispensación de ${order.med} (${cant} un.) a ${recibeNombre} (${recibeDoc}). Estado: ${finalEst}`,
    pacienteId: order.pacId,
    ip: req.ip
  });

  res.json({
    success: true,
    message: "Dispensación registrada correctamente y enviada a facturación institucional",
    order
  });
});

// Update drug stock (Inventory reorder)
router.patch('/inventory/:id/stock', (req, res) => {
  const { id } = req.params;
  const { cantidad } = req.body;

  const med = store.data.medsCatalog.find(m => m.id === id);
  if (!med) return res.status(404).json({ error: "Medicamento no encontrado" });

  const addQty = parseInt(cantidad, 10);
  if (isNaN(addQty)) return res.status(400).json({ error: "Cantidad inválida" });

  med.stock += addQty;
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "farmacia",
    rol: req.user ? req.user.rol : "farmacia",
    accion: "AJUSTE_INVENTARIO",
    detalle: `Reabastecimiento de ${med.n}: +${addQty} unidades (Nuevo total: ${med.stock})`,
    ip: req.ip
  });

  res.json({ success: true, med });
});

module.exports = router;
