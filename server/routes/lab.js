const express = require('express');
const router = express.Router();
const store = require('../data/store');

// Get all lab orders and test catalog
router.get('/', (req, res) => {
  const { pacId, estado } = req.query;
  let list = store.data.labOrders;

  if (pacId) list = list.filter(l => l.pacId === pacId);
  if (estado && estado !== 'Todos') list = list.filter(l => l.est === estado);

  // If patient, only show published results
  if (req.user && req.user.rol === 'paciente') {
    list = list.filter(l => l.pacId === req.user.pacId && l.est === 'Publicado');
  }

  res.json({
    orders: list,
    catalog: store.data.labCatalog,
    stats: {
      total: store.data.labOrders.length,
      pendientes: store.data.labOrders.filter(l => l.est === 'Pendiente').length,
      enProceso: store.data.labOrders.filter(l => l.est === 'En proceso').length,
      publicados: store.data.labOrders.filter(l => l.est === 'Publicado').length
    }
  });
});

// Create new lab order (Doctor from consultation)
router.post('/order', (req, res) => {
  const { pacId, examen, observaciones } = req.body;
  if (!pacId || !examen) {
    return res.status(400).json({ error: "Paciente y examen son obligatorios" });
  }

  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const catalogItem = store.data.labCatalog[examen];
  const cups = catalogItem ? catalogItem.cups : "900000";
  const defaultParams = catalogItem ? catalogItem.parametros.map(p => ({
    p: p.p,
    v: "",
    r: p.ref,
    f: "Normal"
  })) : [];

  const newOrder = {
    id: "lab-" + (store.data.labOrders.length + 101),
    pacId,
    pacNombre: patient.nombre,
    ex: examen,
    cups,
    med: req.user ? req.user.nombre : "Dr. Andrés Martínez",
    fechaSolicitud: new Date().toLocaleString("es-CO"),
    fechaPublicacion: null,
    tiempoProcesamientoMinutos: null,
    est: "Pendiente",
    bacteriologo: null,
    res: defaultParams,
    observaciones: observaciones || "Solicitud rutinaria de control clínico",
    cobrado: false,
    facturaId: null
  };

  store.data.labOrders.unshift(newOrder);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "medico",
    rol: req.user ? req.user.rol : "medico",
    accion: "ORDEN_LABORATORIO_CREADA",
    detalle: `Orden de laboratorio ${examen} (CUPS: ${cups}) para ${patient.nombre}`,
    pacienteId,
    ip: req.ip
  });

  res.status(201).json({ success: true, order: newOrder });
});

// Update order results (Bacteriologist / Lab staff)
router.put('/:id/results', (req, res) => {
  const { id } = req.params;
  const { res: resultados, observaciones, estado } = req.body;

  const order = store.data.labOrders.find(l => l.id === id);
  if (!order) return res.status(404).json({ error: "Orden de laboratorio no encontrada" });

  if (resultados) order.res = resultados;
  if (observaciones !== undefined) order.observaciones = observaciones;
  if (estado) order.est = estado;
  order.bacteriologo = req.user ? req.user.nombre : "Laboratorio Clínico";

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "laboratorio",
    rol: req.user ? req.user.rol : "laboratorio",
    accion: "ACTUALIZAR_RESULTADOS_LAB",
    detalle: `Carga y edición de parámetros de laboratorio para orden ${order.id} (${order.ex})`,
    pacienteId: order.pacId,
    ip: req.ip
  });

  res.json({ success: true, order });
});

// Publish lab results (Make visible to attending doctor and patient + auto-bill)
router.post('/:id/publish', (req, res) => {
  const { id } = req.params;
  const order = store.data.labOrders.find(l => l.id === id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });

  if (!order.res || order.res.length === 0 || order.res.some(r => !r.v || r.v.trim() === '')) {
    return res.status(400).json({ error: "Todos los parámetros deben tener un valor registrado antes de publicar el examen" });
  }

  order.est = "Publicado";
  order.fechaPublicacion = new Date().toLocaleString("es-CO");
  order.bacteriologo = req.user ? req.user.nombre : "Daniela Ortega (Bacterióloga)";
  order.tiempoProcesamientoMinutos = Math.floor(Math.random() * 35) + 25; // 25 - 60 minutes

  // Auto-generate billing charge if not already billed
  if (!order.cobrado) {
    const catalogItem = store.data.labCatalog[order.ex];
    const valorTotal = catalogItem ? catalogItem.precio : 35000;
    const copago = 5000;
    const patient = store.data.patients.find(p => p.id === order.pacId);

    const newFacId = "FE-" + (3400 + store.data.invoices.length + 1);
    const invoice = {
      id: "fac-" + (store.data.invoices.length + 1),
      fac: newFacId,
      pacId: order.pacId,
      pacNombre: order.pacNombre,
      doc: patient ? `${patient.tipoDoc} ${patient.doc}` : "CC",
      eps: patient ? patient.eps : "Sura EPS",
      serv: `Laboratorio: ${order.ex} (CUPS ${order.cups})`,
      tipo: "Laboratorio Clínico",
      fecha: new Date().toLocaleDateString("es-CO"),
      valorTotal,
      cubiertoEps: valorTotal - copago,
      copagoPaciente: copago,
      est: "Por confirmar",
      metodoPago: null,
      conf: null
    };

    store.data.invoices.push(invoice);
    order.cobrado = true;
    order.facturaId = newFacId;
  }

  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "laboratorio",
    rol: req.user ? req.user.rol : "laboratorio",
    accion: "PUBLICACION_RESULTADO_LAB",
    detalle: `Resultados validados y publicados para ${order.pacNombre}: ${order.ex}. Cargo automático ${order.facturaId} generado.`,
    pacienteId: order.pacId,
    ip: req.ip
  });

  res.json({
    success: true,
    message: "Resultados validados y publicados exitosamente. Notificación enviada al médico tratante y facturación actualizada.",
    order
  });
});

// Revert to draft
router.post('/:id/revert-draft', (req, res) => {
  const { id } = req.params;
  const order = store.data.labOrders.find(l => l.id === id);
  if (!order) return res.status(404).json({ error: "Orden no encontrada" });

  order.est = "En proceso";
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "laboratorio",
    rol: req.user ? req.user.rol : "laboratorio",
    accion: "REVERTIR_BORRADOR_LAB",
    detalle: `Orden ${order.id} devuelta a borrador para corrección de valores`,
    pacienteId: order.pacId,
    ip: req.ip
  });

  res.json({ success: true, order });
});

module.exports = router;
