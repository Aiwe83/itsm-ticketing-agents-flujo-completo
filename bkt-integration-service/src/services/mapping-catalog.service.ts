// Este servicio es el cerebro detras de `pnpm mappings:dry-run` / `pnpm mappings:apply`.
// En una frase: compara los mappings escritos en catalog.json (Git) contra los mappings que
// hay de verdad en MongoDB, y opcionalmente corrige Mongo para que coincida con el catalogo.
// Nunca borra nada de Mongo por si solo — ver syncMappingCatalog() mas abajo para el porque.

import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/environment'
import { Mapping, type IMapping } from '../models/Mapping.model'

export const DEFAULT_CATALOG_CONTEXT_PATH = 'docs/mappings/contexts/pilot-local/catalog.json'

export type MappingCatalogSyncMode = 'dry-run' | 'apply'
export type MappingCatalogAction = 'added' | 'updated' | 'unchanged' | 'conflict' | 'mongoOnly'

// Un mapping tal cual aparece en catalog.json (array "mappings"). Es la forma DOCUMENTADA,
// no necesariamente la misma forma que espera MongoDB — ver projectCatalogMapping() para la
// conversion de una a otra.
export interface CatalogMappingEntry {
  sourceField: string
  targetField: string
  transformer?: string
  required?: boolean
  description?: string
  options?: Record<string, unknown>
  createdBy?: string
  updatedBy?: string
  meshId?: string
  [key: string]: unknown
}

// El catalog.json completo, ya parseado. "mappings" es la unica parte que se sincroniza con
// Mongo — el resto del fichero (pendingCandidates, excludedFields, notes...) es solo documental
// y esta funcion nunca lo lee.
export interface MappingCatalog {
  catalogVersion: string
  context: { meshId: string; [key: string]: unknown }
  mappings: CatalogMappingEntry[]
  [key: string]: unknown
}

// Un mapping ya "traducido" a la forma exacta que se guarda en la coleccion mappings de Mongo
// (sin campos documentales sueltos, con el _id calculado).
export interface ProjectedMapping {
  _id: string
  meshId: string
  sourceField: string
  targetField: string
  transformer: string
  required: boolean
  description?: string
  options: Record<string, unknown>
  createdBy: string
  updatedBy: string
}

// Opciones para runMappingCatalogSync (la version que SI lee el fichero de disco).
export interface MappingCatalogSyncOptions {
  mode: MappingCatalogSyncMode
  confirmVersion?: string
  contextPath?: string
}

// Resultado que se imprime por consola al terminar un dry-run o un apply.
export interface MappingCatalogSyncSummary {
  mode: MappingCatalogSyncMode
  catalogVersion: string
  meshId: string
  scanned: number
  added: number
  updated: number
  unchanged: number
  conflicts: string[]
  mongoOnly: string[]
}

// Lista cerrada de transformadores validos. Se mantiene igual que transformerRegistry en
// src/utils/issue.util.ts a proposito: si algun dia divergen, el validador del catalogo podria
// aceptar un transformer que luego el motor de traduccion real no reconoce (o al reves).
export const ALLOWED_TRANSFORMERS = ['copy', 'mapToString', 'severity'] as const

// Lee catalog.json del disco y lo devuelve ya parseado. No valida nada todavia — eso lo hace
// validateMappingCatalog() por separado.
export const loadMappingCatalog = async (contextPath?: string): Promise<MappingCatalog> => {
  const resolvedPath = path.resolve(process.cwd(), contextPath ?? DEFAULT_CATALOG_CONTEXT_PATH)
  const raw = await readFile(resolvedPath, 'utf-8')
  return JSON.parse(raw) as MappingCatalog
}

