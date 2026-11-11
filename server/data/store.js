const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

// Initial seed data based on the SaludDigital Enterprise Architecture document
const initialData = {
  users: [
    { id: "u1", user: "admin.pena", pw: "Admin2026*", nombre: "Ricardo Peña", rol: "admin", cargo: "Administración y admisiones", ini: "RP", email: "ricardo.pena@saluddigital.com", tel: "310 440 1001" },
    { id: "u2", user: "dr.martinez", pw: "Medico2026*", nombre: "Dr. Andrés Martínez", rol: "medico", cargo: "Médico general", especialidad: "Medicina general", regMedico: "RM-44821", ini: "AM", email: "andres.martinez@saluddigital.com" },
    { id: "u3", user: "dra.gomez", pw: "Medico2026*", nombre: "Dra. Laura Gómez", rol: "medico", cargo: "Ginecología y endocrinología", especialidad: "Ginecología", regMedico: "RM-51290", ini: "LG", email: "laura.gomez@saluddigital.com" },
    { id: "u4", user: "dr.restrepo", pw: "Medico2026*", nombre: "Dr. Julián Restrepo", rol: "medico", cargo: "Neumología clínica", especialidad: "Neumología", regMedico: "RM-39014", ini: "JR", email: "julian.restrepo@saluddigital.com" },
    { id: "u5", user: "lab.ortega", pw: "Lab2026*", nombre: "Daniela Ortega", rol: "laboratorio", cargo: "Bacterióloga y Lab. Clínico", regLab: "BC-19280", ini: "DO", email: "daniela.ortega@saluddigital.com" },
    { id: "u6", user: "farm.rojas", pw: "Farm2026*", nombre: "Esteban Rojas", rol: "farmacia", cargo: "Químico Farmacéutico", regFarm: "QF-99321", ini: "ER", email: "esteban.rojas@saluddigital.com" },
    { id: "u7", user: "fact.vargas", pw: "Fact2026*", nombre: "Paola Vargas", rol: "facturacion", cargo: "Facturación y Cartera Hospitalaria", ini: "PV", email: "paola.vargas@saluddigital.com" },
    { id: "u8", user: "gerencia", pw: "Gerencia2026*", nombre: "Dra. Mariana Salazar", rol: "gerencia", cargo: "Dirección Médica y Ejecutiva", ini: "MS", email: "mariana.salazar@saluddigital.com" },
    { id: "u9", user: "paciente.maria", pw: "Paciente2026*", nombre: "María Fernanda López", rol: "paciente", cargo: "Paciente registrado", pacId: "SD-10482", ini: "ML", email: "mflopez@correo.com" }
  ],

  doctors: [
    { id: "doc-1", n: "Dr. Andrés Martínez", esp: ["Medicina general"], consultorio: "Cons. 201", color: "#3B9EFF" },
    { id: "doc-2", n: "Dra. Laura Gómez", esp: ["Ginecología", "Endocrinología"], consultorio: "Cons. 305", color: "#8B5CF6" },
    { id: "doc-3", n: "Dr. Julián Restrepo", esp: ["Neumología"], consultorio: "Cons. 208", color: "#06B6D4" }
  ],

  specialties: [
    "Medicina general",
    "Ginecología",
    "Endocrinología",
    "Neumología",
    "Cardiología preventiva",
    "Pediatría"
  ],

  patients: [
    {
      id: "SD-10482",
      tipoDoc: "CC",
      doc: "1.032.458.771",
      nombre: "María Fernanda López",
      sexo: "F",
      fechaNacimiento: "1992-04-14",
      edad: 34,
      eps: "Sura EPS",
      regimen: "Contributivo",
      tel: "310 555 0182",
      email: "mflopez@correo.com",
      direccion: "Cra 43A # 18 Sur - 40, Medellín",
      contactoEmergencia: { nombre: "Carlos López (Hermano)", tel: "311 220 9940" },
      medico: "Dr. Andrés Martínez",
      estado: "En atención",
      consentimientoHabeasData: true,
      fechaConsentimiento: "2026-01-10T09:00:00Z",
      alergias: ["Penicilina", "AINES"],
      antec: ["Asma leve (2018)", "Rinitis estacional"],
      dx: ["Rinitis alérgica (J30.9)", "Asma leve persistente (J45.0)"],
      meds: ["Loratadina 10 mg, 1 tab al día", "Salbutamol inhalador 100 mcg SOS"],
      signos: {
        presion: "118/76",
        fc: "72 lpm",
        fr: "16 rpm",
        temp: "36.6 °C",
        peso: "61 kg",
        talla: "1.64 m",
        imc: "22.7 (Normal)",
        satO2: "98 %"
      },
      evol: [
        { fecha: "2026-10-07 08:30", autor: "Dr. Andrés Martínez", tipo: "Consulta control", nota: "Paciente refiere mejoría parcial con antihistamínico. Examen físico: Murmullo vesicular conservado sin sibilancias. Se mantiene pauta y se solicita hemograma completo de control." },
        { fecha: "2026-09-12 11:15", autor: "Dr. Andrés Martínez", tipo: "Consulta general", nota: "Presenta exacerbación rinosinusal estacional. Se formulan antihistamínicos de segunda generación y recomendaciones ambientales." }
      ]
    },
    {
      id: "SD-10377",
      tipoDoc: "CC",
      doc: "80.215.640",
      nombre: "Carlos Andrés Ruiz",
      sexo: "M",
      fechaNacimiento: "1974-08-22",
      edad: 52,
      eps: "Sanitas EPS",
      regimen: "Contributivo",
      tel: "301 555 0467",
      email: "carlos.ruiz@empresarial.co",
      direccion: "Calle 127 # 19 - 30, Bogotá",
      contactoEmergencia: { nombre: "Carmen Ruiz (Esposa)", tel: "301 555 0468" },
      medico: "Dr. Andrés Martínez",
      estado: "Activo",
      consentimientoHabeasData: true,
      fechaConsentimiento: "2026-02-14T10:30:00Z",
      alergias: [],
      antec: ["Hipertensión arterial (2015)", "Dislipidemia"],
      dx: ["Hipertensión arterial esencial controlada (I10)", "Hipercolesterolemia pura (E78.0)"],
      meds: ["Losartán 50 mg, 1 tab cada 12 horas", "Atorvastatina 20 mg noche"],
      signos: {
        presion: "132/84",
        fc: "70 lpm",
        fr: "18 rpm",
        temp: "36.4 °C",
        peso: "84 kg",
        talla: "1.75 m",
        imc: "27.4 (Sobrepeso)",
        satO2: "97 %"
      },
      evol: [
        { fecha: "2026-10-02 09:20", autor: "Dr. Andrés Martínez", tipo: "Control cardiovascular", nota: "Control tensional aceptable. Se recalca restricción estricta de sodio en dieta y se ordena perfil lipídico y glicemia en ayunas." }
      ]
    },
    {
      id: "SD-10519",
      tipoDoc: "CC",
      doc: "52.901.337",
      nombre: "Ana Lucía Herrera",
      sexo: "F",
      fechaNacimiento: "1985-03-09",
      edad: 41,
      eps: "Compensar",
      regimen: "Contributivo",
      tel: "315 555 0931",
      email: "ana.herrera@diseno.net",
      direccion: "Av Boyacá # 68 - 12, Bogotá",
      contactoEmergencia: { nombre: "Mauricio Silva (Cónyuge)", tel: "315 777 4422" },
      medico: "Dra. Laura Gómez",
      estado: "Pendiente",
      consentimientoHabeasData: true,
      fechaConsentimiento: "2026-03-01T14:10:00Z",
      alergias: ["Mariscos", "Sulfas"],
      antec: ["Hipotiroidismo primario (2020)"],
      dx: ["Supervisión de embarazo normal, semana 18 (Z34.9)", "Hipotiroidismo en gestación (E03.9)"],
      meds: ["Ácido fólico 0.4 mg/día", "Carbonato de calcio 600 mg + Vit D", "Levotiroxina 50 mcg ayunas"],
      signos: {
        presion: "110/70",
        fc: "80 lpm",
        fr: "16 rpm",
        temp: "36.5 °C",
        peso: "68 kg",
        talla: "1.62 m",
        imc: "25.9",
        satO2: "99 %"
      },
      evol: [
        { fecha: "2026-10-02 10:10", autor: "Dra. Laura Gómez", tipo: "Control prenatal", nota: "Gestación de 18 semanas por FUM. FCF 146 lpm. Movimientos fetales positivos. Se ordena perfil tiroideo TSH para ajuste de levotiroxina." }
      ]
    },
    {
      id: "SD-10601",
      tipoDoc: "CC",
      doc: "1.017.220.904",
      nombre: "Jorge Iván Montoya",
      sexo: "M",
      fechaNacimiento: "1959-11-04",
      edad: 67,
      eps: "Nueva EPS",
      regimen: "Subsidiado",
      tel: "320 555 0118",
      email: "jorge.montoya@comunicaciones.co",
      direccion: "Calle 45 # 22 - 15, Medellín",
      contactoEmergencia: { nombre: "Andrea Montoya (Hija)", tel: "320 555 0119" },
      medico: "Dra. Laura Gómez",
      estado: "Activo",
      consentimientoHabeasData: true,
      fechaConsentimiento: "2026-01-22T08:15:00Z",
      alergias: ["Sulfonamidas"],
      antec: ["Diabetes Mellitus Tipo 2 (2010)", "Nefropatía diabética incipiente"],
      dx: ["Diabetes mellitus tipo 2 sin mención de complicación (E11.9)"],
      meds: ["Metformina 850 mg, 1 tab cada 12 horas", "Empagliflozina 10 mg al día"],
      signos: {
        presion: "126/80",
        fc: "74 lpm",
        fr: "17 rpm",
        temp: "36.7 °C",
        peso: "78 kg",
        talla: "1.70 m",
        imc: "26.9",
        satO2: "96 %"
      },
      evol: [
        { fecha: "2026-09-14 15:30", autor: "Dra. Laura Gómez", tipo: "Consulta endocrinología", nota: "HbA1c previa 7.4%. Se refuerza plan nutricional con bajo índice glicémico y actividad física aeróbica 150 min/sem." }
      ]
    }
  ],

  appointments: [
    { id: "apt-101", fecha: "2026-10-07", hora: "08:00", pacId: "SD-10482", pacNombre: "María Fernanda López", esp: "Medicina general", med: "Dr. Andrés Martínez", consultorio: "Cons. 201", est: "Atendida", canal: "Recepción", motivo: "Control rinitis y revisión médica", triage: "Verde (Baja prioridad)" },
    { id: "apt-102", fecha: "2026-10-07", hora: "09:00", pacId: "SD-10377", pacNombre: "Carlos Andrés Ruiz", esp: "Medicina general", med: "Dr. Andrés Martínez", consultorio: "Cons. 201", est: "Confirmada", canal: "App SaludDigital", motivo: "Chequeo de tensión arterial y fórmula", triage: "Verde" },
    { id: "apt-103", fecha: "2026-10-07", hora: "10:30", pacId: "SD-10519", pacNombre: "Ana Lucía Herrera", esp: "Ginecología", med: "Dra. Laura Gómez", consultorio: "Cons. 305", est: "Pendiente", canal: "App SaludDigital", motivo: "Control prenatal semana 18", triage: "Verde" },
    { id: "apt-104", fecha: "2026-10-07", hora: "11:00", pacId: "SD-10601", pacNombre: "Jorge Iván Montoya", esp: "Endocrinología", med: "Dra. Laura Gómez", consultorio: "Cons. 305", est: "Cancelada", canal: "Telefónico", motivo: "Control diabetes mellitus", triage: "Verde", motivoCancelacion: "Paciente solicita reprogramación por viaje familiar" },
    { id: "apt-105", fecha: "2026-10-08", hora: "08:30", pacId: "SD-10482", pacNombre: "María Fernanda López", esp: "Neumología", med: "Dr. Julián Restrepo", consultorio: "Cons. 208", est: "Confirmada", canal: "App SaludDigital", motivo: "Evaluación espirométrica asma", triage: "Verde" },
    { id: "apt-106", fecha: "2026-10-08", hora: "10:00", pacId: "SD-10377", pacNombre: "Carlos Andrés Ruiz", esp: "Medicina general", med: "Dr. Andrés Martínez", consultorio: "Cons. 201", est: "Confirmada", canal: "App SaludDigital", motivo: "Lectura de perfil lipídico", triage: "Verde" }
  ],

  labCatalog: {
    "Hemograma completo": { precio: 42000, cups: "902210", tiempoHoras: 1, parametros: [
      { p: "Hemoglobina", ref: "12.0 – 15.5 g/dL", unidad: "g/dL", min: 12.0, max: 15.5 },
      { p: "Hematocrito", ref: "36.0 – 48.0 %", unidad: "%", min: 36.0, max: 48.0 },
      { p: "Leucocitos", ref: "4.000 – 10.000 /µL", unidad: "/µL", min: 4000, max: 10000 },
      { p: "Plaquetas", ref: "150.000 – 400.000 /µL", unidad: "/µL", min: 150000, max: 400000 },
      { p: "Neutrófilos %", ref: "55.0 – 70.0 %", unidad: "%", min: 55.0, max: 70.0 }
    ]},
    "Glicemia en ayunas": { precio: 18000, cups: "903841", tiempoHoras: 1, parametros: [
      { p: "Glucosa sérica basal", ref: "70 – 100 mg/dL", unidad: "mg/dL", min: 70, max: 100 }
    ]},
    "Perfil tiroideo (TSH)": { precio: 65000, cups: "904903", tiempoHoras: 2, parametros: [
      { p: "TSH Ultrasensible", ref: "0.40 – 4.50 µUI/mL", unidad: "µUI/mL", min: 0.40, max: 4.50 },
      { p: "T4 Libre", ref: "0.80 – 1.80 ng/dL", unidad: "ng/dL", min: 0.80, max: 1.80 }
    ]},
    "Hemoglobina glicosilada (HbA1c)": { precio: 48000, cups: "903867", tiempoHoras: 2, parametros: [
      { p: "HbA1c", ref: "< 5.7 % (Normal), 5.7-6.4 (Prediabetes), >=6.5 (Diabetes)", unidad: "%", min: 4.0, max: 5.7 }
    ]},
    "Creatinina en suero": { precio: 22000, cups: "903825", tiempoHoras: 1, parametros: [
      { p: "Creatinina sérica", ref: "0.60 – 1.20 mg/dL", unidad: "mg/dL", min: 0.60, max: 1.20 }
    ]},
    "Perfil lipídico completo": { precio: 58000, cups: "903801", tiempoHoras: 2, parametros: [
      { p: "Colesterol Total", ref: "< 200 mg/dL", unidad: "mg/dL", min: 0, max: 200 },
      { p: "Triglicéridos", ref: "< 150 mg/dL", unidad: "mg/dL", min: 0, max: 150 },
      { p: "Colesterol HDL", ref: "> 45 mg/dL", unidad: "mg/dL", min: 45, max: 100 },
      { p: "Colesterol LDL", ref: "< 100 mg/dL", unidad: "mg/dL", min: 0, max: 100 }
    ]}
  },

  labOrders: [
    {
      id: "lab-101",
      pacId: "SD-10482",
      pacNombre: "María Fernanda López",
      ex: "Hemograma completo",
      cups: "902210",
      med: "Dr. Andrés Martínez",
      fechaSolicitud: "2026-10-07 08:40",
      fechaPublicacion: "2026-10-07 09:18",
      tiempoProcesamientoMinutos: 38,
      est: "Publicado", // "Pendiente", "En proceso", "Publicado"
      bacteriologo: "Daniela Ortega",
      res: [
        { p: "Hemoglobina", v: "13.8 g/dL", r: "12.0 – 15.5", f: "Normal" },
        { p: "Hematocrito", v: "41.5 %", r: "36.0 – 48.0", f: "Normal" },
        { p: "Leucocitos", v: "11.200 /µL", r: "4.000 – 10.000", f: "Alto" },
        { p: "Plaquetas", v: "240.000 /µL", r: "150.000 – 400.000", f: "Normal" },
        { p: "Neutrófilos %", v: "68.0 %", r: "55.0 – 70.0", f: "Normal" }
      ],
      observaciones: "Leve leucocitosis reactiva. Concordante con cuadro alérgico/respiratorio.",
      cobrado: true,
      facturaId: "FE-3382"
    },
    {
      id: "lab-102",
      pacId: "SD-10377",
      pacNombre: "Carlos Andrés Ruiz",
      ex: "Glicemia en ayunas",
      cups: "903841",
      med: "Dr. Andrés Martínez",
      fechaSolicitud: "2026-10-07 09:15",
      fechaPublicacion: null,
      tiempoProcesamientoMinutos: null,
      est: "Pendiente",
      bacteriologo: null,
      res: [],
      observaciones: "",
      cobrado: false
    },
    {
      id: "lab-103",
      pacId: "SD-10519",
      pacNombre: "Ana Lucía Herrera",
      ex: "Perfil tiroideo (TSH)",
      cups: "904903",
      med: "Dra. Laura Gómez",
      fechaSolicitud: "2026-10-07 10:05",
      fechaPublicacion: null,
      tiempoProcesamientoMinutos: null,
      est: "En proceso",
      bacteriologo: "Daniela Ortega",
      res: [
        { p: "TSH Ultrasensible", v: "3.12 µUI/mL", r: "0.40 – 4.50", f: "Normal" }
      ],
      observaciones: "Pendiente validación de T4 libre.",
      cobrado: false
    }
  ],

  medsCatalog: [
    { id: "m1", n: "Loratadina", pres: "10 mg · caja × 10", via: "Oral", lote: "L-90214", vence: "2028-06", stock: 48, min: 20, precio: 9500, invima: "INVIMA 2021M-0012984" },
    { id: "m2", n: "Losartán Potásico", pres: "50 mg · caja × 30", via: "Oral", lote: "L-88120", vence: "2027-11", stock: 12, min: 15, precio: 18000, invima: "INVIMA 2020M-0008432" },
    { id: "m3", n: "Metformina Clorhidrato", pres: "850 mg · caja × 30", via: "Oral", lote: "L-77402", vence: "2027-09", stock: 6, min: 15, precio: 14500, invima: "INVIMA 2019M-0003190" },
    { id: "m4", n: "Ácido Fólico", pres: "0.4 mg · caja × 30", via: "Oral", lote: "L-99015", vence: "2028-01", stock: 70, min: 25, precio: 7200, invima: "INVIMA 2022M-0018741" },
    { id: "m5", n: "Salbutamol Aerosol", pres: "Inhalador 100 mcg (200 dosis)", via: "Inhalada", lote: "L-60411", vence: "2027-05", stock: 22, min: 10, precio: 26000, invima: "INVIMA 2021M-0015520" },
    { id: "m6", n: "Atorvastatina", pres: "20 mg · caja × 30", via: "Oral", lote: "L-54210", vence: "2028-03", stock: 35, min: 15, precio: 24000, invima: "INVIMA 2020M-0009941" },
    { id: "m7", n: "Amoxicilina", pres: "500 mg · caja × 21", via: "Oral", lote: "L-41029", vence: "2027-12", stock: 18, min: 15, precio: 19500, invima: "INVIMA 2021M-0014112", grupo: "Penicilinas" },
    { id: "m8", n: "Ibuprofeno", pres: "400 mg · caja × 20", via: "Oral", lote: "L-33901", vence: "2028-04", stock: 40, min: 20, precio: 11000, invima: "INVIMA 2022M-0016482", grupo: "AINES" }
  ],

  pharmacyOrders: [
    {
      id: "rx-201",
      pacId: "SD-10482",
      pacNombre: "María Fernanda López",
      med: "Loratadina",
      pres: "10 mg · caja × 10",
      dosis: "10 mg",
      frec: "1 tableta cada 24 horas por 10 días",
      duracion: "10 días",
      prof: "Dr. Andrés Martínez",
      fechaOrden: "2026-10-07 08:35",
      est: "Pendiente", // "Pendiente", "Dispensado", "Parcial", "Cancelado"
      entrega: null
    },
    {
      id: "rx-202",
      pacId: "SD-10377",
      pacNombre: "Carlos Andrés Ruiz",
      med: "Losartán Potásico",
      pres: "50 mg · caja × 30",
      dosis: "50 mg",
      frec: "1 tableta cada 12 horas",
      duracion: "30 días",
      prof: "Dr. Andrés Martínez",
      fechaOrden: "2026-10-07 08:15",
      est: "Dispensado",
      entrega: {
        por: "Esteban Rojas (QF)",
        recibe: "Carmen Ruiz",
        doc: "CC 39.877.120",
        rel: "Esposa",
        fecha: "2026-10-07 08:52",
        cantEntregada: 60,
        lote: "L-88120"
      }
    },
    {
      id: "rx-203",
      pacId: "SD-10601",
      pacNombre: "Jorge Iván Montoya",
      med: "Metformina Clorhidrato",
      pres: "850 mg · caja × 30",
      dosis: "850 mg",
      frec: "1 tableta con desayuno y cena",
      duracion: "30 días",
      prof: "Dra. Laura Gómez",
      fechaOrden: "2026-09-14 15:45",
      est: "Parcial",
      entrega: {
        por: "Esteban Rojas (QF)",
        recibe: "Jorge Iván Montoya",
        doc: "CC 1.017.220.904",
        rel: "El mismo paciente",
        fecha: "2026-09-14 16:10",
        cantEntregada: 30,
        lote: "L-77402",
        observacion: "Faltan 30 tabletas por quiebre de stock en proveedor"
      }
    }
  ],

  invoices: [
    {
      id: "fac-1",
      fac: "FE-3381",
      pacId: "SD-10377",
      pacNombre: "Carlos Andrés Ruiz",
      doc: "CC 80.215.640",
      eps: "Sanitas EPS",
      serv: "Consulta medicina general",
      tipo: "Consulta Médica",
      fecha: "2026-10-02",
      valorTotal: 85000,
      cubiertoEps: 75000,
      copagoPaciente: 10000,
      est: "Pagada",
      metodoPago: "Tarjeta débito",
      conf: "Paola Vargas"
    },
    {
      id: "fac-2",
      fac: "FE-3382",
      pacId: "SD-10482",
      pacNombre: "María Fernanda López",
      doc: "CC 1.032.458.771",
      eps: "Sura EPS",
      serv: "Hemograma completo (CUPS 902210)",
      tipo: "Laboratorio Clínico",
      fecha: "2026-10-07",
      valorTotal: 42000,
      cubiertoEps: 37000,
      copagoPaciente: 5000,
      est: "Por confirmar",
      metodoPago: null,
      conf: null
    },
    {
      id: "fac-3",
      fac: "FE-3290",
      pacId: "SD-10601",
      pacNombre: "Jorge Iván Montoya",
      doc: "CC 1.017.220.904",
      eps: "Nueva EPS",
      serv: "Consulta especializada endocrinología",
      tipo: "Consulta Especializada",
      fecha: "2026-09-14",
      valorTotal: 120000,
      cubiertoEps: 110000,
      copagoPaciente: 10000,
      est: "Vencida",
      metodoPago: null,
      conf: "Paola Vargas"
    },
    {
      id: "fac-4",
      fac: "FE-3383",
      pacId: "SD-10377",
      pacNombre: "Carlos Andrés Ruiz",
      doc: "CC 80.215.640",
      eps: "Sanitas EPS",
      serv: "Dispensación Losartán Potásico 50 mg x 60 tab",
      tipo: "Farmacia",
      fecha: "2026-10-07",
      valorTotal: 36000,
      cubiertoEps: 36000,
      copagoPaciente: 0,
      est: "Pagada",
      metodoPago: "Convenio EPS Sanitas",
      conf: "Paola Vargas"
    }
  ],

  // Audit Log conforming to Ley 1581 de 2012 (Habeas Data) & Clinical Safety
  auditLogs: [
    { id: "aud-1", timestamp: "2026-10-07T08:00:12Z", usuario: "admin.pena", rol: "admin", accion: "LOGIN", detalle: "Inicio de sesión exitoso desde consola de recepción", ip: "192.168.10.15", pacienteId: null },
    { id: "aud-2", timestamp: "2026-10-07T08:02:45Z", usuario: "admin.pena", rol: "admin", accion: "CONSULTA_AGENDA", detalle: "Visualización de agenda general del día", ip: "192.168.10.15", pacienteId: null },
    { id: "aud-3", timestamp: "2026-10-07T08:15:20Z", usuario: "dr.martinez", rol: "medico", accion: "APERTURA_HCE", detalle: "Apertura de historia clínica de paciente asignado", ip: "192.168.20.101", pacienteId: "SD-10482" },
    { id: "aud-4", timestamp: "2026-10-07T08:35:10Z", usuario: "dr.martinez", rol: "medico", accion: "GENERACION_RECETA", detalle: "Prescripción de Loratadina 10mg enviada a Farmacia", ip: "192.168.20.101", pacienteId: "SD-10482" },
    { id: "aud-5", timestamp: "2026-10-07T08:40:05Z", usuario: "dr.martinez", rol: "medico", accion: "ORDEN_LABORATORIO", detalle: "Orden de Hemograma completo enviada a LIS", ip: "192.168.20.101", pacienteId: "SD-10482" },
    { id: "aud-6", timestamp: "2026-10-07T09:18:22Z", usuario: "lab.ortega", rol: "laboratorio", accion: "PUBLICACION_RESULTADO", detalle: "Resultados de Hemograma publicados. Validador: Daniela Ortega", ip: "192.168.30.50", pacienteId: "SD-10482" },
    { id: "aud-7", timestamp: "2026-10-07T09:22:10Z", usuario: "fact.vargas", rol: "facturacion", accion: "CARGO_AUTOMATICO", detalle: "Recepción de cargo automático para facturación FE-3382", ip: "192.168.40.12", pacienteId: "SD-10482" }
  ],

  // Emergency Break-Glass records
  emergencyAccesses: []
};

class Store {
  constructor() {
    this.data = initialData;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.data = JSON.parse(raw);
      } else {
        this.save();
      }
    } catch (e) {
      console.warn("Could not load db.json, using initial data", e);
      this.data = initialData;
    }
  }

  save() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) {
      console.error("Error saving db.json", e);
    }
  }

  logAudit({ usuario, rol, accion, detalle, ip = "127.0.0.1", pacienteId = null }) {
    const entry = {
      id: "aud-" + (this.data.auditLogs.length + 1),
      timestamp: new Date().toISOString(),
      usuario,
      rol,
      accion,
      detalle,
      ip,
      pacienteId
    };
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 500) this.data.auditLogs.pop();
    this.save();
    return entry;
  }
}

const store = new Store();
module.exports = store;
