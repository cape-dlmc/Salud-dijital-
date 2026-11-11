const express = require('express');
const cors = require('cors');
const path = require('path');
const { authMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const patientRoutes = require('./routes/patients');
const appointmentRoutes = require('./routes/appointments');
const labRoutes = require('./routes/lab');
const pharmacyRoutes = require('./routes/pharmacy');
const billingRoutes = require('./routes/billing');
const kpiRoutes = require('./routes/kpis');
const fhirRoutes = require('./routes/fhir');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(authMiddleware);

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/kpis', kpiRoutes);
app.use('/api/fhir', fhirRoutes);
app.use('/api/audit', auditRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    system: 'SaludDigital Healthcare Core',
    version: '1.0.0',
    fhirVersion: 'R4 (4.0.1)',
    timestamp: new Date().toISOString()
  });
});

// Single Page Application Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🏥 SaludDigital Enterprise Healthcare Platform Running`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`📋 Standard: TOGAF 5 Layers & HL7 FHIR R4`);
  console.log(`🔒 Security: RBAC + Ley 1581 Habeas Data Audit`);
  console.log(`====================================================`);
});
