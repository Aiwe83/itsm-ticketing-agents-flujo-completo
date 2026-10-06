import ExcelJS from 'exceljs'
import type { AttachmentConverter, ConversionOutcome, ConverterLimits } from './types'
import { escapeTableCell, isZipTooLarge } from './utils'

const MAX_SHEETS = 20
const MAX_ROWS_PER_SHEET = 1000
const MAX_COLUMNS_PER_SHEET = 50
const MAX_CELL_CHARS = 2000

function scalarText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  return ''
}

// Un valor de celda de exceljs puede ser un objeto (formula, texto enriquecido,
// hipervinculo, error); se reduce siempre a texto plano acotado.
function cellText(value: unknown): string {
  const scalar = scalarText(value)
  if (scalar !== '' || value === null || typeof value !== 'object' || value instanceof Date) return scalar

  const obj = value as Record<string, unknown>
  if ('error' in obj) return scalarText(obj['error'])
  if ('formula' in obj || 'sharedFormula' in obj) return cellText(obj['result'])
  const richText = obj['richText']
  if (Array.isArray(richText)) {
    return richText.map((part: { text?: unknown }) => scalarText(part?.text)).join('')
  }
  if ('hyperlink' in obj) {
    const text = cellText(obj['text'])
    const link = scalarText(obj['hyperlink'])
    if (!text) return link
    return link && link !== text ? `${text} (${link})` : text
  }
  return ''
}

function renderCell(value: unknown): string {
  const text = cellText(value)
  return escapeTableCell(text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}...` : text)
}

interface RenderedSheet {
  markdown: string
  outputChars: number
}

function renderSheet(sheet: ExcelJS.Worksheet, charBudget: number): RenderedSheet | null {
  const width = Math.min(sheet.columnCount, MAX_COLUMNS_PER_SHEET)
  if (width < 1) return null

  const lines: string[] = []
  let used = 0
  let rowsKept = 0
  let rowsCut = false
  let budgetHit = false

  sheet.eachRow({ includeEmpty: false }, row => {
    if (rowsCut || budgetHit) return
    const cells: string[] = []
    for (let c = 1; c <= width; c++) cells.push(renderCell(row.getCell(c).value))
    if (cells.every(cell => cell === '')) return

    if (rowsKept >= MAX_ROWS_PER_SHEET) {
      rowsCut = true
      return
    }
    if (used >= charBudget) {
      budgetHit = true
      return
    }

    const line = `| ${cells.join(' | ')} |`
    lines.push(line)
    used += line.length + 1
    if (rowsKept === 0) {
      const separator = `| ${cells.map(() => '---').join(' | ')} |`
      lines.push(separator)
      used += separator.length + 1
    }
    rowsKept++
  })

  if (rowsKept === 0) return null

  const notes: string[] = []
  if (rowsCut) notes.push(`_(se muestran las primeras ${MAX_ROWS_PER_SHEET} filas)_`)
  if (sheet.columnCount > MAX_COLUMNS_PER_SHEET) {
    notes.push(`_(se muestran las primeras ${MAX_COLUMNS_PER_SHEET} columnas)_`)
  }
  if (budgetHit) notes.push('_(hoja truncada por tamano de salida)_')

  const markdown = [`## Hoja: ${escapeTableCell(sheet.name)}`, '', ...lines, ...(notes.length ? ['', ...notes] : [])].join('\n')
  return { markdown, outputChars: markdown.length }
}

async function convertXlsx(buffer: Buffer, limits: ConverterLimits): Promise<ConversionOutcome> {
  // exceljs carga todo el libro en memoria: se mira el directorio central antes.
  if (isZipTooLarge(buffer, limits)) return { skipped: 'too_large' }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

  const parts: string[] = []
  let used = 0
  let sheetsCut = false
  let outputFull = false

  for (const sheet of workbook.worksheets) {
    if (sheet.state === 'hidden' || sheet.state === 'veryHidden') continue
    if (parts.length >= MAX_SHEETS) {
      sheetsCut = true
      break
    }
    if (used >= limits.maxOutputChars) {
      outputFull = true
      break
    }
    const rendered = renderSheet(sheet, limits.maxOutputChars - used)
    if (!rendered) continue
    parts.push(rendered.markdown)
    used += rendered.outputChars + 2
  }

  if (parts.length === 0) return { skipped: 'unsupported' }
  if (sheetsCut) parts.push(`_(se muestran las primeras ${MAX_SHEETS} hojas)_`)
  if (outputFull) parts.push('_(resto de hojas omitido por tamano de salida)_')
  return { markdown: parts.join('\n\n') }
}

export const xlsxConverter: AttachmentConverter = {
  id: 'xlsx',
  extensions: ['xlsx'],
  requiredSniff: 'xlsx',
  isolated: true,
  async convert(buffer, limits) {
    try {
      return await convertXlsx(buffer, limits)
    } catch {
      return { skipped: 'unsupported' }
    }
  }
}
