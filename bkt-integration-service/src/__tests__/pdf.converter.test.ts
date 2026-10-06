import Module from 'node:module'
import { join, dirname } from 'node:path'
import { definePDFJSModule } from 'unpdf'
import { pdfConverter } from '../services/attachment-converters/pdf.converter'
import { buildLimits } from '../services/attachment-converters/utils'

// PDF minimo valido: una pagina por elemento; null = pagina sin texto (como un escaneo)
function buildPdf(pages: Array<string | null>): Buffer {
  const objects: string[] = []
  const pageIds = pages.map((_, index) => 4 + index * 2)
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`)
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  pages.forEach((text, index) => {
    const contentId = 5 + index * 2
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R ` +
        '/Resources << /Font << /F1 3 0 R >> >> >>'
    )
    const stream = text === null ? '0 0 100 100 re f' : `BT /F1 12 Tf 72 700 Td (${text}) Tj ET`
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
  })

  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(body.length)
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = body.length
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

describe('pdfConverter', () => {
  const limits = buildLimits(10_000_000)

  // Jest no soporta import() dinamico sin --experimental-vm-modules y unpdf carga
  // pdf.js asi; se le inyecta el bundle con el require nativo de Node (require(esm)).
  beforeAll(async () => {
    const nativeLoad = (Module as unknown as { _load: (request: string) => unknown })._load
    const bundle = join(dirname(require.resolve('unpdf')), 'pdfjs.mjs')
    await definePDFJSModule(async () => nativeLoad(bundle))
  })

  it('exposes its identity', () => {
    expect(pdfConverter.id).toBe('pdf')
    expect(pdfConverter.extensions).toEqual(['pdf'])
    expect(pdfConverter.requiredSniff).toBe('pdf')
  })

  it('converts a multi-page text PDF into one section per page', async () => {
    const result = await pdfConverter.convert(buildPdf(['Hola mundo uno', 'Segunda pagina de prueba']), limits)

    expect(result).toEqual({
      markdown: '## Página 1\n\nHola mundo uno\n\n## Página 2\n\nSegunda pagina de prueba'
    })
  })

  it('skips pages without text but keeps the original page numbers', async () => {
    const result = await pdfConverter.convert(buildPdf(['Primera', null, 'Tercera']), limits)

    expect(result).toEqual({ markdown: '## Página 1\n\nPrimera\n\n## Página 3\n\nTercera' })
  })

  it('returns unsupported for a scanned-like PDF with no extractable text', async () => {
    expect(await pdfConverter.convert(buildPdf([null, null]), limits)).toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for a corrupt PDF without throwing', async () => {
    const corrupt = Buffer.from('%PDF-1.4\nesto no es un pdf valido \u0000\u0001 garbage garbage')
    await expect(pdfConverter.convert(corrupt, limits)).resolves.toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for an empty buffer without throwing', async () => {
    await expect(pdfConverter.convert(Buffer.alloc(0), limits)).resolves.toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for a truncated PDF', async () => {
    const full = buildPdf(['Texto'])
    await expect(pdfConverter.convert(full.subarray(0, 60), limits)).resolves.toEqual({ skipped: 'unsupported' })
  })

  it('processes at most 200 pages', async () => {
    const pages = Array.from({ length: 230 }, (_, index) => `Contenido ${index + 1}`)
    const result = await pdfConverter.convert(buildPdf(pages), limits)

    if (!('markdown' in result)) throw new Error('expected markdown')
    const headings = result.markdown.match(/^## Página \d+$/gm) ?? []
    expect(headings).toHaveLength(200)
    expect(result.markdown).toContain('## Página 200\n\nContenido 200')
    expect(result.markdown).not.toContain('Página 201')
  })

  it('never exceeds maxOutputChars', async () => {
    const pages = Array.from({ length: 50 }, (_, index) => `Contenido de la pagina numero ${index + 1}`)
    const small = { ...limits, maxOutputChars: 300 }
    const result = await pdfConverter.convert(buildPdf(pages), small)

    if (!('markdown' in result)) throw new Error('expected markdown')
    expect(result.markdown.length).toBeLessThanOrEqual(300)
    expect(result.markdown.startsWith('## Página 1\n\n')).toBe(true)
    expect(result.markdown).not.toContain('Página 50')
  })
})