// Revisa el catalogo entero y junta TODOS los problemas antes de fallar (no se para en el
// primero), para que quien lo use vea de una vez todo lo que hay que arreglar. Si encuentra
// algo, lanza un unico Error con la lista completa.
export const validateMappingCatalog = (catalog: MappingCatalog): void => {
  const problems: string[] = []

  if (!catalog.catalogVersion || catalog.catalogVersion.trim().length === 0) {
    problems.push('catalogVersion is missing')
  }

  if (!catalog.context?.meshId || catalog.context.meshId.trim().length === 0) {
    problems.push('context.meshId is missing')
  }

  if (!Array.isArray(catalog.mappings)) {
    problems.push('mappings must be an array')
  } else {
    // Usado para detectar dos mappings distintos que escriben en el mismo targetField
    // (eso pisaria un valor con otro sin avisar).
    const seenTargets = new Set<string>()

    catalog.mappings.forEach((mapping, index) => {
      const label = `mappings[${index}]`

      if (!mapping.sourceField || mapping.sourceField.trim().length === 0) {
        problems.push(`${label}: sourceField is missing`)
      } else if (mapping.sourceField.trim() === 'fields') {
        // "fields" a secas (sin nada detras) es un mapping generico de toda la seccion del
        // ticket, no un campo concreto. Nunca debe cargarse asi.
        problems.push(`${label}: sourceField "fields" is too generic`)
      }

      if (!mapping.targetField || mapping.targetField.trim().length === 0) {
        problems.push(`${label}: targetField is missing`)
      } else {
        if (mapping.targetField === 'content.statusSp') {
          // Campo legacy ya retirado del modelo interno. Si algo lo sigue mapeando es un
          // resto viejo del catalogo que hay que limpiar.
          problems.push(`${label}: targetField "content.statusSp" is a removed legacy field`)
        }
        if (seenTargets.has(mapping.targetField)) {
          problems.push(`${label}: targetField "${mapping.targetField}" is duplicated`)
        }
        seenTargets.add(mapping.targetField)
      }

      // Si no se indica transformer, el motor real (issue.util.ts) usa "copy" por defecto,
      // asi que aqui se valida como si el catalogo ya dijera "copy" explicitamente.
      const transformer = mapping.transformer ?? 'copy'
      if (!(ALLOWED_TRANSFORMERS as readonly string[]).includes(transformer)) {
        problems.push(`${label}: transformer "${transformer}" is not in the allowed list`)
      }
    })
  }

  if (problems.length > 0) {
    throw new Error(`Invalid mapping catalog:\n- ${problems.join('\n- ')}`)
  }
}

// Calcula un _id estable para un mapping a partir de (meshId, sourceField, targetField).
// Es determinista a proposito: si se corre dos veces con los mismos datos, sale siempre el
// mismo _id. Asi, aplicar el catalogo dos veces nunca crea un mapping duplicado.
// OJO: esto NO es lo que se usa para decidir si un mapping "ya existe" en Mongo — para eso se
// compara por identidad logica (ver logicalKey), nunca por este _id calculado, porque los 6
// mappings ya cargados a mano en Mongo tienen un _id distinto (UUID aleatorio) y hay que
// actualizarlos in-place, no duplicarlos.
export const buildMappingLogicalId = (identity: {
  meshId: string
  sourceField: string
  targetField: string
}): string => {
  const hash = createHash('sha256')
    .update(`${identity.meshId}:${identity.sourceField}:${identity.targetField}`)
    .digest('hex')
  return `map:${hash}`
}

// Convierte una entrada de catalog.json a la forma exacta que se guarda en Mongo. Se queda solo
// con las propiedades que Mongo necesita — cualquier campo documental tipo "_evidence" que venga
// en el catalogo se queda fuera automaticamente, porque aqui se construye el objeto de cero en
// vez de copiar "entry" entero.
export const projectCatalogMapping = (entry: CatalogMappingEntry, meshId: string): ProjectedMapping => ({
  _id: buildMappingLogicalId({ meshId, sourceField: entry.sourceField, targetField: entry.targetField }),
  meshId,
  sourceField: entry.sourceField,
  targetField: entry.targetField,
  transformer: entry.transformer ?? 'copy',
  required: entry.required ?? false,
  description: entry.description,
  options: (entry.options as Record<string, unknown>) ?? {},
  createdBy: entry.createdBy ?? 'catalog',
  updatedBy: entry.updatedBy ?? 'catalog',
})

