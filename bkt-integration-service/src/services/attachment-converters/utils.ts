import type { ConverterLimits, SniffedType } from './types'

export const CONVERSION_TIMEOUT_MS = 15_000
export const MAX_OUTPUT_CHARS = 1_000_000
export const MAX_UNCOMPRESSED_BYTES = 100_000_000
export const TRUNCATION_MARKER = '\n\n[... contenido truncado ...]'

export function buildLimits(bytesLimit: number): ConverterLimits {
  return {
    bytesLimit,
    maxOutputChars: MAX_OUTPUT_CHARS,
    maxUncompressedBytes: Math.min(bytesLimit * 10, MAX_UNCOMPRESSED_BYTES)
  }
}

// Corta una promesa que no termina. Solo protege de esperas asincronas: un
// parseo sincrono que acapare la CPU no se puede interrumpir desde aqui.
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function truncateMarkdown(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown
  return markdown.slice(0, maxChars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
}

// Una celda de tabla Markdown no puede llevar saltos de linea ni pipes sin
// escapar: romperian la fila.
export function escapeTableCell(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim()
}

// Valla de bloque de codigo mas larga que cualquier racha de backticks del
// contenido, para que el contenido no pueda cerrar el bloque (inyeccion de
// Markdown).
export function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map(run => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

export interface ZipEntryInfo {
  name: string
  uncompressedSize: number
}

// Lee el directorio central del zip sin descomprimir nada. Devuelve null si
// no es un zip valido. Un tamano 0xFFFFFFFF (zip64) se deja tal cual: es
// enorme y por tanto supera cualquier tope.
export function readZipEntries(buffer: Buffer): ZipEntryInfo[] | null {
  const eocdMin = 22
  if (buffer.length < eocdMin || buffer.readUInt32LE(0) !== 0x04034b50) return null

  const searchStart = Math.max(0, buffer.length - (eocdMin + 0xffff))
  let eocd = -1
  for (let i = buffer.length - eocdMin; i >= searchStart; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const total = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries: ZipEntryInfo[] = []
  for (let n = 0; n < total; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    if (offset + 46 + nameLength > buffer.length) return null
    entries.push({ name: buffer.toString('utf8', offset + 46, offset + 46 + nameLength), uncompressedSize })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export function isZipTooLarge(buffer: Buffer, limits: ConverterLimits): boolean {
  const entries = readZipEntries(buffer)
  if (!entries) return false
  const total = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0)
  return total > limits.maxUncompressedBytes
}

// Tipo real del fichero por su firma, sin fiarse de la extension.
export function sniffFileType(buffer: Buffer): SniffedType | null {
  if (buffer.subarray(0, 1024).includes('%PDF-')) return 'pdf'

  const entries = readZipEntries(buffer)
  if (!entries) return null
  const names = new Set(entries.map(entry => entry.name))
  if (names.has('word/document.xml')) return 'docx'
  if (names.has('xl/workbook.xml')) return 'xlsx'
  if (names.has('ppt/presentation.xml')) return 'pptx'
  return 'zip'
}
