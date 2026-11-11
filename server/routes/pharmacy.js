const express = require('express');
const store = require('../data/store');
const { requireRole } = require('../middleware/auth');
const { canWriteClinical } = require('../lib/access');
const { isNonEmptyString, isPositiveInt, nextId } = require('../lib/validate');

const router = express.Router();

router.get('/', ...requireRole('farmacia', 'medico', 'especialista', 'admin'), (req, res) => {
  const { pacId, estado } = req.query;
  let orders = store.data.pharmacyOrders;
  if (pacId) orders = orders.filter(f => f.pacId === pacId);
  if (estado && estado !== 'Todos') orders = orders.filter(f => f.est === estado);

  res.json({
    orders,
    catalog: store.data.medsCatalog,
    stats: {
      totalRecetas: store.data.pharmacyOrders.length,
      pendientes: store.data.pharmacyOrders.filter(f => f.est === 'Pendiente').length,
      parciales: store.data.pharmacyOrders.filter(f => f.est === 'Parcial').length,
      dispensadas: store.data.pharmacyOrders.filter(f => f.est === 'Dispensado').length,
      stockCritico: store.data.medsCatalog.filter(m => m.stock < m.min).length
    }
  });
});

// Prescripción electrónica con verificación de alergias (médico o especialista)
router.post('/prescribe', ...requireRole('medico', 'especialista'), (req, res) => {
  const { pacId, medicamento, dosis, frecuencia, duracion } = req.body || {};
  if (!isNonEmptyString(pacId) || !isNonEmptyString(medicamento)) {
    return res.status(400).json({ error: 'Paciente y medicamento son obligatorios' });
  }
  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });
  if (!canWriteClinical(req.user, patient)) return res.status(403).json({ error: 'No tiene asignado este paciente.' });

  const medItem = store.data.medsCatalog.find(m => m.n.toLowerCase().includes(medicamento.toLowerCase()));
  const med = medItem ? medItem.n : medicamento.trim();
  const mLower = med.toLowerCase();

  let allergyWarning = null;
  for (const allergy of patient.alergias || []) {
    const a = allergy.toLowerCase();
    const crossReaction =
      (a.includes('penicilina') && (mLower.includes('amoxicilina') || mLower.includes('ampicilina'))) ||
      (a.includes('aines') && (mLower.includes('ibuprofeno') || mLower.includes('naproxeno') || mLower.includes('aspirina'))) ||
      (a.includes('sulf') && (mLower.includes('trimetoprim') || mLower.includes('sulfametoxazol'))) ||
      mLower.includes(a);
    if (crossReaction) {
      allergyWarning = `Alerta: el paciente tiene registrada una alergia a ${allergy}. Revise la posible reacción con ${med}.`;
      break;
    }
  }

  const newRx = {
    id: nextId(store.data.pharmacyOrders, 'rx-', 'id', 201),
    pacId,
    pacNombre: patient.nombre,
    med,
    pres: medItem ? medItem.pres : 'Presentación estándar',
    dosis: dosis || 'Según indicación médica',
    frec: frecuencia || 'Cada 24 horas',
    duracion: duracion || '10 días',
    prof: req.user.nombre,
    fechaOrden: new Date().toLocaleString('es-CO'),
    est: 'Pendiente',
    advertenciaCDS: allergyWarning,
    entrega: null
  };
  store.data.pharmacyOrders.unshift(newRx);

  const summary = `${newRx.med} ${newRx.dosis}, ${newRx.frec}`;
  if (!patient.meds.some(m => m.toLowerCase().includes(newRx.med.toLowerCase()))) patient.meds.push(summary);
  store.save();

  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'PRESCRIPCION_EMITIDA',
    detalle: `Fórmula emitida: ${newRx.med} (${newRx.dosis}) para ${patient.nombre}${allergyWarning ? ' [alerta por alergia]' : ''}`,
    pacienteId: pacId, ip: req.ip
  });
  res.status(201).json({ success: true, prescription: newRx, allergyWarning });
});

