const express = require('express');
const store = require('../data/store');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Indicadores agregados: no incluye datos identificables de pacientes
router.get('/', ...requireRole('gerencia'), (req, res) => {
  const totalApts = store.data.appointments.length;
  const appApts = store.data.appointments.filter(a => a.canal === 'App SaludDigital').length;
  const appPercent = totalApts > 0 ? Math.round((appApts / totalApts) * 100) : 0;

  const published = store.data.labOrders.filter(l => l.est === 'Publicado' && l.tiempoProcesamientoMinutos);
  const avgLabTime = published.length > 0
    ? Math.round(published.reduce((a, l) => a + l.tiempoProcesamientoMinutos, 0) / published.length)
    : null;

  const blockedAccess = store.data.auditLogs.filter(a => a.accion === 'LOGIN_FALLIDO').length;
  const emergencies = store.data.emergencyAccesses.length;

  const kpis = [
    {
      id: 'kpi-1', nombre: 'Tiempo de entrega de laboratorio',
      valorActual: avgLabTime !== null ? `${avgLabTime} min` : 'Sin datos',
      meta: 'Menor a 60 min desde la orden', cumplimiento: avgLabTime !== null ? Math.min(100, Math.round((60 / Math.max(avgLabTime, 1)) * 100)) : 0,
      estado: avgLabTime === null ? 'Sin datos' : avgLabTime <= 60 ? 'En meta' : 'Fuera de meta',
      descripcion: 'Calculado con la hora real de solicitud y de publicación de cada orden.'
    },
    {
      id: 'kpi-2', nombre: 'Citas agendadas por la app',
      valorActual: `${appPercent}%`, meta: 'Alcanzar 60%',
      cumplimiento: Math.min(100, Math.round((appPercent / 60) * 100)),
      estado: appPercent >= 60 ? 'En meta' : 'En progreso',
      descripcion: 'Porcentaje de citas creadas desde la app sobre el total de citas registradas.'
    },
    {
      id: 'kpi-3', nombre: 'Accesos fallidos al sistema',
      valorActual: `${blockedAccess}`, meta: 'Vigilar tendencia',
      cumplimiento: blockedAccess === 0 ? 100 : 60,
      estado: blockedAccess === 0 ? 'Óptimo' : 'Revisar',
      descripcion: 'Intentos de inicio de sesión rechazados, registrados en la bitácora.'
    },
    {
      id: 'kpi-4', nombre: 'Accesos de emergencia',
      valorActual: `${emergencies}`, meta: 'Uso excepcional y justificado',
      cumplimiento: emergencies === 0 ? 100 : 80,
      estado: emergencies === 0 ? 'Óptimo' : 'Revisar',
      descripcion: 'Accesos de emergencia activados por médicos a pacientes no asignados.'
    }
  ];

  const semanal = [
    { dia: 'Lunes', realizadas: 78, canceladas: 6 },
    { dia: 'Martes', realizadas: 84, canceladas: 4 },
    { dia: 'Miércoles', realizadas: 82, canceladas: 5 },
    { dia: 'Jueves', realizadas: 90, canceladas: 5 },
    { dia: 'Viernes', realizadas: 88, canceladas: 3 }
  ];

  const epsDistribucion = {};
  store.data.patients.forEach(p => { epsDistribucion[p.eps] = (epsDistribucion[p.eps] || 0) + 1; });

  const sum = (est) => store.data.invoices.filter(i => i.est === est).reduce((a, i) => a + i.valorTotal, 0);
  const financiero = { recaudado: sum('Pagada'), porConfirmar: sum('Por confirmar'), vencido: sum('Vencida') };

  res.json({ kpis, graficos: { semanal, epsDistribucion, financiero }, nota: 'La serie semanal es de referencia hasta conectar la fuente de citas por día.' });
});

module.exports = router;
