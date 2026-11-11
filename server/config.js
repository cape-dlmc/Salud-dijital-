const path = require('path');

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DB_FILE: process.env.DB_FILE || path.join(__dirname, 'data', 'db.json'),
  PUBLIC_DIR: path.join(__dirname, '..', 'public'),
  // Minutos que dura una sesión sin uso
  SESSION_TTL_MS: (Number(process.env.SESSION_TTL_MINUTES) || 480) * 60 * 1000,
  // Minutos de acceso de emergencia (break-glass) a pacientes no asignados
  BREAK_GLASS_MS: 30 * 60 * 1000,
  // Intentos fallidos antes de bloquear un usuario temporalmente
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCK_MS: 15 * 60 * 1000,
  // Mostrar cuentas de demostración en la pantalla de acceso (solo para pruebas)
  DEMO_MODE: process.env.DEMO_MODE !== 'false',
  // Orígenes permitidos para CORS (vacío = solo mismo origen)
  CORS_ORIGINS: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
};
