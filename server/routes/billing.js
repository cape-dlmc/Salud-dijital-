const express = require('express');
const store = require('../data/store');
const { requireRole } = require('../middleware/auth');
const { isNonEmptyString, nextId } = require('../lib/validate');

const router = express.Router();
const METODOS = ['Tarjeta débito', 'Tarjeta crédito', 'Efectivo', 'Transferencia', 'Convenio EPS Sanitas', 'Convenio EPS'];

const sumBy = (list, est) => list.filter(i => i.est === est).reduce((acc, i) => acc + i.valorTotal, 0);

router.get('/', ...requireRole('facturacion', 'gerencia', 'admin'), (req, res) => {
  const { estado, pacId } = req.query;
  let list = store.data.invoices;
  if (estado && estado !== 'Todos') list = list.filter(i => i.est === estado);
  if (pacId) list = list.filter(i => i.pacId === pacId);

  res.json({
    invoices: list,
    summary: {
      totalFacturas: store.data.invoices.length,
      porConfirmarCount: store.data.invoices.filter(i => i.est === 'Por confirmar').length,
      totalPagado: sumBy(store.data.invoices, 'Pagada'),
      totalPorConfirmar: store.data.invoices.filter(i => i.est === 'Por confirmar' || i.est === 'Confirmada').reduce((a, i) => a + i.valorTotal, 0),
      totalCarteraVencida: sumBy(store.data.invoices, 'Vencida')
    }
  });
});

router.get('/:id', ...requireRole('facturacion', 'gerencia', 'admin'), (req, res) => {
  const invoice = store.data.invoices.find(i => i.id === req.params.id || i.fac === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });

  const patient = store.data.patients.find(p => p.id === invoice.pacId);
  const items = invoice.items || [{
    concepto: invoice.serv,
    tipo: invoice.tipo || 'Atención clínica',
    cantidad: 1,
    valorUnitario: invoice.valorTotal,
    cubiertoEps: invoice.cubiertoEps,
    copago: invoice.copagoPaciente || 0,
    total: invoice.valorTotal
  }];

  res.json({
    invoice: {
      ...invoice,
      items,
      paciente: patient ? {
        id: patient.id, nombre: patient.nombre, tipoDoc: patient.tipoDoc, doc: patient.doc,
        edad: patient.edad, eps: patient.eps, regimen: patient.regimen, tel: patient.tel,
        direccion: patient.direccion, medico: patient.medico
      } : { id: invoice.pacId, nombre: invoice.pacNombre, doc: invoice.doc, eps: invoice.eps },
      medicoTratante: invoice.med || (patient ? patient.medico : ''),
      emisor: {
        razonSocial: 'SaludDigital Clínica Privada S.A.S.',
        nit: '901.442.819-3',
        direccion: 'Calle 33 Sur # 42B - 10, Edificio Médico SaludDigital',
        telefono: '(604) 448-9000',
        ciudad: 'Medellín, Colombia'
      }
    }
  });
});

// Cargo manual desde facturación
router.post('/create-order', ...requireRole('facturacion'), (req, res) => {
  const { pacId, concepto, tipo, valorTotal, copagoPaciente = 0, med } = req.body || {};
  if (!isNonEmptyString(pacId) || !isNonEmptyString(concepto) || !(Number(valorTotal) > 0)) {
    return res.status(400).json({ error: 'Paciente, concepto y valor positivo son obligatorios' });
  }
  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: 'Paciente no encontrado' });

  const total = Number(valorTotal);
  const copago = Math.min(Math.max(0, Number(copagoPaciente) || 0), total);
  const fac = nextId(store.data.invoices.map(i => ({ id: i.fac })), 'FE-', 'id', 3400);

  const invoice = {
    id: nextId(store.data.invoices, 'fac-'),
    fac,
    pacId: patient.id,
    pacNombre: patient.nombre,
    doc: `${patient.tipoDoc || 'CC'} ${patient.doc}`,
    eps: patient.eps,
    med: med || patient.medico,
    serv: concepto.trim(),
    tipo: tipo || 'Servicio Hospitalario',
    fecha: new Date().toLocaleDateString('es-CO'),
    valorTotal: total,
    cubiertoEps: total - copago,
    copagoPaciente: copago,
    est: 'Por confirmar', metodoPago: null, conf: null,
    items: [{ concepto: concepto.trim(), tipo: tipo || 'Servicio Hospitalario', cantidad: 1, valorUnitario: total, cubiertoEps: total - copago, copago, total }]
  };
  store.data.invoices.unshift(invoice);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'ORDEN_COBRO_GENERADA',
    detalle: `Cargo ${fac}: ${invoice.serv} para ${patient.nombre}`, pacienteId: patient.id, ip: req.ip
  });
  res.status(201).json({ success: true, invoice });
});

router.patch('/:id/confirm', ...requireRole('facturacion'), (req, res) => {
  const invoice = store.data.invoices.find(i => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura o cargo no encontrado' });
  if (invoice.est === 'Pagada') return res.status(409).json({ error: 'La factura ya está pagada.' });

  invoice.est = 'Confirmada';
  invoice.conf = req.user.nombre;
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'CONFIRMAR_SERVICIO',
    detalle: `Servicio ${invoice.fac} (${invoice.serv}) confirmado para cobro`, pacienteId: invoice.pacId, ip: req.ip
  });
  res.json({ success: true, invoice });
});

router.post('/:id/pay', ...requireRole('facturacion'), (req, res) => {
  const invoice = store.data.invoices.find(i => i.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
  if (invoice.est === 'Pagada') return res.status(409).json({ error: 'La factura ya está pagada.' });

  const { metodoPago = 'Tarjeta débito', notas = '' } = req.body || {};
  if (!METODOS.includes(metodoPago)) return res.status(400).json({ error: 'Método de pago no válido' });

  const now = new Date();
  invoice.est = 'Pagada';
  invoice.metodoPago = metodoPago;
  invoice.fechaPago = now.toLocaleDateString('es-CO');
  invoice.horaPago = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  invoice.conf = req.user.nombre;
  invoice.notasPago = String(notas).slice(0, 300);
  store.save();
  store.logAudit({
    usuario: req.user.user, rol: req.user.rol, accion: 'REGISTRAR_PAGO',
    detalle: `Pago de factura ${invoice.fac} por $${invoice.valorTotal.toLocaleString('es-CO')} vía ${metodoPago}`, pacienteId: invoice.pacId, ip: req.ip
  });
  res.json({ success: true, message: 'Pago registrado.', invoice });
});

module.exports = router;