// Convierte un objeto a texto JSON siempre con las claves en el mismo orden alfabetico.
// Sirve para comparar "¿este mapping cambio o no?": dos objetos con las mismas claves pero en
// distinto orden dan el mismo texto aqui, asi que no se marcan como "updated" por nada.
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    return Object.keys(item)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = (item as Record<string, unknown>)[key]
        return accumulator
      }, {})
  })

// Igual que projectCatalogMapping, pero para un documento que YA esta en Mongo (viene del
// modelo Mongoose, no del catalogo). Sirve para comparar "lo que hay" contra "lo que deberia
// haber" con la misma forma exacta en los dos lados.
const projectExistingMapping = (existing: IMapping): Omit<ProjectedMapping, '_id'> => ({
  meshId: existing.meshId,
  sourceField: existing.sourceField,
  targetField: existing.targetField,
  transformer: existing.transformer ?? 'copy',
  required: existing.required ?? false,
  description: existing.description,
  options: (existing.options as Record<string, unknown>) ?? {},
  createdBy: existing.createdBy,
  updatedBy: existing.updatedBy,
})

// Texto unico que identifica un mapping por su contenido (meshId + sourceField + targetField),
// no por su _id. Dos documentos con este mismo texto son "el mismo mapping" a efectos de
// comparar catalogo contra Mongo, aunque uno tenga un _id calculado y el otro un UUID viejo.
const logicalKey = (identity: { meshId: string; sourceField: string; targetField: string }): string =>
  `${identity.meshId} ${identity.sourceField} ${identity.targetField}`

export interface MappingCatalogSyncCoreOptions {
  mode: MappingCatalogSyncMode
  confirmVersion?: string
}

