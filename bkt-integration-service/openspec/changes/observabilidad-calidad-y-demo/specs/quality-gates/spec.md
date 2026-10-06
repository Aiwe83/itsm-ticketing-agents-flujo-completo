## ADDED Requirements

### Requirement: Pipeline de calidad completo
El pipeline MUST ejecutar typecheck, comprobacion de formato, lint, Jest con cobertura, auditoria de produccion y build Docker antes de aceptar una entrega.

#### Scenario: Control falla
- **WHEN** cualquiera de los controles obligatorios termina con error
- **THEN** el pipeline falla y muestra cual fue el control incumplido

### Requirement: Configuracion compatible de lint y formato
El repositorio MUST disponer de configuracion plana para ESLint 9 y de scripts reproducibles para comprobar ESLint y Prettier.

#### Scenario: Codigo conforme
- **WHEN** se ejecutan lint y `format:check` sobre el repositorio
- **THEN** ambos comandos terminan correctamente sin modificar archivos

### Requirement: Cobertura sin regresiones
Jest MUST exigir inicialmente al menos 69% de sentencias, 51% de ramas, 53% de funciones y 70% de lineas; tras completar la outbox MUST exigir al menos 75% de sentencias y 60% de ramas sin reducir los otros minimos.

#### Scenario: Cobertura inferior al minimo
- **WHEN** una ejecucion de pruebas queda por debajo de cualquier umbral activo
- **THEN** el control de cobertura falla

### Requirement: Auditoria de dependencias
El pipeline MUST auditar dependencias de produccion y MUST impedir la entrega cuando existan vulnerabilidades `high` o `critical` no exceptuadas con una decision documentada y temporal.

#### Scenario: Vulnerabilidad alta
- **WHEN** la auditoria detecta una vulnerabilidad alta sin excepcion aprobada
- **THEN** el pipeline falla y muestra el paquete y la recomendacion disponible

### Requirement: Ensayo de escalabilidad del piloto
El repositorio MUST proporcionar un ensayo reproducible con dos APIs, dos workers y 50 peticiones concurrentes.

#### Scenario: Ensayo satisfactorio
- **WHEN** se ejecuta el ensayo en el entorno local de referencia
- **THEN** no se pierde ninguna peticion, no hay procesamiento duplicado, todos los trabajos terminan y el p95 de recepcion es inferior a un segundo

### Requirement: Demostracion manual breve
La documentacion MUST incluir un recorrido de Postman y MongoDB Compass realizable en dos minutos para mostrar el flujo principal y su trazabilidad.

#### Scenario: Demostracion al responsable
- **WHEN** una persona sigue la guia desde un entorno levantado
- **THEN** puede enviar un ticket y localizar raw, traducido, ejecucion y trabajo sin ejecutar comandos destructivos
