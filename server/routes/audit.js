const express = require('express');
const store = require('../data/store');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Bitácora de trazabilidad: solo administración y gerencia
router.get('/', ...requireRole('admin', 'gerencia'), (req, res) => {
  const { accion, usuario, pacId } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  let logs = store.data.auditLogs;
  if (accion) logs = logs.filter(l => l.accion === accion);
  if (usuario) logs = logs.filter(l => l.usuario === usuario);
  if (pacId) logs = logs.filter(l => l.pacienteId === pacId);

  res.json({
    logs: logs.slice(0, limit),
    emergencies: store.data.emergencyAccesses,
    totalLogs: store.data.auditLogs.length
  });
});

module.exports = router;
