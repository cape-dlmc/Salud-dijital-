/**
 * Motor de Apoyo a la Decisión Clínica (CDS) y Detección Inteligente de Problemas
 * Analiza el estado y relato del paciente para autogenerar problemas estructurados con CIE-10
 */

const CLINICAL_PATTERNS = [
  {
    regex: /(dolor de cabeza|cefalea|jaqueca|migra[ñn]a|hemicranea|punzada en la cabeza)/i,
    problema: "Cefalea tensional / Síndrome migrañoso",
    cie10: "G43.9",
    categoria: "Neurológico",
    especialidadSugerida: "Neurología",
    alerta: false,
    sugerencia: "Evaluar signos de alarma (banderas rojas), fondo de ojo y respuesta a analgésicos de primera línea."
  },
  {
    regex: /(presi[oó]n alta|hipertens|tasi|ta elevada|1[4-9]\d\/[8-9]\d|2\d\d\/1\d\d|tensi[oó]n arterial alta)/i,
    problema: "Hipertensión arterial esencial en estudio / descontrol tensional",
    cie10: "I10",
    categoria: "Cardiovascular",
    especialidadSugerida: "Cardiología preventiva",
    alerta: true,
    sugerencia: "Solicitar perfil lipídico, creatinina, EKG y monitoreo ambulatorio de presión arterial (MAPA)."
  },
  {
    regex: /(dolor en el pecho|dolor precordial|opresi[oó]n tor[aá]cica|angina|palpitaciones r[aá]pidas|taquicardia)/i,
    problema: "Dolor torácico / Sospecha patología coronaria o arritmia",
    cie10: "R07.4",
    categoria: "Cardiovascular",
    especialidadSugerida: "Cardiología preventiva",
    alerta: true,
    urgente: true,
    sugerencia: "¡ALERTA CRÍTICA! Realizar electrocardiograma inmediato y descartar síndrome coronario agudo."
  },
  {
    regex: /(dificultad para respirar|disnea|falta de aire|ahogo|sibilanc|asma|pecho le chilla|broncoespasmo)/i,
    problema: "Crisis asmática / Disnea en estudio / Broncoespasmo",
    cie10: "J45.9",
    categoria: "Respiratorio",
    especialidadSugerida: "Neumología",
    alerta: true,
    sugerencia: "Verificar saturación de O2, murmullo vesicular, espiración prolongada. Ordenar espirometría o Rx de tórax."
  },
  {
    regex: /(tos persistente|tos seca|tos con flema|expectoraci[oó]n|flemas amarillas|congesti[oó]n pulmonar)/i,
    problema: "Infección respiratoria baja / Bronquitis aguda",
    cie10: "J20.9",
    categoria: "Respiratorio",
    especialidadSugerida: "Neumología",
    alerta: false,
    sugerencia: "Evaluar auscultación pulmonar; si dura > 2 semanas descartar etiología crónica o infecciosa."
  },
  {
    regex: /(congesti[oó]n nasal|rinorrea|moco|estornudadera|rinitis|picaz[oó]n en la nariz)/i,
    problema: "Rinitis alérgica / Rinofaringitis aguda",
    cie10: "J30.9",
    categoria: "Respiratorio / Alergias",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Tratamiento sintomático con antihistamínico y control de factores ambientales desencadenantes."
  },
  {
    regex: /(ardor en el est[oó]mago|acidez|gastritis|reflujo|agruras|epigastralgia|dolor en la boca del est[oó]mago)/i,
    problema: "Enfermedad por reflujo gastroesofágico / Dispepsia",
    cie10: "K21.9",
    categoria: "Gastrointestinal",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Indicar inhibidor de bomba de protones y pautas dietarias antirreflujo."
  },
  {
    regex: /(dolor de est[oó]mago|dolor abdominal|diarrea|v[oó]mito|retorcij[oó]n|n[aá]useas)/i,
    problema: "Gastroenteritis aguda / Dolor abdominal a clasificar",
    cie10: "A09",
    categoria: "Gastrointestinal",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Hidratación oral, reposición de electrolitos y vigilar signos de irritación peritoneal."
  },
  {
    regex: /(az[uú]car alta|glicemia|glucosa elevada|sed excesiva|polidipsia|orina mucho|poliuria|diabetes)/i,
    problema: "Sospecha Diabetes Mellitus / Alteración metabolismo de glucosa",
    cie10: "E11.9",
    categoria: "Endocrino",
    especialidadSugerida: "Endocrinología",
    alerta: true,
    sugerencia: "Solicitar hemoglobina glicada (HbA1c), glicemia en ayunas y remitir a endocrinología."
  },
  {
    regex: /(tiroides|hipotiroidismo|cansancio extremo|ca[ií]da de cabello|intolerancia al fr[ií]o)/i,
    problema: "Trastorno tiroideo en estudio / Hipotiroidismo no especificado",
    cie10: "E03.9",
    categoria: "Endocrino",
    especialidadSugerida: "Endocrinología",
    alerta: false,
    sugerencia: "Solicitar TSH y T4 libre de control."
  },
  {
    regex: /(dolor lumbar|dolor de espalda|lumbalgia|ci[aá]tica|lumbago|punzada en la cintura)/i,
    problema: "Lumbalgia mecánica / Radiculopatía lumbar",
    cie10: "M54.5",
    categoria: "Musculoesquelético",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Higiene postural, analgésico de rescate y remitir a fisioterapia si no cede."
  },
  {
    regex: /(dolor en la rodilla|articulaci[oó]n inflamada|artritis|dolor articular|artralgia)/i,
    problema: "Poliartralgia / Trastorno articular no especificado",
    cie10: "M25.5",
    categoria: "Musculoesquelético",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Exploración articular, Rx comparativa de articulación comprometida."
  },
  {
    regex: /(c[oó]lico menstrual|dismenorrea|sangrado abundante|dolor p[eé]lvico|retraso menstrual)/i,
    problema: "Dismenorrea / Trastorno menstrual no especificado",
    cie10: "N94.6",
    categoria: "Ginecología",
    especialidadSugerida: "Ginecología",
    alerta: false,
    sugerencia: "Ecografía pélvica/transvaginal y remisión a consulta especializada de ginecología."
  },
  {
    regex: /(brote|ronchas|erupci[oó]n|picaz[oó]n en la piel|prurito|eccema|dermatitis)/i,
    problema: "Dermatitis alérgica / Erupción cutánea no especificada",
    cie10: "L23.9",
    categoria: "Dermatología",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Tratamiento tópico o antihistamínico oral; evaluar alérgenos de contacto recientes."
  },
  {
    regex: /(fiebre|calentura|temperatura|pirexia|escalofr[ií]os)/i,
    problema: "Síndrome febril agudo en estudio",
    cie10: "R50.9",
    categoria: "Infeccioso / General",
    especialidadSugerida: "Medicina general",
    alerta: true,
    sugerencia: "Identificar foco infeccioso (respiratorio, urinario, cutáneo). Solicitar hemograma completo."
  },
  {
    regex: /(ansiedad|angustia|ataque de p[aá]nico|insomnio|no puede dormir|estres|nervios)/i,
    problema: "Trastorno de ansiedad generalizada / Trastorno del sueño",
    cie10: "F41.1",
    categoria: "Salud Mental",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Pautas de higiene del sueño, apoyo psicosocial y valoración de tratamiento de soporte."
  },
  {
    regex: /(cansancio|fatiga|agotamiento|astenia|debilidad generalizada)/i,
    problema: "Síndrome de fatiga y astenia / Estudio de anemia",
    cie10: "R53",
    categoria: "General",
    especialidadSugerida: "Medicina general",
    alerta: false,
    sugerencia: "Solicitar hemograma, ferritina y electrolitos para descartar anemia o deficiencias."
  }
];

