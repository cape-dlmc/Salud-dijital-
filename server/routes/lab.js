const express = require('express');
const store = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');
const { canWriteClinical } = require('../lib/access');
const { isNonEmptyString, nextId } = require('../lib/validate');

const router = express.Router();

// Laboratorio ve todas las órdenes; médicos y especialistas ven las de sus pacientes
router.get('/', ...requireRole('laboratorio', 'medico', 'especialista', 'admin'), (req, res) => {
  const { pacId, estado } = req.query;
  let list = store.data.labOrders;
  if (pacId) list = list.filter(l => l.pacId === pacId);
  if (estado && estado !== 'Todos') list = list.filter(l => l.est === estado);

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

// Orden de laboratorio desde consulta (médico tratante o especialista con paciente asignado o emergencia)
router.post('/order', ...requireRole('medico', 'especialista'), (req, res) => {
  const { pacId, examen, observaciones } = req.body || {};
  if (!isNonEmptyString(pacId) || !isNonEmptyString(examen)) {
    return res.status(400).json({ error: 'Paciente y examen son obligatorios' });
  }
  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });

  const item = store.data.labCatalog[examen];
  if (!item) return res.status(400).json({ error: 'El examen no existe en el catálogo' });

  const order = {
    id: nextId(store.data.labOrders, 'lab-', 'id', 101),
    pacId,
    pacNombre: patient.nombre,
    ex: examen,
    cups: item.cups,
    med: req.user.nombre,
    fechaSolicitud: new Date().toLocaleString('es-CO'),
    solicitadoEn: new Date().toISOString(),
    fechaPublicacion: null,
    tiempoProcesamientoMinutos: null,
    est: 'Pendiente',
    bacteriologo: null,
    res: item.parametros.map(p => ({ p: p.p, v: '', r: p.ref, f: 'Normal' })),
    observaciones: isNonEmptyString(observaciones) ? observaciones.trim() : 'Solicitud de control clínico',
    cobrado: false,
    facturaId: null
  };
  store.data.labOrders.unshift(order);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ORDEN_LABORATORIO_CREADA',
    detalle: `Orden de laboratorio ${examen} (CUPS ${order.cups}) para ${patient.nombre}`, pacienteId: pacId, ip: req.ip
  });
  res.status(201).json({ success: true, order });
});

// Captura o corrección de valores (laboratorio)
router.put('/:id/results', ...requireRole('laboratorio'), (req, res) => {
  const order = store.data.labOrders.find(l => l.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden de laboratorio no encontrada' });
  if (order.est === 'Publicado') return res.status(409).json({ error: 'El resultado ya fue publicado. Devuélvalo a borrador para corregirlo.' });

  const { res: resultados, observaciones, estado } = req.body || {};
  if (Array.isArray(resultados)) order.res = resultados;
  if (typeof observaciones === 'string') order.observaciones = observaciones;
  if (estado === 'En proceso' || estado === 'Pendiente') order.est = estado;
  order.bacteriologo = req.user.nombre;
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ACTUALIZAR_RESULTADOS_LAB',
    detalle: `Captura de parámetros para orden ${order.id} (${order.ex})`, pacienteId: order.pacId, ip: req.ip
  });
  res.json({ success: true, order });
});

// Publicación: todos los parámetros deben tener valor. Genera el cargo a facturación una sola vez.
router.post('/:id/publish', ...requireRole('laboratorio'), (req, res) => {
  const order = store.data.labOrders.find(l => l.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  if (!order.res || order.res.length === 0 || order.res.some(r => !r.v || String(r.v).trim() === '')) {
    return res.status(400).json({ error: 'Todos los parámetros deben tener un valor registrado antes de publicar el examen' });
  }

  const now = Date.now();
  order.est = 'Publicado';
  order.fechaPublicacion = new Date(now).toLocaleString('es-CO');
  order.bacteriologo = req.user.nombre;
  // Tiempo real entre solicitud y publicación (si la orden tiene fecha ISO)
  order.tiempoProcesamientoMinutos = order.solicitadoEn
    ? Math.max(1, Math.round((now - new Date(order.solicitadoEn).getTime()) / 60000))
    : null;

  let invoiceNote = 'El cargo ya existía en facturación.';
  if (!order.cobrado) {
    const item = store.data.labCatalog[order.ex];
    const valorTotal = item ? item.precio : 35000;
    const copago = 5000;
    const patient = store.data.patients.find(p => p.id === order.pacId);
    const fac = nextId(store.data.invoices.map(i => ({ id: i.fac })), 'FE-', 'id', 3400);
    store.data.invoices.push({
      id: nextId(store.data.invoices, 'fac-'),
      fac,
      pacId: order.pacId,
      pacNombre: order.pacNombre,
      doc: patient ? `${patient.tipoDoc} ${patient.doc}` : '',
      eps: patient ? patient.eps : '',
      serv: `Laboratorio: ${order.ex} (CUPS ${order.cups})`,
      tipo: 'Laboratorio Clínico',
      fecha: new Date(now).toLocaleDateString('es-CO'),
      valorTotal, cubiertoEps: valorTotal - copago, copagoPaciente: copago,
      est: 'Por confirmar', metodoPago: null, conf: null
    });
    order.cobrado = true;
    order.facturaId = fac;
    invoiceNote = `Cargo ${fac} generado para facturación.`;
  }
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'PUBLICACION_RESULTADO_LAB',
    detalle: `Resultados publicados para ${order.pacNombre}: ${order.ex}. ${invoiceNote}`, pacienteId: order.pacId, ip: req.ip
  });
  res.json({ success: true, message: 'Resultados publicados. Quedan disponibles para el médico tratante y el paciente.', order });
});

router.post('/:id/revert-draft', ...requireRole('laboratorio'), (req, res) => {
  const order = store.data.labOrders.find(l => l.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Orden no encontrada' });
  order.est = 'En proceso';
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'REVERTIR_BORRADOR_LAB',
    detalle: `Orden ${order.id} devuelta a borrador para corrección`, pacienteId: order.pacId, ip: req.ip
  });
  res.json({ success: true, order });
});

module.exports = router;
