import mammoth from 'mammoth'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { env } from '../config/environment'
import logger from '../config/logger'
import {
  CONVERTER_EXTENSIONS,
  findConverterByExtension,
  findConverterBySniff
} from './attachment-converters/registry'
import type { ConversionWorkerInput } from './attachment-converters/conversion.worker'
import type { AttachmentConverter, ConversionOutcome, ConverterLimits } from './attachment-converters/types'
import { Semaphore, runInWorker, workerFile } from './attachment-converters/worker-runner'
import {
  CONVERSION_TIMEOUT_MS,
  buildLimits,
  sniffFileType,
  truncateMarkdown,
  withTimeout
} from './attachment-converters/utils'

export type AttachmentSkipReason = 'unsupported' | 'too_large' | 'download_failed'

export interface RawAttachment {
  filename?: string
  name?: string
  content?: string
  data?: string
  buffer?: Buffer | string
  size?: number | string
  [key: string]: unknown
}

export interface MarkdownAttachment {
  filename: string
  markdown: string
  skippedReason?: AttachmentSkipReason
}

// Instancia compartida: registrar las reglas GFM (tablas, strikethrough...)
// tiene coste, no hace falta pagarlo por cada adjunto.
const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
turndownService.use(gfm)

// `turndown-plugin-gfm` solo convierte una tabla a Markdown si su primera
// fila es literalmente <th> (comprobado leyendo su fuente: `isHeadingRow`
// exige `every cell nodeName === 'TH'`). Word/mammoth nunca genera <th> en
// sus tablas (no tiene ese concepto), asi que con la regla de la libreria
// tal cual NINGUNA tabla real de un .docx se convertiria — se quedaria
// como HTML crudo embebido (verificado contra el tables.docx de prueba del
// propio mammoth). Estas reglas, añadidas despues de `use(gfm)` (y por eso
// con prioridad sobre las suyas), tratan la primera fila de cualquier
// tabla como cabecera sin exigir <th>, que es lo que de verdad hace falta
// aqui.
function isFirstTableRow(tr: any): boolean {
  const parent = tr?.parentNode
  if (!parent) return false
  if (parent.nodeName === 'THEAD') return true
  if (parent.nodeName === 'TABLE') return parent.firstChild === tr
  if (parent.nodeName === 'TBODY') {
    const prev = parent.previousSibling
    const isFirstTbody = !prev || (prev.nodeName === 'THEAD' && /^\s*$/.test(prev.textContent || ''))
    return isFirstTbody && parent.firstChild === tr
  }
  return false
}

function tableCell(content: string, node: any): string {
  const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node)
  // Una celda de tabla Markdown no puede llevar saltos de linea de verdad
  // (rompería la fila): un <p> dentro de un <td> (lo que mammoth genera
  // siempre) deja "\n\ntexto\n\n" en el contenido convertido - se colapsa
  // a espacios antes de meterlo entre pipes.
  const singleLine = content.trim().replace(/\s*\n+\s*/g, ' ')
  return (index === 0 ? '| ' : ' ') + singleLine + ' |'
}

turndownService.addRule('tableCell', {
  filter: ['th', 'td'],
  replacement: (content: string, node: any) => tableCell(content, node)
})

turndownService.addRule('tableRow', {
  filter: 'tr',
  replacement: (content: string, node: any) => {
    let borderCells = ''
    if (isFirstTableRow(node)) {
      for (let i = 0; i < node.childNodes.length; i++) {
        borderCells += tableCell('---', node.childNodes[i])
      }
    }
    return '\n' + content + (borderCells ? '\n' + borderCells : '')
  }
})

turndownService.addRule('table', {
  filter: (node: any) => node.nodeName === 'TABLE',
  replacement: (content: string) => '\n\n' + content.replace('\n\n', '\n') + '\n\n'
})

turndownService.addRule('tableSection', {
  filter: ['thead', 'tbody', 'tfoot'],
  replacement: (content: string) => content
})

export interface AttachmentFetcher {
  fetch(attachment: RawAttachment): Promise<Buffer>
}

export interface AttachmentServiceOptions {
  bytesLimit?: number
  // false = ejecutar todos los conversores en el proceso principal (tests).
  isolateConverters?: boolean
  // Workers simultaneos como maximo.
  maxConcurrentWorkers?: number
}

const DEFAULT_MAX_CONCURRENT_WORKERS = 2

const TEXT_EXTENSIONS = new Set(['txt', 'log', 'csv', 'xml', 'htm', 'html', 'n43', 'n34', 'mt940'])