function analyzeSymptoms(text) {
  if (!text || typeof text !== 'string') return [];
  const clean = text.trim();
  const matched = [];
  const seenCie = new Set();

  for (const pattern of CLINICAL_PATTERNS) {
    if (pattern.regex.test(clean)) {
      if (!seenCie.has(pattern.cie10)) {
        seenCie.add(pattern.cie10);
        matched.push({
          nombre: `${pattern.problema} (${pattern.cie10})`,
          problema: pattern.problema,
          cie10: pattern.cie10,
          categoria: pattern.categoria,
          especialidadSugerida: pattern.especialidadSugerida,
          alerta: pattern.alerta,
          urgente: !!pattern.urgente,
          sugerencia: pattern.sugerencia
        });
      }
    }
  }

  // Si no hubo coincidencia específica pero hay texto sustancial, proveer diagnóstico de evaluación médica
  if (matched.length === 0 && clean.length > 15) {
    matched.push({
      nombre: "Consulta médica de evaluación general (Z00.0)",
      problema: "Evaluación médica general y seguimiento clínico",
      cie10: "Z00.0",
      categoria: "Medicina Preventiva / General",
      especialidadSugerida: "Medicina general",
      alerta: false,
      urgente: false,
      sugerencia: "Complementar anamnesis dirigida, antecedentes patológicos y examen físico céfalo-caudal."
    });
  }

  return matched;
}

module.exports = { analyzeSymptoms };
