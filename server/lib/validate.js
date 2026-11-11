// Pequeñas utilidades de validación de entrada
const isNonEmptyString = v => typeof v === 'string' && v.trim().length > 0;
const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isPositiveInt = v => Number.isInteger(Number(v)) && Number(v) > 0;

// Siguiente ID numérico con prefijo, sin colisionar con IDs existentes
function nextId(list, prefix, field = 'id', start = 1) {
  let max = start - 1;
  list.forEach(item => {
    const n = parseInt(String(item[field]).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  });
  return `${prefix}${max + 1}`;
}

module.exports = { isNonEmptyString, isDate, isPositiveInt, nextId };
