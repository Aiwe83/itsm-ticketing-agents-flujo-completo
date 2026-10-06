import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { AttachmentService } from '../services/attachment.service'

const BYTES_LIMIT = 10_000_000

async function xlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Datos')
  sheet.addRow(['Paso', 'Resultado'])
  sheet.addRow([1, 'OK'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function pptxBuffer(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/presentation.xml', '<p:presentation/>')
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Hola</a:t></a:r></a:p></p:sld>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('AttachmentService with the converter registry', () => {
  const service = new AttachmentService(undefined, { bytesLimit: BYTES_LIMIT, isolateConverters: false })

  it('converts an xlsx attachment and ignores upper-case extensions', async () => {
    const [result] = await service.processAttachments([{ filename: 'DATOS.XLSX', buffer: await xlsxBuffer() }])

    expect(result?.skippedReason).toBeUndefined()
    expect(result?.markdown).toContain('## Hoja: Datos')
    expect(result?.markdown).toContain('| 1 | OK |')
  })

  it('converts a pptx attachment', async () => {
    const [result] = await service.processAttachments([{ filename: 'deck.pptx', buffer: await pptxBuffer() }])

    expect(result?.markdown).toBe('## Diapositiva 1\n\nHola')
  })

  it('wraps a json attachment in a fenced block and passes markdown through', async () => {
    const results = await service.processAttachments([
      { filename: 'datos.json', buffer: Buffer.from('{"a":1}') },
      { filename: 'notas.md', buffer: Buffer.from('# Titulo\n\ntexto') }
    ])

    expect(results[0]?.markdown).toBe('```json\n{\n  "a": 1\n}\n```')
    expect(results[1]?.markdown).toBe('# Titulo\n\ntexto')
  })

  it('detects the real type of an attachment without extension by its signature', async () => {
    const [result] = await service.processAttachments([{ filename: 'adjunto', buffer: await xlsxBuffer() }])

    expect(result?.markdown).toContain('## Hoja: Datos')
  })

  it('skips an attachment without extension whose signature is not supported', async () => {
    const [result] = await service.processAttachments([
      { filename: 'captura', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
    ])

    expect(result).toEqual({ filename: 'captura', markdown: '', skippedReason: 'unsupported' })
  })

  it('skips a file whose content does not match its extension', async () => {
    const results = await service.processAttachments([
      { filename: 'falso.xlsx', buffer: Buffer.from('esto no es un excel') },
      { filename: 'renombrado.pdf', buffer: await xlsxBuffer() },
      { filename: 'falso.pptx', buffer: await xlsxBuffer() }
    ])

    expect(results.map(result => result.skippedReason)).toEqual(['unsupported', 'unsupported', 'unsupported'])
  })

  it('marks a corrupt file with a valid signature as unsupported without throwing', async () => {
    const [result] = await service.processAttachments([
      { filename: 'roto.xlsx', buffer: Buffer.concat([(await xlsxBuffer()).subarray(0, 60), Buffer.from('basura')]) }
    ])

    expect(result?.skippedReason).toBe('unsupported')
  })

  it('still skips known-unsupported extensions without downloading', async () => {
    const [result] = await service.processAttachments([{ filename: 'foto.png', buffer: Buffer.from('x') }])

    expect(result).toEqual({ filename: 'foto.png', markdown: '', skippedReason: 'unsupported' })
  })

  it('truncates a converted attachment above the output limit', async () => {
    const big = JSON.stringify({ texto: 'x'.repeat(1_200_000) })
    const [result] = await service.processAttachments([{ filename: 'grande.json', buffer: Buffer.from(big) }])

    expect(result?.markdown.length).toBeLessThanOrEqual(1_000_000)
    expect(result?.markdown.endsWith('[... contenido truncado ...]')).toBe(true)
  })
})