// Dispensación: descuenta inventario solo si se entrega; una cancelación no mueve stock
router.post('/:id/dispense', ...requireRole('farmacia'), (req, res) => {
  const order = store.data.pharmacyOrders.find(f => f.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Prescripción no encontrada' });
  if (order.est === 'Dispensado' || order.est === 'Cancelado') {
    return res.status(409).json({ error: 'La prescripción ya fue cerrada y no admite nueva dispensación.' });
  }

  const { tipoEntrega = 'Completo', cantEntregada = 30, recibeNombre, recibeDoc, parentesco, observacion } = req.body || {};
  if (!['Completo', 'Parcial', 'Cancelado'].includes(tipoEntrega)) return res.status(400).json({ error: 'Tipo de entrega inválido' });
  if (tipoEntrega !== 'Cancelado') {
    if (!isNonEmptyString(recibeNombre) || !isNonEmptyString(recibeDoc)) {
      return res.status(400).json({ error: 'Debe registrar nombre y documento de quien recibe el medicamento' });
    }
    if (!isPositiveInt(cantEntregada)) return res.status(400).json({ error: 'La cantidad entregada debe ser un número positivo' });
  }

  const cant = Number(cantEntregada) || 0;
  const medItem = store.data.medsCatalog.find(m => m.n.toLowerCase().includes(order.med.toLowerCase()));

  if (tipoEntrega !== 'Cancelado') {
    if (medItem && medItem.stock < cant) {
      return res.status(400).json({ error: `Existencias insuficientes. Stock actual: ${medItem.stock}. Realice entrega parcial o reabastezca.` });
    }
    if (medItem) medItem.stock -= cant;
  }

  order.est = tipoEntrega === 'Completo' ? 'Dispensado' : tipoEntrega === 'Parcial' ? 'Parcial' : 'Cancelado';
  order.entrega = tipoEntrega === 'Cancelado' ? null : {
    por: req.user.nombre,
    recibe: recibeNombre.trim(),
    doc: String(recibeDoc).trim(),
    rel: parentesco || 'El mismo paciente',
    fecha: new Date().toLocaleString('es-CO'),
    cantEntregada: cant,
    lote: medItem ? medItem.lote : '',
    observacion: observacion || ''
  };

  if (tipoEntrega !== 'Cancelado') {
    const patient = store.data.patients.find(p => p.id === order.pacId);
    const valor = (medItem ? medItem.precio : 15000);
    store.data.invoices.push({
      id: nextId(store.data.invoices, 'fac-'),
      fac: nextId(store.data.invoices.map(i => ({ id: i.fac })), 'FE-', 'id', 3400),
      pacId: order.pacId,
      pacNombre: order.pacNombre,
      doc: patient ? `${patient.tipoDoc} ${patient.doc}` : '',
      eps: patient ? patient.eps : '',
      serv: `Medicamento: ${order.med} (${cant} unidades)`,
      tipo: 'Farmacia',
      fecha: new Date().toLocaleDateString('es-CO'),
      valorTotal: valor,
      cubiertoEps: valor,
      copagoPaciente: 0,
      est: 'Por confirmar', metodoPago: null, conf: null
    });
  }
  store.save();

  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'DISPENSACION_FARMACIA',
    detalle: `Dispensación de ${order.med} (${cant} un.) estado: ${order.est}${order.entrega ? ` a ${order.entrega.recibe}` : ''}`,
    pacienteId: order.pacId, ip: req.ip
  });
  res.json({ success: true, message: 'Dispensación registrada y enviada a facturación.', order });
});

router.patch('/inventory/:id/stock', ...requireRole('farmacia'), (req, res) => {
  const med = store.data.medsCatalog.find(m => m.id === req.params.id);
  if (!med) return res.status(404).json({ error: 'Medicamento no encontrado' });
  const add = Number.parseInt((req.body || {}).cantidad, 10);
  if (Number.isNaN(add) || add <= 0) return res.status(400).json({ error: 'La cantidad a reabastecer debe ser positiva' });

  med.stock += add;
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'AJUSTE_INVENTARIO',
    detalle: `Reabastecimiento de ${med.n}: +${add} unidades (total ${med.stock})`, ip: req.ip
  });
  res.json({ success: true, med });
});

module.exports = router;
