## Why

`POST /api/v1/issues` acepta actualmente peticiones sin autenticacion y la configuracion permite combinaciones inseguras de CORS, proxy y rate limiting. El piloto interno necesita una frontera de entrada minima, configuracion reproducible y dependencias sin vulnerabilidades conocidas de severidad alta antes de escalar el procesamiento.

## What Changes

- **BREAKING**: exigir una API key valida en `POST /api/v1/issues`, enviada mediante el nombre de cabecera configurado en `API_KEY_HEADER`.
- Mantener `/health` sin autenticacion para comprobaciones de vida.
- Validar en el arranque las combinaciones de CORS, credenciales y proxy; aplicar rate limiting usando una direccion de cliente confiable.
- Alinear `.env.example` con las variables reales del orquestador y documentar exclusivamente valores ficticios.
- Actualizar dependencias con vulnerabilidades conocidas y eliminar `bcryptjs` y `jsonwebtoken` si siguen sin uso.
- **BREAKING**: dejar de devolver y registrar el payload Jira completo; la respuesta conservara identificadores, estado, errores y `201 Created`.
- Mantener exactamente un ticket por llamada y el rechazo de cero o varios tickets.

## Capabilities

### New Capabilities

- `secure-jira-ingestion`: autenticacion, configuracion de red segura, minimizacion de datos y mantenimiento de dependencias para la entrada Jira.

### Modified Capabilities

Ninguna. No existe una especificacion canonica previa en `openspec/specs/` para la seguridad de la ingesta.

## Impact

- Afecta configuracion de entorno, middleware Express, respuesta del controlador, logger, pruebas, Postman, `package.json` y lockfile.
- Los consumidores deberan enviar la cabecera API key y dejar de depender del eco completo del ticket en la respuesta.
- No modifica la traduccion, los mappings, las colecciones MongoDB ni la llamada al orquestador.
- Las claves reales permaneceran fuera del repositorio y de los logs.