const WORD_EXTENSIONS = new Set(['docx', 'dotx', 'odt'])

const WORD_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
])

// Tope de cuanto puede expandirse un .docx al descomprimirlo a HTML,
// relativo al tamano descargado. No es un limite de Jira, es defensivo
// contra zip-bombs: un documento normal no crece 10x al pasar a HTML.
const WORD_HTML_EXPANSION_LIMIT = 10

export class AttachmentService {
  private readonly bytesLimit: number
  private readonly isolateConverters: boolean
  private readonly workerSlots: Semaphore

  constructor(
    private readonly fetcher?: AttachmentFetcher,
    options: AttachmentServiceOptions = {}
  ) {
    this.bytesLimit = options.bytesLimit ?? env.ATTACHMENT_BYTES_LIMIT
    this.isolateConverters = options.isolateConverters ?? true
    this.workerSlots = new Semaphore(
      options.maxConcurrentWorkers ??
        (Number(process.env['ATTACHMENT_CONVERT_CONCURRENCY']) || DEFAULT_MAX_CONCURRENT_WORKERS)
    )
  }

  async processAttachments(
    attachments: unknown,
    issueKey?: string
  ): Promise<MarkdownAttachment[]> {
    if (!Array.isArray(attachments) || attachments.length === 0) return []

    const processed: MarkdownAttachment[] = []
    for (const attachment of attachments) {
      if (!this.isRawAttachment(attachment)) continue

      const result = await this.convertAttachmentToMarkdown(attachment, issueKey)
      if (result) processed.push(result)
    }

    return processed
  }

  async convertAttachmentToMarkdown(
    attachment: RawAttachment,
    issueKey?: string
  ): Promise<MarkdownAttachment | null> {
    const filename = this.getFilename(attachment)
    const extension = this.getExtension(filename)
    const declaredWordMime = this.isDeclaredWordMime(attachment)

    // Sin extension se descarga igualmente para decidir por la firma del
    // fichero; con una extension desconocida se omite sin descargar, salvo
    // cuando Jira declara un Word OOXML y hay que confirmar por firma real.
    const knownExtension =
      TEXT_EXTENSIONS.has(extension) ||
      WORD_EXTENSIONS.has(extension) ||
      CONVERTER_EXTENSIONS.has(extension) ||
      declaredWordMime
    if (!knownExtension && extension !== '') {
      logger.info({ extension, issueKey }, 'Attachment type not supported, skipped')
      return { filename, markdown: '', skippedReason: 'unsupported' }
    }

    if (this.isDeclaredTooLarge(attachment)) {
      return { filename, markdown: '', skippedReason: 'too_large' }
    }

    const buffer = await this.readAttachmentBuffer(attachment, filename, issueKey)
    if (!buffer) {
      return { filename, markdown: '', skippedReason: 'download_failed' }
    }

    if (buffer.byteLength > this.bytesLimit) {
      return { filename, markdown: '', skippedReason: 'too_large' }
    }

    if (TEXT_EXTENSIONS.has(extension)) {
      return { filename, markdown: buffer.toString('utf8').trim() }
    }

    const sniffed = sniffFileType(buffer)
    const converter = findConverterByExtension(extension) ??
      (extension === '' ? findConverterBySniff(sniffed) : undefined)

    if (converter) {
      return this.runConverter(converter, buffer, filename, issueKey, sniffed)
    }

    // Sin extension, o con nombre raro recibido de Jira pero MIME de Word:
    // solo entra al camino de Word si la firma real confirma docx.
    const shouldConvertWord =
      WORD_EXTENSIONS.has(extension) ||
      extension === '' ||
      declaredWordMime
    if (!shouldConvertWord || sniffed !== 'docx') {
      logger.info({ extension, issueKey }, 'Attachment type not supported, skipped')
      return { filename, markdown: '', skippedReason: 'unsupported' }
    }

    const markdown = await this.convertWordToMarkdown(buffer)
    if (markdown === null) {
      // Un .docx es un zip: mammoth lo descomprime en memoria, y el limite
      // de bytes de arriba solo topa lo descargado/comprimido, no lo que
      // sale de ahi. Si el HTML resultante es desproporcionado respecto al
      // buffer original, se trata igual que "demasiado grande" en vez de
      // seguir procesandolo sin limite (vector de zip-bomb conocido en
      // librerias de Office).
      return { filename, markdown: '', skippedReason: 'too_large' }
    }

    return { filename, markdown }
  }

