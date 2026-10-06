## ADDED Requirements

### Requirement: Version de mapping en el ticket traducido
Cada ticket traducido nuevo MUST registrar la version del conjunto de mappings utilizado para transformarlo.

#### Scenario: Traduccion correcta
- **WHEN** un ticket se transforma con una instantanea valida de mappings
- **THEN** el documento final contiene `mappingVersion` con la version aplicada

### Requirement: Version de mapping en la ejecucion
Cada ejecucion de integracion nueva MUST registrar la misma version de mappings utilizada por sus tickets.

#### Scenario: Ejecucion trazable
- **WHEN** una ejecucion procesa un ticket con una version de mappings
- **THEN** la ejecucion y el ticket traducido exponen la misma `mappingVersion`

### Requirement: Compatibilidad historica
Los lectores MUST tolerar documentos historicos sin `mappingVersion` y MUST NOT requerir una migracion destructiva.

#### Scenario: Documento anterior al versionado
- **WHEN** se consulta un ticket o ejecucion historica sin `mappingVersion`
- **THEN** el documento sigue siendo legible y la ausencia se presenta como version no disponible

### Requirement: Instantanea coherente por ticket
El servicio MUST usar una sola version coherente de mappings durante todo el procesamiento de un ticket.

#### Scenario: Catalogo cambia durante el procesamiento
- **WHEN** una nueva version se aplica mientras un ticket ya esta siendo transformado
- **THEN** el ticket termina con la version que habia adquirido al iniciar su transformacion
