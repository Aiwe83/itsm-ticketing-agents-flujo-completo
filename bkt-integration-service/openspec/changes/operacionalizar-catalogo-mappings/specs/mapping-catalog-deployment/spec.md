## ADDED Requirements

### Requirement: Catalogo versionado y validable
El sistema MUST tratar `catalog.json` como fuente documental versionada y MUST validar su estructura y reglas de integridad antes de compararlo o aplicarlo.

#### Scenario: Catalogo valido
- **WHEN** un operador ejecuta la validacion sobre un catalogo con version, contexto y mappings confirmados validos
- **THEN** el sistema acepta el catalogo para calcular diferencias

#### Scenario: Mapping no valido
- **WHEN** el catalogo contiene `content.statusSp`, un mapping general de `fields`, un destino confirmado duplicado o un transformador desconocido
- **THEN** el sistema informa los errores y no escribe en MongoDB

### Requirement: Comparacion sin escritura
El comando `mappings:dry-run` MUST mostrar las diferencias entre el catalogo y MongoDB sin modificar ningun documento.

#### Scenario: Diferencias visibles
- **WHEN** el catalogo contiene mappings nuevos o modificados
- **THEN** el comando muestra los grupos `added`, `updated`, `unchanged`, `conflicts` y `mongoOnly` sin realizar escrituras

### Requirement: Aplicacion confirmada e idempotente
El comando `mappings:apply` MUST exigir la confirmacion explicita de la version y MUST actualizar los mappings mediante una identidad logica estable.

#### Scenario: Version no confirmada
- **WHEN** el operador omite `--confirm-version` o indica una version distinta de `catalogVersion`
- **THEN** el comando termina sin escribir en MongoDB

#### Scenario: Aplicacion repetida
- **WHEN** se aplica dos veces el mismo catalogo confirmado al mismo contexto
- **THEN** la segunda aplicacion no crea duplicados y el resultado queda clasificado como `unchanged`

### Requirement: Carga limitada a mappings confirmados
El sistema MUST excluir de MongoDB candidatos pendientes, campos excluidos, propiedades documentales con prefijo `_` y cualquier seccion que no pertenezca al modelo `Mapping`.

#### Scenario: Evidencia documental presente
- **WHEN** una entrada confirmada contiene `_evidence`
- **THEN** el mapping se puede aplicar pero `_evidence` no se persiste en MongoDB

### Requirement: Sin borrado automatico
El sistema MUST informar los mappings que solo existen en MongoDB y MUST NOT eliminarlos durante `mappings:apply`.

#### Scenario: Mapping solo en MongoDB
- **WHEN** la comparacion encuentra un mapping ausente del catalogo
- **THEN** el mapping aparece como `mongoOnly` y permanece intacto

### Requirement: Contexto protegido
El sistema MUST comprobar que `meshId` del catalogo coincide con el contexto operativo antes de escribir.

#### Scenario: Contexto diferente
- **WHEN** el catalogo pertenece a un contexto distinto del configurado
- **THEN** la aplicacion se rechaza sin cambios parciales

### Requirement: Transformadores cerrados
El sistema MUST aceptar solamente `copy`, `mapToString` y `severity`, y MUST NOT tratar un transformador desconocido como `copy`.

#### Scenario: Transformador no soportado durante procesamiento
- **WHEN** un mapping activo declara un transformador fuera de la lista permitida
- **THEN** el ticket falla de forma trazable antes de producir una traduccion incorrecta
