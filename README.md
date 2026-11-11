# SaludDigital · Plataforma hospitalaria v1.1

Plataforma para clínicas: agenda, admisión, historia clínica, laboratorio, farmacia, facturación e indicadores, con interoperabilidad FHIR R4.

## Puesta en marcha

Requisitos: Node.js 18 o superior.

```bash
npm install
npm start          # http://localhost:3000
npm test           # 18 pruebas de integración (usan una base temporal)
```

Variables de entorno opcionales:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | 3000 | Puerto HTTP |
| `DB_FILE` | `server/data/db.json` | Archivo de datos |
| `SESSION_TTL_MINUTES` | 480 | Duración de la sesión sin actividad |
| `DEMO_MODE` | activo | `false` oculta las cuentas de demostración en la pantalla de acceso |
| `CORS_ORIGINS` | vacío | Orígenes permitidos separados por coma |

Cuentas de demostración (cambie las contraseñas antes de usar datos reales): `admin.pena`, `dr.martinez`, `dra.gomez`, `dr.restrepo`, `lab.ortega`, `farm.rojas`, `fact.vargas`, `gerencia`, `paciente.maria`.

## Estructura

```
server/
  index.js              Arranque de la aplicación, cabeceras y manejo de errores
  config.js             Configuración desde variables de entorno
  roles.js              Perfiles y módulos visibles por perfil
  data/store.js         Persistencia en JSON, migración y bitácora
  lib/security.js       Contraseñas (scrypt), sesiones por token y bloqueo por intentos
  lib/access.js         Reglas de acceso a la historia clínica (asignación y emergencia)
  lib/validate.js       Validaciones y generación de IDs
  middleware/auth.js    Autenticación Bearer y requireRole(...)
  routes/               auth, patients, appointments, lab, pharmacy, billing, kpis, fhir, audit
public/
  index.html · css/style.css · js/app.js
test/api.test.js        Pruebas de integración
```

## Seguridad

- **Autenticación real**: el login devuelve un token; cada petición lo envía en `Authorization: Bearer`. Se eliminó el header `x-user-id`, que cualquiera podía falsificar.
- **Contraseñas cifradas** con scrypt. Las bases antiguas con contraseñas en texto plano se migran automáticamente al iniciar.
- **Las cuentas de demostración ya no envían contraseñas** al navegador.
- **Bloqueo temporal** tras 5 intentos fallidos (15 minutos).
- **Control por rol en cada ruta**, no solo en el menú. Un médico solo ve y escribe en la historia de sus pacientes asignados, salvo acceso de emergencia de 30 minutos, que queda registrado en la bitácora.
- **Administración sin acceso clínico**: el perfil admin recibe datos administrativos; gerencia recibe indicadores anonimizados.
- **Reseteo de contraseña** por el administrador (devuelve una clave temporal una sola vez) y cambio de contraseña por el propio usuario.

## Matriz de acceso resumida

| Función | Admin | Médico | Laboratorio | Farmacia | Facturación | Gerencia | Paciente |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Admitir paciente / reasignar médico | ✔ | | | | | | |
| Ver historia clínica | | asignados | | alergias y medicamentos | | | propia |
| Notas, diagnósticos, signos vitales | | asignados | | | | | |
| Órdenes de laboratorio | | asignados | | | | | |
| Capturar y publicar resultados | | | ✔ | | | | |
| Prescribir | | asignados | | | | | |
| Dispensar medicamentos | | | | ✔ | | | |
| Facturar, confirmar y cobrar | | | | | ✔ | | |
| Agenda | ✔ | propia | | | | | propia |
| Bitácora de auditoría | ✔ | | | | | ✔ | |
| Indicadores (KPIs) | | | | | | ✔ | |

## Cambios de esta versión

- Se eliminaron las referencias a leyes en el código, la interfaz, los mensajes de la API y la consola.
- Se corrigieron errores de ejecución al crear órdenes de laboratorio y prescripciones (`pacienteId` no estaba definido).
- Al cancelar una dispensación ya no se descuenta inventario.
- Los tiempos de laboratorio se calculan con la hora real de solicitud y publicación.
- La publicación de laboratorio ya no afirma notificaciones que el sistema no envía.
- Se corrigió la generación de IDs que podía repetirse después de eliminar registros.
- Se separó el código en configuración, seguridad, reglas de acceso, validación y rutas.
- Se añadieron cabeceras de seguridad, límite de tamaño en las peticiones y respuestas de error consistentes.

## Pendientes recomendados

- Persistir sesiones en almacenamiento externo (hoy están en memoria y se pierden al reiniciar).
- Migrar de JSON a una base de datos (PostgreSQL) antes de datos reales.
- Cifrado en tránsito (HTTPS) y cambio obligatorio de contraseña temporal en el primer ingreso.
- Algunos indicadores de gerencia (satisfacción, serie semanal) son de referencia hasta conectar sus fuentes.
- Revisar con el área jurídica y de cumplimiento los requisitos de protección de datos aplicables a la clínica.
