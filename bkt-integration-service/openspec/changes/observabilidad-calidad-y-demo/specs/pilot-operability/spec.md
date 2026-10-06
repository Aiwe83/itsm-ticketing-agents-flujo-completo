## ADDED Requirements

### Requirement: Estados explicitos por fase
Cada ejecucion nueva MUST registrar `integrationStatus`, `attachmentStatus` y `orchestratorStatus` con uno de estos valores: `pending`, `succeeded`, `failed` o `skipped`.

#### Scenario: Ticket completamente procesado
- **WHEN** la integracion, los adjuntos y el orquestador finalizan correctamente
- **THEN** las tres fases quedan en `succeeded`

#### Scenario: Orquestador omitido
- **WHEN** la configuracion indica que no debe llamarse al orquestador
- **THEN** `orchestratorStatus` queda en `skipped` y no se presenta como fallo

#### Scenario: Fallo posterior a la traduccion
- **WHEN** el ticket se guarda y traduce pero falla el procesamiento posterior
- **THEN** `integrationStatus` permanece en `succeeded` y solo la fase afectada queda en `failed`

### Requirement: Compatibilidad con booleanos anteriores
El sistema MUST conservar temporalmente los booleanos existentes y MUST derivarlos de los estados explicitos en nuevas escrituras.

#### Scenario: Consumidor anterior
- **WHEN** un consumidor consulta una ejecucion nueva usando los campos booleanos anteriores
- **THEN** recibe valores coherentes con los estados explicitos

#### Scenario: Ejecucion historica
- **WHEN** se consulta un documento que no contiene los nuevos estados
- **THEN** el sistema lo presenta sin exigir una migracion destructiva

### Requirement: Endpoint de liveness
`GET /health` MUST indicar solamente que el proceso HTTP esta vivo y MUST NOT depender de MongoDB, mappings u orquestador.

#### Scenario: MongoDB no disponible
- **WHEN** el proceso HTTP funciona pero MongoDB esta desconectado
- **THEN** `/health` sigue respondiendo como proceso vivo

### Requirement: Endpoint de readiness
`GET /ready` MUST comprobar MongoDB, indices obligatorios y mappings minimos del contexto, y MUST responder `503` cuando alguna dependencia requerida no este preparada.

#### Scenario: Servicio preparado
- **WHEN** MongoDB esta conectado, los indices existen y hay mappings validos para el contexto
- **THEN** `/ready` responde `200` con cada check en estado correcto

#### Scenario: Falta un requisito
- **WHEN** falta un indice o no existen mappings minimos del contexto
- **THEN** `/ready` responde `503` sin exponer credenciales ni datos internos sensibles

### Requirement: Correlacion de operaciones
Los logs MUST permitir relacionar peticion, ticket, trabajo, revision e intento mediante identificadores tecnicos.

#### Scenario: Reintento del worker
- **WHEN** un trabajo se reintenta
- **THEN** sus logs conservan el mismo `jobId` y muestran revision, numero de intento, fase y duracion

### Requirement: Logging sin datos sensibles
El sistema MUST NOT registrar payloads completos, adjuntos, descripciones, datos personales, tokens ni cabeceras de autenticacion.

#### Scenario: Error con payload sensible
- **WHEN** ocurre un error procesando un ticket con datos personales
- **THEN** el log contiene identificadores y error sanitizado, pero no el contenido del ticket
