## Context

Express aplica Helmet, CORS y rate limiting, pero `API_KEY_HEADER` solo se incluye entre las cabeceras permitidas y no existe middleware que autentique la peticion. `trust proxy` esta fijado a `1`, CORS permite por defecto origen `*` con credenciales y `.env.example` usa `ORCHESTRATOR_URL` aunque el codigo exige `ORCHESTRATOR_BASE_URL` y `ORCHESTRATOR_ENDPOINT`. La respuesta actual tambien devuelve el ticket original y traducido completos.

## Goals / Non-Goals

**Goals:**

- Autenticar la ingesta Jira con una clave gestionada por entorno.
- Evitar configuraciones de red incoherentes o inseguras.
- Reducir datos sensibles en respuestas y logs.
- Eliminar vulnerabilidades conocidas de severidad alta sin cambiar la logica de negocio.

**Non-Goals:**

- No introducir OAuth, JWT, usuarios ni roles.
- No autenticar `/health`.
- No modificar mappings, persistencia, adjuntos u orquestacion.
- No guardar claves en MongoDB ni en el repositorio.

## Decisions

### 1. API key mediante cabecera configurable

`INTEGRATION_API_KEY` sera obligatoria y el nombre de cabecera seguira definido por `API_KEY_HEADER`. El middleware protegera las rutas `/api/`, comparara valores con tiempo constante y respondera `401` con un cuerpo reducido cuando falte o no coincida la clave.

Alternativa descartada: JWT. Las llamadas son servicio a servicio y no existe identidad de usuario ni ciclo de emision de tokens.

### 2. Configuracion segura y validada al arrancar

Se anadira `TRUST_PROXY_HOPS` como entero no negativo. Si `CORS_CREDENTIALS=true`, `CORS_ORIGIN` no podra ser `*`. La aplicacion fallara al iniciar ante combinaciones invalidas. El rate limiter usara la configuracion de proxy ya validada.

### 3. Respuesta minima

Cada resultado devolvera `ticketId`, `issueId`, `success`, `errors`, `storedTicketId` y `receivedAt`, pero no `issue` ni `transformedIssue`. El estado HTTP correcto seguira siendo `201`; cero o varios tickets continuaran dando `400`.

### 4. Logging sin payloads ni secretos

El logger redactara de forma case-insensitive autorizacion, API key, cookies y contrasenas. Los eventos de ingesta registraran request ID, execution ID, ticket key, resultado y duracion, pero no el body.

### 5. Actualizacion controlada de dependencias

Se actualizaran primero Mongoose, Mammoth, Express Rate Limit y UUID a versiones corregidas compatibles. Se revisaran pruebas y build tras cada grupo. `bcryptjs` y `jsonwebtoken` se eliminaran junto con sus tipos solo si una busqueda completa confirma que no se usan.

## Risks / Trade-offs

- [Consumidores sin API key dejan de funcionar] -> Documentar la cabecera y actualizar Postman antes del despliegue.
- [Comparacion de clave filtra informacion] -> Usar buffers de igual longitud y `timingSafeEqual`.
- [Proxy mal configurado altera el rate limit] -> Validar `TRUST_PROXY_HOPS` y probar IP directa y proxy simulado.
- [Actualizacion de dependencias rompe tipos] -> Actualizar por grupos pequenos y ejecutar la suite en cada grupo.
- [Respuesta reducida rompe una demo] -> Actualizar guias para consultar el documento completo en MongoDB.

## Migration Plan

1. Incorporar variables ficticias y validacion de entorno.
2. Anadir middleware y pruebas de autenticacion.
3. Corregir CORS, proxy y rate limiting.
4. Minimizar respuesta y logs; actualizar Postman y documentacion.
5. Actualizar o eliminar dependencias y regenerar el lockfile.
6. Ejecutar auditoria, typecheck, lint, pruebas y build.

Rollback: restaurar temporalmente la version anterior del contenedor y sus variables. La base de datos no requiere rollback.

## Open Questions

- La clave definitiva y su mecanismo de distribucion se resolveran fuera del repositorio antes del despliegue.