// Motor puro de la sincronizacion: recibe el catalogo YA CARGADO en memoria, no toca disco.
// Se separa de runMappingCatalogSync a proposito para que los tests puedan pasarle un catalogo
// de prueba directamente, sin tener que mockear loadMappingCatalog (Jest no puede interceptar
// una funcion cuando otra del MISMO fichero la llama por referencia local).
export const syncMappingCatalog = async (
  catalog: MappingCatalog,
  options: MappingCatalogSyncCoreOptions
): Promise<MappingCatalogSyncSummary> => {
  // Paso 1: el catalogo tiene que ser valido antes de mirar Mongo siquiera.
  validateMappingCatalog(catalog)

  // Paso 2: fail-closed si el catalogo es de otro meshId — nunca escribir mappings de un
  // entorno en el meshId de otro por error.
  if (catalog.context.meshId !== env.MESH_ID) {
    throw new Error(
      `Catalog meshId (${catalog.context.meshId}) does not match env.MESH_ID (${env.MESH_ID})`
    )
  }

  // Paso 3: en modo apply, exigir que quien ejecuta el comando confirme a mano la version
  // exacta del catalogo (--confirm-version). Evita aplicar cambios sin que alguien haya mirado
  // que version se esta subiendo.
  if (options.mode === 'apply' && options.confirmVersion !== catalog.catalogVersion) {
    throw new Error(
      `Apply requires --confirm-version=${catalog.catalogVersion}; received ${
        options.confirmVersion ?? 'empty'
      }`
    )
  }

  const summary: MappingCatalogSyncSummary = {
    mode: options.mode,
    catalogVersion: catalog.catalogVersion,
    meshId: catalog.context.meshId,
    scanned: catalog.mappings.length,
    added: 0,
    updated: 0,
    unchanged: 0,
    conflicts: [],
    mongoOnly: [],
  }

  // Paso 4: traer TODO lo que hay hoy en Mongo para este meshId, e indexarlo por identidad
  // logica para poder buscarlo rapido mas abajo.
  const existingDocuments = await Mapping.find({ meshId: catalog.context.meshId }).exec()
  const existingByKey = new Map<string, IMapping>()

  for (const document of existingDocuments) {
    const key = logicalKey({
      meshId: document.meshId,
      sourceField: document.sourceField,
      targetField: document.targetField,
    })

    if (existingByKey.has(key)) {
      // Caso raro pero real: dos documentos en Mongo con la misma identidad logica (por
      // ejemplo, cargados a mano dos veces). No se sabe cual es el bueno, asi que se marca
      // como conflicto y mas abajo se bloquea cualquier escritura mientras esto exista.
      summary.conflicts.push(
        `${document.sourceField} -> ${document.targetField}: duplicate Mongo documents share the same identity`
      )
      continue
    }

    existingByKey.set(key, document)
  }

  // Se calcula primero TODO lo que habria que escribir (plannedWrites) y solo se escribe de
  // verdad al final, si no hay conflictos. Asi nunca se hacen escrituras parciales si algo
  // raro aparece a mitad de la comparacion.
  type PlannedWrite =
    | { action: 'added'; projected: ProjectedMapping }
    | { action: 'updated'; existingId: string; projected: ProjectedMapping }

  const plannedWrites: PlannedWrite[] = []
  const catalogKeys = new Set<string>()

  // Paso 5: recorrer el catalogo y decidir, mapping a mapping, si hay que anadirlo, actualizarlo
  // o dejarlo igual.
  for (const entry of catalog.mappings) {
    const projected = projectCatalogMapping(entry, catalog.context.meshId)
    const key = logicalKey(projected)
    catalogKeys.add(key)

    const existing = existingByKey.get(key)

    if (!existing) {
      // No existe en Mongo todavia -> se anadira con un _id nuevo calculado.
      summary.added += 1
      plannedWrites.push({ action: 'added', projected })
      continue
    }

    // Ya existe: se compara el contenido (sin mirar el _id) para ver si hace falta tocarlo.
    const { _id: _existingId, ...projectedWithoutId } = projected
    const isUnchanged =
      stableStringify(projectExistingMapping(existing)) === stableStringify(projectedWithoutId)

    if (isUnchanged) {
      summary.unchanged += 1
      continue
    }

    // Contenido distinto -> hay que pisar el documento existente (conservando su _id de
    // siempre, nunca creando uno nuevo).
    summary.updated += 1
    plannedWrites.push({ action: 'updated', existingId: existing._id, projected })
  }

  // Paso 6: al reves — recorrer lo que hay en Mongo y ver que hay ahi que NO esta en el
  // catalogo ("mongoOnly"). Esto solo se informa, nunca se borra automaticamente: es la unica
  // forma de detectar mappings cargados a mano sin tocarlos por sorpresa.
  for (const document of existingDocuments) {
    const key = logicalKey({
      meshId: document.meshId,
      sourceField: document.sourceField,
      targetField: document.targetField,
    })
    if (!catalogKeys.has(key)) {
      summary.mongoOnly.push(`${document.sourceField} -> ${document.targetField}`)
    }
  }

  // Paso 7: solo se escribe de verdad en apply, y solo si no hubo ningun conflicto. En dry-run
  // (o si hay conflictos) todo lo de arriba fue puro calculo, cero escrituras en Mongo.
  if (options.mode === 'apply' && summary.conflicts.length === 0) {
    for (const write of plannedWrites) {
      if (write.action === 'added') {
        await Mapping.create({ ...write.projected })
      } else {
        // updateOne sobre el _id EXISTENTE (nunca insertOne) — asi un mapping cargado a mano
        // con un UUID aleatorio se corrige in-place, en vez de duplicarse con un _id nuevo.
        const { _id: _projectedId, ...projectedWithoutId } = write.projected
        await Mapping.updateOne({ _id: write.existingId }, { $set: projectedWithoutId })
      }
    }
  }

  return summary
}

// Wrapper de una linea: carga el catalogo del disco y delega en la funcion pura de arriba.
// Es lo que usa de verdad el script de linea de comandos (sync-mapping-catalog.ts).
export const runMappingCatalogSync = async (
  options: MappingCatalogSyncOptions
): Promise<MappingCatalogSyncSummary> => {
  const catalog = await loadMappingCatalog(options.contextPath)
  return syncMappingCatalog(catalog, options)
}
