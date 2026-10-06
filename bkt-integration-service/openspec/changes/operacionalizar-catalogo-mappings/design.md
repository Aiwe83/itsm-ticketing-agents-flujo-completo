## Context

El catalogo actual separa `mappings`, `pendingCandidates`, `excludedFields` y candidatos de customfields sin resolver. Las entradas confirmadas contienen el contexto y los campos compatibles con el modelo Mongo, pero tambien incluyen `_evidence`, que es exclusivamente documental. El modelo `Mapping` asigna UUID aleatorios y el transformador actual tiene `copy` como valor predeterminado.

La operacion debe ser segura para un entorno interno: comparar primero, escribir solo con consentimiento explicito y poder identificar exactamente que version produjo cada ticket.

## Goals / Non-Goals

**Goals:**

- Validar estructural y semanticamente un catalogo antes de cualquier escritura.
- Mostrar una diferencia comprensible entre catalogo y MongoDB.
- Aplicar mappings confirmados de forma idempotente y auditable.
- Fallar de forma visible ante transformadores desconocidos.
- Asociar cada ticket traducido y ejecucion con la version utilizada.

**Non-Goals:**

- Borrar automaticamente mappings de MongoDB.
- Cargar candidatos pendientes o excluidos.
- Resolver customfields sin evidencia Jira sanitizada.
- Cambiar el endpoint de Jira o migrar documentos historicos.
- Introducir una interfaz grafica de administracion.

## Decisions

### 1. Version y clave canonica

Cada `catalog.json` tendra `catalogVersion` en formato semantico y conservara `schemaVersion`. La identidad logica de una entrada se calculara con `meshId`, `sourceField` y `targetField`. Si el catalogo no proporciona `_id`, el cargador generara `map:<sha256-identidad>`.

Se elige una identidad determinista frente al UUID aleatorio para que dos aplicaciones del mismo catalogo actualicen el mismo documento. Los UUID existentes no se migraran automaticamente: el `dry-run` los relacionara por identidad logica y el `apply` preservara su `_id` cuando encuentre coincidencia.

Algoritmo exacto del `apply`: para cada mapping del catalogo se calcula la clave `(meshId, sourceField, targetField)` y se busca un documento existente en Mongo con esa misma clave (nunca por `_id` calculado). Si existe, se actualiza ese documento con `updateOne({ _id: existente._id }, { $set: proyeccion })`, preservando su `_id` original (incluido un UUID aleatorio ya cargado a mano). Si no existe, se inserta un documento nuevo con `_id = map:<sha256(identidad)>`. Esto evita duplicar los mappings ya cargados con UUID aleatorio.

### 2. El modo por defecto no escribe

`mappings:dry-run` sera el camino normal. Validara el JSON, comprobara el contexto y mostrara `added`, `updated`, `unchanged`, `conflicts` y `mongoOnly`. No imprimira valores sensibles ni payloads Jira.

`mappings:apply` exigira `--confirm-version <catalogVersion>`. Si la version no coincide, el contexto no coincide con el entorno o existen conflictos, terminara sin escribir. Las entradas `mongoOnly` se informaran, pero no se eliminaran.

### 3. Proyeccion limpia hacia MongoDB

Solo se proyectaran estas propiedades: `_id`, `meshId`, `sourceField`, `targetField`, `transformer`, `required`, `description`, `options`, `createdBy` y `updatedBy`. Propiedades con prefijo `_`, candidatos pendientes, excluidos y secciones de cobertura permaneceran fuera de MongoDB.

La lista permitida de transformadores sera cerrada: `copy`, `mapToString` y `severity`. Un valor diferente impedira tanto el `dry-run` satisfactorio como el procesamiento del ticket; nunca se degradara silenciosamente a `copy`.

### 4. Reglas de integridad

La validacion rechazara:

- `content.statusSp`.
- Un `sourceField` igual a `fields` o un target de seccion completa.
- Dos mappings confirmados para el mismo `targetField` dentro del contexto, salvo una decision explicita futura que el esquema soporte.
- Entradas sin todos los campos obligatorios.
- Evidencias o candidatos pendientes dentro de la lista cargable.

### 5. Trazabilidad por version

Los modelos de ticket traducido y ejecucion incorporaran `mappingVersion` opcional para compatibilidad historica. En nuevos procesamientos, el servicio obtendra una instantanea coherente de los mappings activos y guardara la version en ambos documentos. La version se derivara del catalogo aplicado y no de la fecha del proceso.

## Risks / Trade-offs

- [Mappings existentes sin clave determinista] -> El cargador relacionara por identidad logica y preservara el `_id` encontrado.
- [Dos operadores aplican versiones distintas] -> La confirmacion de version y el contexto se validaran inmediatamente antes de escribir.
- [Catalogo y Mongo divergen] -> `mongoOnly` se mostrara sin borrado automatico; la limpieza requerira otra decision aprobada.
- [Cambio de mappings durante un procesamiento] -> El servicio usara una sola instantanea/version por ticket.
- [Version manual incorrecta] -> El esquema y las pruebas exigiran formato semantico y un cambio de version cuando cambie el conjunto cargable.

## Migration Plan

1. Incorporar `catalogVersion` y validar los catalogos existentes.
2. Implementar el parser, proyeccion limpia y comparador sin acceso de escritura.
3. Implementar `mappings:dry-run` y probarlo contra MongoDB local.
4. Anadir campos opcionales de trazabilidad y endurecer los transformadores.
5. Implementar `mappings:apply` con confirmacion explicita y upserts idempotentes.
6. Aplicar primero en local, repetir el `dry-run` y comprobar que todo queda `unchanged`.

Rollback: restaurar la version anterior del catalogo y aplicarla explicitamente. Los mappings `mongoOnly` no se habran eliminado y los campos nuevos son opcionales.

## Open Questions

- La promocion de una version entre entornos requerira definir posteriormente quien aprueba la evidencia funcional.
- El borrado de mappings obsoletos queda expresamente fuera de este cambio.
