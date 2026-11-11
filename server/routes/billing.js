const express = require('express');
const router = express.Router();
const store = require('../data/store');

// Get all invoices with financial summary
router.get('/', (req, res) => {
  const { estado, pacId } = req.query;
  let list = store.data.invoices;

  if (estado && estado !== 'Todos') list = list.filter(i => i.est === estado);
  if (pacId) list = list.filter(i => i.pacId === pacId);

  // If patient, only return their invoices
  if (req.user && req.user.rol === 'paciente') {
    list = list.filter(i => i.pacId === req.user.pacId);
  }

  const pagadas = store.data.invoices.filter(i => i.est === 'Pagada').reduce((acc, i) => acc + i.valorTotal, 0);
  const porConfirmar = store.data.invoices.filter(i => i.est === 'Por confirmar' || i.est === 'Confirmada').reduce((acc, i) => acc + i.valorTotal, 0);
  const vencida = store.data.invoices.filter(i => i.est === 'Vencida').reduce((acc, i) => acc + i.valorTotal, 0);

  res.json({
    invoices: list,
    summary: {
      totalFacturas: store.data.invoices.length,
      porConfirmarCount: store.data.invoices.filter(i => i.est === 'Por confirmar').length,
      totalPagado: pagadas,
      totalPorConfirmar: porConfirmar,
      totalCarteraVencida: vencida
    }
  });
});

// Get detailed invoice by ID (with full patient, doctor and itemized breakdown)
router.get('/:id', (req, res) => {
  const { id } = req.params;
  const invoice = store.data.invoices.find(i => i.id === id || i.fac === id);
  if (!invoice) return res.status(404).json({ error: "Factura no encontrada" });

  const patient = store.data.patients.find(p => p.id === invoice.pacId);
  
  // Format itemized lines if not already present
  const items = invoice.items || [
    {
      concepto: invoice.serv,
      tipo: invoice.tipo || "Atención Clínica",
      codigo: invoice.codigo || (invoice.tipo === "Laboratorio Clínico" ? "CUPS-902210" : invoice.tipo === "Farmacia" ? "MED-INVIMA" : "CUPS-890201"),
      cantidad: 1,
      valorUnitario: invoice.valorTotal,
      cubiertoEps: invoice.cubiertoEps || (invoice.valorTotal - (invoice.copagoPaciente || 0)),
      copago: invoice.copagoPaciente || 0,
      total: invoice.valorTotal
    }
  ];

  const fullInvoice = {
    ...invoice,
    items,
    paciente: patient ? {
      id: patient.id,
      nombre: patient.nombre,
      tipoDoc: patient.tipoDoc || "CC",
      doc: patient.doc,
      edad: patient.edad,
      eps: patient.eps,
      regimen: patient.regimen || "Contributivo",
      tel: patient.tel,
      direccion: patient.direccion || "Medellín, Colombia",
      medico: patient.medico
    } : {
      id: invoice.pacId,
      nombre: invoice.pacNombre,
      doc: invoice.doc,
      eps: invoice.eps,
      medico: invoice.med || "Dr. Andrés Martínez"
    },
    medicoTratante: invoice.med || (patient ? patient.medico : "Dr. Andrés Martínez"),
    resolucionDian: "Resolución DIAN No. 18764000129384 de 2026-01-15 (Rango FE-3000 al FE-9000)",
    emisor: {
      razonSocial: "SaludDigital Clínica Privada S.A.S.",
      nit: "901.442.819-3",
      direccion: "Calle 33 Sur # 42B - 10, Edificio Médico SaludDigital",
      telefono: "(604) 448-9000",
      ciudad: "Medellín, Colombia"
    }
  };

  res.json({ invoice: fullInvoice });
});

