import { env } from '../config/environment'
import { ValidationError } from '../errors/validation'
import { IMapping } from '../models/Mapping.model'
import type { IssuePayload } from '../validators/issue.validator'

// La forma real de content la define la coleccion `mappings` (targetField), no
// este tipo: por eso solo se declara el indice abierto mas attachedDocuments,
// que es el unico campo que escribe el codigo y no un mapping.
export interface IssueContent {
  [key: string]: any
  attachedDocuments?: AttachedDocument[]
}

export interface AttachedDocument {
  filename: string
  markdown: string
  skippedReason?: 'unsupported' | 'too_large' | 'download_failed'
}

// Solo lo que produce la transformacion. key no vive aqui: es un campo
// estructural del documento y se deriva del payload.
export interface IssueInfo {
  meshId: string
  content: IssueContent
}

// Plantilla base sobre la que los mappings escriben. Cualquier clave que se
// deje aqui aparece en TODOS los tickets, la rellene o no un mapping.
const DEFAULT_CONTENT: IssueContent = {
  attachedDocuments: [],
}

const DEFAULT_ISSUE_INFO: IssueInfo = {
  meshId: env.MESH_ID,
  content: DEFAULT_CONTENT,
}

type TransformerContext = {
  payload: IssuePayload
  mapping: IMapping
  value: unknown
}

type MappingTransformer = (context: TransformerContext) => unknown

const COPY = ({ value }: { value: unknown }) => value

const transformerRegistry: Record<string, MappingTransformer> = {
  copy: ({ value }) => value,
  mapToString: ({ value, mapping }) =>
    asRecordArray(value).map(record => formatMapToString(record, mapping)),
  severity: ({ value }) => normalizeSeverity(value),
}

export const transformIssuePayload = (payload: IssuePayload, mappings: IMapping[]): IssueInfo => {
  const issueInfo: IssueInfo = structuredClone(DEFAULT_ISSUE_INFO)

  for (const mapping of mappings) {
    const targetPath = mapping.targetField
    const rawValue = getValueByPath(payload, mapping.sourceField)
    const transformer = getTransformer(mapping.transformer)
    const transformedValue = transformer({ payload, mapping, value: rawValue })

    if (
      transformedValue === undefined ||
      transformedValue === null ||
      (typeof transformedValue === 'string' && transformedValue.length === 0)
    ) {
      if (mapping.required) {
        throw new ValidationError(`Missing required value for mapping ${mapping.targetField}`, {
          targetField: mapping.targetField,
          sourceField: mapping.sourceField,
          rawValue,
        })
      }
      continue
    }

    setValueByPath(issueInfo, targetPath, transformedValue)
  }

  return issueInfo
}

const getTransformer = (transformer?: string): MappingTransformer => {
  if (!transformer) return COPY
  const registered = transformerRegistry[transformer]
  if (!registered) {
    throw new Error(`Unknown mapping transformer "${transformer}"`)
  }
  return registered
}

const getValueByPath = (payload: IssuePayload, path: string): unknown => {
  if (!path) return undefined
  const segments = path.split('.')
  let current: any = payload

  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined
    }

    const arrayMatch = segment.match(/(.+)\[(\*|\d+)\]$/)
    if (arrayMatch) {
      const [, key, index] = arrayMatch
      if (!key || !index) {
        return undefined
      }
      current = current[key]
      if (!Array.isArray(current)) {
        return undefined
      }

      if (index === '*') {
        return current
      }

      const numericIndex = Number.parseInt(index, 10)
      current = current[numericIndex]
    } else {
      current = current[segment]
    }
  }

  return current
}

const setValueByPath = (target: Record<string, any>, path: string, value: unknown) => {
  const arraySuffix = '[*]'
  const isArrayTarget = path.endsWith(arraySuffix)
  const cleanedPath = isArrayTarget ? path.slice(0, -arraySuffix.length) : path
  const segments = cleanedPath.split('.').filter(Boolean)
  let current = target

  segments.forEach((segment, index) => {
    const isLast = index === segments.length - 1
    if (isLast) {
      if (isArrayTarget) {
        if (!Array.isArray(current[segment])) current[segment] = []
        const values = Array.isArray(value) ? value : [value]
        current[segment].push(...values)
      } else {
        current[segment] = value
      }
      return
    }

    if (!current[segment] || typeof current[segment] !== 'object') {
      current[segment] = {}
    }
    current = current[segment]
  })
}

const asRecordArray = (value: unknown): Record<string, string>[] => {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [{ value: String(value) }]
}

const formatMapToString = (record: Record<string, string>, mapping: IMapping): string => {
  let result = ''
  const options = mapping.options?.transformer ?? {}
  for (const key in record) {
    result += `${options[key]}: ${record[key]}\n`
  }
  return result
}

const normalizeSeverity = (severity: unknown): string | null => {
  if (severity === undefined || severity === null) return null
  if (typeof severity === 'number') return String(severity)
  if (typeof severity !== 'string') return null

  const normalized = severity.toLowerCase()
  switch (normalized) {
    case 'critical':
    case '1':
      return '1'
    case 'high':
    case '2':
      return '2'
    case 'medium':
    case 'moderate':
    case '3':
      return '3'
    case 'low':
    case 'minor':
    case '4':
      return '4'
    default:
      return severity
  }
}
