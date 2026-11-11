const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { authenticate } = require('./middleware/auth');

const app = express();
app.disable('x-powered-by');

// Seguridad básica de cabeceras
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': req.path.startsWith('/api') ? 'no-store' : 'no-cache'
  });
  next();
});

app.use(cors({ origin: config.CORS_ORIGINS.length ? config.CORS_ORIGINS : false }));
app.use(express.json({ limit: '200kb' }));
app.use(authenticate);

app.use(express.static(config.PUBLIC_DIR));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/patients', require('./routes/patients'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/lab', require('./routes/lab'));
app.use('/api/pharmacy', require('./routes/pharmacy'));
app.use('/api/billing', require('./routes/billing'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/api/kpis', require('./routes/kpis'));
app.use('/api/fhir', require('./routes/fhir'));
app.use('/api/audit', require('./routes/audit'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', system: 'SaludDigital', version: '1.1.0', timestamp: new Date().toISOString() });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));

// Aplicación de una sola página: cualquier otra ruta devuelve el index
app.get('*', (req, res) => res.sendFile(path.join(config.PUBLIC_DIR, 'index.html')));

// Manejo de errores centralizado
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'La petición es demasiado grande' });
  console.error('Error interno:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log('====================================================');
    console.log('SaludDigital - Plataforma hospitalaria');
    console.log(`URL: http://localhost:${config.PORT}`);
    console.log(`Cuentas de demostración: ${config.DEMO_MODE ? 'activas' : 'desactivadas'}`);
    console.log('====================================================');
  });
}

module.exports = app;