// Create manual hospital charge / order from Billing
router.post('/create-order', (req, res) => {
  const { pacId, concepto, tipo, valorTotal, copagoPaciente = 0, med } = req.body;
  if (!pacId || !concepto || !valorTotal) {
    return res.status(400).json({ error: "Paciente, concepto y valor son obligatorios" });
  }

  const patient = store.data.patients.find(p => p.id === pacId);
  if (!patient) return res.status(404).json({ error: "Paciente no encontrado" });

  const total = parseFloat(valorTotal);
  const copago = parseFloat(copagoPaciente) || 0;
  const newFacId = "FE-" + (3400 + store.data.invoices.length + 1);

  const newInvoice = {
    id: "fac-" + (store.data.invoices.length + 1),
    fac: newFacId,
    pacId: patient.id,
    pacNombre: patient.nombre,
    doc: `${patient.tipoDoc || 'CC'} ${patient.doc}`,
    eps: patient.eps,
    med: med || patient.medico,
    serv: concepto,
    tipo: tipo || "Servicio Hospitalario",
    fecha: new Date().toLocaleDateString("es-CO"),
    valorTotal: total,
    cubiertoEps: Math.max(0, total - copago),
    copagoPaciente: copago,
    est: "Por confirmar",
    metodoPago: null,
    conf: null,
    items: [
      {
        concepto,
        tipo: tipo || "Servicio Hospitalario",
        codigo: "HOSP-" + Math.floor(Math.random() * 89999 + 10000),
        cantidad: 1,
        valorUnitario: total,
        cubiertoEps: Math.max(0, total - copago),
        copago: copago,
        total: total
      }
    ]
  };

  store.data.invoices.unshift(newInvoice);
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "facturacion",
    rol: req.user ? req.user.rol : "facturacion",
    accion: "ORDEN_COBRO_GENERADA",
    detalle: `Orden de facturación generada ${newFacId}: ${concepto} para ${patient.nombre}`,
    pacienteId: patient.id,
    ip: req.ip
  });

  res.status(201).json({ success: true, invoice: newInvoice });
});

// Confirm service charge (Facturación staff)
router.patch('/:id/confirm', (req, res) => {
  const { id } = req.params;
  const invoice = store.data.invoices.find(i => i.id === id);
  if (!invoice) return res.status(404).json({ error: "Factura o cargo no encontrado" });

  invoice.est = "Confirmada";
  invoice.conf = req.user ? req.user.nombre : "Paola Vargas";
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "facturacion",
    rol: req.user ? req.user.rol : "facturacion",
    accion: "CONFIRMAR_SERVICIO",
    detalle: `Servicio ${invoice.fac} (${invoice.serv}) confirmado para cobro`,
    pacienteId: invoice.pacId,
    ip: req.ip
  });

  res.json({ success: true, invoice });
});

// Register payment
router.post('/:id/pay', (req, res) => {
  const { id } = req.params;
  const { metodoPago = "Tarjeta débito", notas = "" } = req.body;

  const invoice = store.data.invoices.find(i => i.id === id);
  if (!invoice) return res.status(404).json({ error: "Factura no encontrada" });

  invoice.est = "Pagada";
  invoice.metodoPago = metodoPago;
  invoice.fechaPago = new Date().toLocaleDateString("es-CO");
  invoice.horaPago = new Date().toLocaleTimeString("es-CO", { hour: '2-digit', minute: '2-digit' });
  invoice.conf = req.user ? req.user.nombre : "Paola Vargas";
  invoice.notasPago = notas;
  store.save();

  store.logAudit({
    usuario: req.user ? req.user.user : "facturacion",
    rol: req.user ? req.user.rol : "facturacion",
    accion: "REGISTRAR_PAGO",
    detalle: `Pago registrado para factura ${invoice.fac} por valor de $${invoice.valorTotal.toLocaleString('es-CO')} vía ${metodoPago}`,
    pacienteId: invoice.pacId,
    ip: req.ip
  });

  res.json({ success: true, message: "Pago registrado y recibo emitido exitosamente", invoice });
});

module.exports = router;