  // Ejecuta un conversor con timeout y sin dejar escapar excepciones: un
  // fichero corrupto o que no coincide con su extension se marca unsupported.
  private async runConverter(
    converter: AttachmentConverter,
    buffer: Buffer,
    filename: string,
    issueKey: string | undefined,
    sniffed: ReturnType<typeof sniffFileType>
  ): Promise<MarkdownAttachment> {
    if (converter.requiredSniff && sniffed !== converter.requiredSniff) {
      logger.warn(
        { converter: converter.id, issueKey },
        'Attachment content does not match its extension, skipped'
      )
      return { filename, markdown: '', skippedReason: 'unsupported' }
    }

    const limits = buildLimits(this.bytesLimit)
    try {
      const outcome = converter.isolated && this.isolateConverters
        ? await this.convertIsolated(converter, buffer, limits, issueKey)
        : await withTimeout(converter.convert(buffer, limits), CONVERSION_TIMEOUT_MS, `${converter.id} conversion`)
      if ('skipped' in outcome) {
        return { filename, markdown: '', skippedReason: outcome.skipped }
      }
      return { filename, markdown: truncateMarkdown(outcome.markdown, limits.maxOutputChars) }
    } catch (error) {
      logger.warn({ err: error, converter: converter.id, issueKey }, 'Attachment conversion failed')
      return { filename, markdown: '', skippedReason: 'unsupported' }
    }
  }

  // Analiza en un worker que se mata al pasar el tiempo o la memoria; si eso
  // ocurre el servicio sigue atendiendo y el adjunto se omite.
  private async convertIsolated(
    converter: AttachmentConverter,
    buffer: Buffer,
    limits: ConverterLimits,
    issueKey: string | undefined
  ): Promise<ConversionOutcome> {
    const input: ConversionWorkerInput = { converterId: converter.id, buffer: new Uint8Array(buffer), limits }
    const result = await this.workerSlots.run(() =>
      runInWorker<ConversionOutcome>(workerFile('conversion.worker'), input, { timeoutMs: CONVERSION_TIMEOUT_MS })
    )
    if (result.ok) return result.value

    logger.warn({ converter: converter.id, reason: result.reason, issueKey }, 'Isolated conversion stopped')
    return { skipped: result.reason === 'memory' ? 'too_large' : 'unsupported' }
  }

  private async convertWordToMarkdown(buffer: Buffer): Promise<string | null> {
    const { value: html } = await mammoth.convertToHtml({ buffer })
    if (html.length > this.bytesLimit * WORD_HTML_EXPANSION_LIMIT) {
      return null
    }
    return turndownService.turndown(html).trim()
  }

  private async readAttachmentBuffer(
    attachment: RawAttachment,
    filename: string,
    issueKey?: string
  ): Promise<Buffer | null> {
    if (Buffer.isBuffer(attachment.buffer)) return attachment.buffer
    if (typeof attachment.buffer === 'string') return Buffer.from(attachment.buffer, 'utf8')
    if (typeof attachment.data === 'string') return Buffer.from(attachment.data, 'utf8')
    if (typeof attachment.content === 'string' && !this.isRemoteUrl(attachment.content)) {
      return Buffer.from(attachment.content, 'utf8')
    }

    if (!this.fetcher) {
      logger.warn(
        { filename, issueKey },
        'Attachment download skipped because no Jira fetcher is configured'
      )
      return null
    }

    try {
      return await this.fetcher.fetch(attachment)
    } catch (error) {
      logger.warn({ err: error, filename, issueKey }, 'Attachment download failed')
      return null
    }
  }

  private isDeclaredTooLarge(attachment: RawAttachment): boolean {
    const declaredSize = Number(attachment.size)
    return Number.isFinite(declaredSize) && declaredSize > this.bytesLimit
  }

  private getFilename(attachment: RawAttachment): string {
    return attachment.filename ?? attachment.name ?? 'attachment'
  }

  private isDeclaredWordMime(attachment: RawAttachment): boolean {
    const mimeType = attachment['mimeType'] ?? attachment['mime_type'] ?? attachment['contentType'] ?? attachment['content_type']
    return typeof mimeType === 'string' && WORD_MIME_TYPES.has(mimeType.toLowerCase())
  }

  private getExtension(filename: string): string {
    const parts = filename.split('.')
    return parts.length > 1 ? (parts[parts.length - 1]?.toLowerCase() ?? '') : ''
  }

  private isRemoteUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://')
  }

  private isRawAttachment(value: unknown): value is RawAttachment {
    return typeof value === 'object' && value !== null
  }
}

export const attachmentService = new AttachmentService()
