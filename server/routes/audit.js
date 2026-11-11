const express = require('express');
const router = express.Router();
const store = require('../data/store');

// Get audit logs conforming to Ley 1581 de 2012
router.get('/', (req, res) => {
  const { accion, usuario, pacId, limit = 100 } = req.query;
  let logs = store.data.auditLogs;

  if (accion) logs = logs.filter(l => l.accion === accion);
  if (usuario) logs = logs.filter(l => l.usuario === usuario);
  if (pacId) logs = logs.filter(l => l.pacienteId === pacId);

  res.json({
    logs: logs.slice(0, parseInt(limit, 10)),
    emergencies: store.data.emergencyAccesses,
    totalLogs: store.data.auditLogs.length
  });
});

module.exports = router;
