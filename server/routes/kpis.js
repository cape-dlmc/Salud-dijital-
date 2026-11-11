const express = require('express');
const router = express.Router();
const store = require('../data/store');

router.get('/', (req, res) => {
  const totalApts = store.data.appointments.length;
  const appApts = store.data.appointments.filter(a => a.canal === 'App SaludDigital').length;
  const appPercent = totalApts > 0 ? Math.round((appApts / totalApts) * 100) : 42;

  const publishedLabs = store.data.labOrders.filter(l => l.est === 'Publicado' && l.tiempoProcesamientoMinutos);
  const avgLabTime = publishedLabs.length > 0
    ? Math.round(publishedLabs.reduce((a, b) => a + b.tiempoProcesamientoMinutos, 0) / publishedLabs.length)
    : 38;

  const criticalIncidents = store.data.auditLogs.filter(a => a.accion === 'INCIDENTE_CRITICO').length;

  const kpis = [
    {
      id: "kpi-1",
      nombre: "Tiempo promedio de atención",
      valorActual: "22 min",
      meta: "Reducción del 30% (Meta ≤ 25 min)",
      cumplimiento: 88,
      estado: "En meta",
      tendencia: "-12% vs trimestre anterior",
      descripcion: "Disminución lograda al eliminar la duplicidad en el registro del paciente."
    },
    {
      id: "kpi-2",
      nombre: "Tiempo de entrega de laboratorio",
      valorActual: `${avgLabTime} min`,
      meta: "Menor a 60 min desde la orden",
      cumplimiento: 95,
      estado: "Excelente",
      tendencia: "Promedio consolidado en 38 min",
      descripcion: "El LIS publica directamente a la HCE evitando transporte físico de papeles."
    },
    {
      id: "kpi-3",
      nombre: "Citas agendadas por la App",
      valorActual: `${appPercent}%`,
      meta: "Alcanzar 60% en el primer año",
      cumplimiento: Math.min(100, Math.round((appPercent / 60) * 100)),
      estado: appPercent >= 50 ? "En meta" : "En progreso",
      tendencia: `+${appPercent - 20}% desde lanzamiento`,
      descripcion: "Autogestión por pacientes que reduce la carga operativa telefónica."
    },
    {
      id: "kpi-4",
      nombre: "Incidentes de seguridad de datos",
      valorActual: `${criticalIncidents}`,
      meta: "0 incidentes críticos por trimestre",
      cumplimiento: criticalIncidents === 0 ? 100 : 40,
      estado: criticalIncidents === 0 ? "Óptimo" : "Alerta",
      tendencia: "0 fugas / 100% trazabilidad RBAC",
      descripcion: "Defensa en profundidad y cumplimiento estricto de la Ley 1581 (Habeas Data)."
    },
    {
      id: "kpi-5",
      nombre: "Satisfacción del paciente",
      valorActual: "92%",
      meta: "Aumentar al 90% positivo",
      cumplimiento: 102,
      estado: "Superado",
      tendencia: "+14 puntos de NPS",
      descripcion: "Medición pos-consulta en la App SaludDigital."
    }
  ];

  // Weekly appointments data
  const semanal = [
    { dia: "Lunes", realizadas: 78, canceladas: 6 },
    { dia: "Martes", realizadas: 84, canceladas: 4 },
    { dia: "Miércoles", realizadas: 82, canceladas: 5 },
    { dia: "Jueves", realizadas: 90, canceladas: 5 },
    { dia: "Viernes", realizadas: 88, canceladas: 3 }
  ];

  // Distribution by EPS
  const epsMap = {};
  store.data.patients.forEach(p => {
    epsMap[p.eps] = (epsMap[p.eps] || 0) + 1;
  });

  // Financial summary
  const financiero = {
    recaudado: store.data.invoices.filter(i => i.est === 'Pagada').reduce((a, b) => a + b.valorTotal, 0),
    porConfirmar: store.data.invoices.filter(i => i.est === 'Por confirmar').reduce((a, b) => a + b.valorTotal, 0),
    vencido: store.data.invoices.filter(i => i.est === 'Vencida').reduce((a, b) => a + b.valorTotal, 0)
  };

  res.json({
    kpis,
    graficos: {
      semanal,
      epsDistribucion: epsMap,
      financiero
    }
  });
});

module.exports = router;
