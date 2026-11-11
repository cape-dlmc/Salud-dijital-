const express = require('express');
const store = require('../data/store');
const { requireAuth } = require('../middleware/auth');
const { canViewClinical } = require('../lib/access');

const router = express.Router();
const FHIR = 'application/fhir+json';

const operationOutcome = (code, diagnostics) => ({
  resourceType: 'OperationOutcome',
  issue: [{ severity: 'error', code, diagnostics }]
});

// Metadatos públicos del servidor FHIR (no contienen datos de pacientes)
router.get('/metadata', (req, res) => {
  res.set('Content-Type', FHIR).json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    publisher: 'SaludDigital Clínica Privada',
    kind: 'instance',
    software: { name: 'SaludDigital FHIR R4 Gateway', version: '1.1.0' },
    fhirVersion: '4.0.1',
    format: ['application/fhir+json', 'application/json'],
    rest: [{
      mode: 'server',
      resource: ['Patient', 'Observation', 'Condition', 'MedicationRequest', 'DiagnosticReport'].map(type => ({
        type, interaction: [{ code: 'read' }, { code: 'search-type' }]
      }))
    }]
  });
});

// Solo usuarios autenticados del personal de salud
router.get('/Patient/:id', requireAuth, (req, res) => {
  const p = store.data.patients.find(pt => pt.id === req.params.id);
  if (!p) return res.status(404).set('Content-Type', FHIR).json(operationOutcome('not-found', 'Patient not found'));
  if (req.user.rol === 'gerencia') {
    return res.status(403).set('Content-Type', FHIR).json(operationOutcome('forbidden', 'Acceso no permitido'));
  }

  res.set('Content-Type', FHIR).json({
    resourceType: 'Patient',
    id: p.id,
    identifier: [{ use: 'official', value: p.doc }],
    active: p.estado !== 'Inactivo',
    name: [{ use: 'official', text: p.nombre }],
    gender: p.sexo === 'F' ? 'female' : 'male',
    birthDate: p.fechaNacimiento,
    telecom: [{ system: 'phone', value: p.tel }, { system: 'email', value: p.email }],
    address: [{ use: 'home', line: [p.direccion], country: 'Colombia' }],
    managingOrganization: { display: 'SaludDigital Clínica Privada' }
  });
});

// Expediente completo FHIR R4: médico asignado, especialista o administrador clínico
router.get(['/Patient/:id/everything', '/Patient/:id/$everything'], requireAuth, (req, res) => {
  const p = store.data.patients.find(pt => pt.id === req.params.id);
  if (!p) return res.status(404).set('Content-Type', FHIR).json(operationOutcome('not-found', 'Patient not found'));
  if (!['medico', 'especialista', 'admin'].includes(req.user.rol) || (req.user.rol !== 'admin' && !canViewClinical(req.user, p))) {
    return res.status(403).set('Content-Type', FHIR).json(operationOutcome('forbidden', 'Acceso clínico no permitido'));
  }

  const entries = [{ fullUrl: `urn:uuid:patient-${p.id}`, resource: { resourceType: 'Patient', id: p.id, identifier: [{ value: p.doc }], name: [{ text: p.nombre }] } }];

  p.dx.forEach((d, i) => entries.push({
    fullUrl: `urn:uuid:condition-${p.id}-${i}`,
    resource: {
      resourceType: 'Condition', id: `cond-${p.id}-${i}`,
      clinicalStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }] },
      code: { text: d }, subject: { reference: `Patient/${p.id}` }
    }
  }));

  Object.entries(p.signos).forEach(([key, val]) => entries.push({
    fullUrl: `urn:uuid:obs-${p.id}-${key}`,
    resource: {
      resourceType: 'Observation', id: `obs-${p.id}-${key}`, status: 'final',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] }],
      code: { text: key }, valueString: val, subject: { reference: `Patient/${p.id}` }
    }
  }));

  store.data.pharmacyOrders.filter(f => f.pacId === p.id).forEach(rx => entries.push({
    fullUrl: `urn:uuid:${rx.id}`,
    resource: {
      resourceType: 'MedicationRequest', id: rx.id, intent: 'order',
      status: rx.est === 'Dispensado' ? 'completed' : 'active',
      medicationCodeableConcept: { text: rx.med }, subject: { reference: `Patient/${p.id}` },
      dosageInstruction: [{ text: `${rx.dosis}, ${rx.frec}` }]
    }
  }));

  store.data.labOrders.filter(l => l.pacId === p.id && l.est === 'Publicado').forEach(lab => entries.push({
    fullUrl: `urn:uuid:${lab.id}`,
    resource: {
      resourceType: 'DiagnosticReport', id: lab.id, status: 'final',
      code: { text: lab.ex }, subject: { reference: `Patient/${p.id}` }, effectiveDateTime: lab.fechaPublicacion,
      result: lab.res.map(r => ({ display: `${r.p}: ${r.v} (${r.r}) [${r.f}]` }))
    }
  }));

  res.set('Content-Type', FHIR).json({
    resourceType: 'Bundle', id: `bundle-${p.id}`, type: 'searchset', total: entries.length, entry: entries
  });
});

module.exports = router;
