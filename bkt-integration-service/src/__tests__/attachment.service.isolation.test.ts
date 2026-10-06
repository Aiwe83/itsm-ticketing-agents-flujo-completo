import ExcelJS from 'exceljs'
import { AttachmentService } from '../services/attachment.service'

const BYTES_LIMIT = 10_000_000

async function xlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Datos')
  sheet.addRow(['Paso', 'Resultado'])
  sheet.addRow([1, 'OK'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

// PDF minimo de una pagina con texto, con la tabla xref calculada.
function pdfBuffer(text: string): Buffer {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(out.length)
    out += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(out, 'latin1')
}

describe('AttachmentService with isolated converters (real workers)', () => {
  const service = new AttachmentService(undefined, { bytesLimit: BYTES_LIMIT, maxConcurrentWorkers: 2 })

  it('converts xlsx and pdf attachments inside a worker', async () => {
    const results = await service.processAttachments([
      { filename: 'datos.xlsx', buffer: await xlsxBuffer() },
      { filename: 'informe.pdf', buffer: pdfBuffer('Hola desde el worker') }
    ])

    expect(results[0]?.markdown).toContain('## Hoja: Datos')
    expect(results[1]?.markdown).toBe('## Página 1\n\nHola desde el worker')
  })

  it('keeps unsupported results for a corrupt isolated file without throwing', async () => {
    const [result] = await service.processAttachments([
      { filename: 'roto.xlsx', buffer: (await xlsxBuffer()).subarray(0, 60) }
    ])

    expect(result?.skippedReason).toBe('unsupported')
  })

  it('processes several isolated attachments with the concurrency limit', async () => {
    const buffer = await xlsxBuffer()
    const results = await service.processAttachments(
      Array.from({ length: 5 }, (_, index) => ({ filename: `datos${index}.xlsx`, buffer }))
    )

    expect(results).toHaveLength(5)
    expect(results.every(result => result.markdown.includes('## Hoja: Datos'))).toBe(true)
  })
})
