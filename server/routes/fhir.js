const express = require('express');
const router = express.Router();
const store = require('../data/store');

// FHIR R4 CapabilityStatement (Metadata)
router.get('/metadata', (req, res) => {
  res.json({
    resourceType: "CapabilityStatement",
    status: "active",
    date: new Date().toISOString(),
    publisher: "SaludDigital Clínica Privada",
    kind: "instance",
    software: {
      name: "SaludDigital FHIR R4 Interoperability Gateway",
      version: "1.0.0"
    },
    fhirVersion: "4.0.1",
    format: ["application/fhir+json", "application/json"],
    rest: [
      {
        mode: "server",
        resource: [
          { type: "Patient", interaction: [{ code: "read" }, { code: "search-type" }] },
          { type: "Observation", interaction: [{ code: "read" }, { code: "search-type" }] },
          { type: "Condition", interaction: [{ code: "read" }, { code: "search-type" }] },
          { type: "MedicationRequest", interaction: [{ code: "read" }, { code: "search-type" }] },
          { type: "DiagnosticReport", interaction: [{ code: "read" }, { code: "search-type" }] }
        ]
      }
    ]
  });
});

// FHIR Patient resource
router.get('/Patient/:id', (req, res) => {
  const { id } = req.params;
  const p = store.data.patients.find(pt => pt.id === id);
  if (!p) return res.status(404).json({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found", diagnostics: "Patient not found" }] });

  const fhirPatient = {
    resourceType: "Patient",
    id: p.id,
    identifier: [
      { use: "official", system: "urn:oid:2.16.170.1.1", value: p.doc },
      { use: "usual", system: "https://saluddigital.com/patients", value: p.id }
    ],
    active: p.estado !== "Inactivo",
    name: [
      { use: "official", text: p.nombre }
    ],
    gender: p.sexo === "F" ? "female" : "male",
    birthDate: p.fechaNacimiento,
    telecom: [
      { system: "phone", value: p.tel, use: "mobile" },
      { system: "email", value: p.email }
    ],
    address: [
      { use: "home", line: [p.direccion], country: "Colombia" }
    ],
    managingOrganization: {
      display: "SaludDigital Clínica Privada"
    }
  };

  res.set('Content-Type', 'application/fhir+json');
  res.json(fhirPatient);
});

// FHIR Bundle of all resources for a patient (Exportable clinical record)
router.get(['/Patient/:id/everything', '/Patient/:id/\\$everything', '/Patient/:id/bundle'], (req, res) => {
  const { id } = req.params;
  const p = store.data.patients.find(pt => pt.id === id);
  if (!p) return res.status(404).json({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: "not-found" }] });

  const bundleEntries = [
    {
      fullUrl: `urn:uuid:patient-${p.id}`,
      resource: {
        resourceType: "Patient",
        id: p.id,
        identifier: [{ value: p.doc }],
        name: [{ text: p.nombre }],
        telecom: [{ system: "phone", value: p.tel }]
      }
    }
  ];

  // Diagnoses as FHIR Conditions
  p.dx.forEach((d, idx) => {
    bundleEntries.push({
      fullUrl: `urn:uuid:condition-${p.id}-${idx}`,
      resource: {
        resourceType: "Condition",
        id: `cond-${p.id}-${idx}`,
        clinicalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/condition-clinical", code: "active" }] },
        code: { text: d },
        subject: { reference: `Patient/${p.id}` }
      }
    });
  });

  // Observations (Vital Signs)
  Object.entries(p.signos).forEach(([key, val]) => {
    bundleEntries.push({
      fullUrl: `urn:uuid:obs-${p.id}-${key}`,
      resource: {
        resourceType: "Observation",
        id: `obs-${p.id}-${key}`,
        status: "final",
        category: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/observation-category", code: "vital-signs" }] }],
        code: { text: key },
        valueString: val,
        subject: { reference: `Patient/${p.id}` }
      }
    });
  });

  // Prescriptions as FHIR MedicationRequest
  const rxList = store.data.pharmacyOrders.filter(f => f.pacId === id);
  rxList.forEach(rx => {
    bundleEntries.push({
      fullUrl: `urn:uuid:${rx.id}`,
      resource: {
        resourceType: "MedicationRequest",
        id: rx.id,
        status: rx.est === "Dispensado" ? "completed" : "active",
        intent: "order",
        medicationCodeableConcept: { text: rx.med },
        subject: { reference: `Patient/${p.id}` },
        dosageInstruction: [{ text: `${rx.dosis}, ${rx.frec}` }]
      }
    });
  });

  // DiagnosticReports (Lab results)
  const labList = store.data.labOrders.filter(l => l.pacId === id && l.est === "Publicado");
  labList.forEach(lab => {
    bundleEntries.push({
      fullUrl: `urn:uuid:${lab.id}`,
      resource: {
        resourceType: "DiagnosticReport",
        id: lab.id,
        status: "final",
        code: { text: lab.ex },
        subject: { reference: `Patient/${p.id}` },
        effectiveDateTime: lab.fechaPublicacion,
        result: lab.res.map(r => ({ display: `${r.p}: ${r.v} (${r.r}) [${r.f}]` }))
      }
    });
  });

  const bundle = {
    resourceType: "Bundle",
    id: `bundle-${p.id}`,
    type: "searchset",
    total: bundleEntries.length,
    entry: bundleEntries
  };

  res.set('Content-Type', 'application/fhir+json');
  res.json(bundle);
});

module.exports = router;
