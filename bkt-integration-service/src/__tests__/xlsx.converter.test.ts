import crypto from 'node:crypto'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { xlsxConverter } from '../services/attachment-converters/xlsx.converter'
import { buildLimits } from '../services/attachment-converters/utils'

const limits = buildLimits(10_000_000)

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

async function markdownOf(workbook: ExcelJS.Workbook): Promise<string> {
  const outcome = await xlsxConverter.convert(await toBuffer(workbook), limits)
  if (!('markdown' in outcome)) throw new Error(`expected markdown, got ${JSON.stringify(outcome)}`)
  return outcome.markdown
}

describe('xlsxConverter', () => {
  it('exposes the registry metadata', () => {
    expect(xlsxConverter.id).toBe('xlsx')
    expect(xlsxConverter.extensions).toEqual(['xlsx'])
    expect(xlsxConverter.requiredSniff).toBe('xlsx')
  })

  it('converts two sheets into tables with header and separator', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Ventas').addRows([
      ['Producto', 'Cantidad'],
      ['Tornillo', 10],
      ['Tuerca', 5]
    ])
    wb.addWorksheet('Clientes').addRows([
      ['Nombre', 'Activo'],
      ['Ana', true]
    ])

    const md = await markdownOf(wb)

    expect(md).toContain('## Hoja: Ventas\n\n| Producto | Cantidad |\n| --- | --- |\n| Tornillo | 10 |\n| Tuerca | 5 |')
    expect(md).toContain('## Hoja: Clientes\n\n| Nombre | Activo |\n| --- | --- |\n| Ana | true |')
  })

  it('uses the cached result of a formula cell', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Calc').addRows([
      ['A', 'B', 'Suma'],
      [2, 3, { formula: 'A2+B2', result: 5 }]
    ])

    const md = await markdownOf(wb)

    expect(md).toContain('| 2 | 3 | 5 |')
    expect(md).not.toContain('A2+B2')
  })

  it('escapes pipes and newlines so the table does not break', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Datos').addRows([
      ['Col'],
      ['a|b\nlinea2']
    ])

    const md = await markdownOf(wb)

    expect(md).toContain('| a\\|b linea2 |')
    expect(md.split('\n').filter(line => line.startsWith('|'))).toHaveLength(3)
  })

  it('renders date cells as ISO strings', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Fechas').addRows([
      ['Fecha'],
      [new Date(Date.UTC(2024, 0, 15, 10, 30, 0))]
    ])

    const md = await markdownOf(wb)

    expect(md).toContain('2024-01-15T10:30:00.000Z')
  })

  it('renders rich text, hyperlinks and error cells as plain text', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Mixto')
    ws.addRow(['Rico', 'Enlace', 'Error'])
    ws.addRow([
      { richText: [{ text: 'hola ' }, { text: 'mundo', font: { bold: true } }] },
      { text: 'Docs', hyperlink: 'https://example.com/docs' },
      { error: '#DIV/0!' }
    ])

    const md = await markdownOf(wb)

    expect(md).toContain('| hola mundo | Docs (https://example.com/docs) | #DIV/0! |')
  })

  it('skips hidden sheets', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Visible').addRows([['x'], ['1']])
    const hidden = wb.addWorksheet('Oculta')
    hidden.addRows([['secreto'], ['dato']])
    hidden.state = 'hidden'

    const md = await markdownOf(wb)

    expect(md).toContain('## Hoja: Visible')
    expect(md).not.toContain('Oculta')
    expect(md).not.toContain('secreto')
  })

  it('skips sheets without data but keeps the others', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Vacia')
    wb.addWorksheet('Llena').addRows([['h'], ['v']])

    const md = await markdownOf(wb)

    expect(md).not.toContain('Vacia')
    expect(md).toContain('## Hoja: Llena')
  })

  it('caps rows per sheet and adds a note', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Grande')
    ws.addRow(['n'])
    for (let i = 1; i <= 1100; i++) ws.addRow([i])

    const md = await markdownOf(wb)

    expect(md).toContain('_(se muestran las primeras 1000 filas)_')
    // 1000 filas = cabecera + 999 de datos, mas la fila separadora
    expect(md.split('\n').filter(line => line.startsWith('|'))).toHaveLength(1001)
    expect(md).toContain('| 999 |')
    expect(md).not.toContain('| 1000 |')
  })

  it('caps columns per sheet and adds a note', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Ancha')
    ws.addRow(Array.from({ length: 60 }, (_, i) => `c${i + 1}`))
    ws.addRow(Array.from({ length: 60 }, (_, i) => i + 1))

    const md = await markdownOf(wb)

    expect(md).toContain('_(se muestran las primeras 50 columnas)_')
    expect(md).toContain('| c50 |')
    expect(md).not.toContain('c51')
  })

  it('caps the number of sheets and adds a note', async () => {
    const wb = new ExcelJS.Workbook()
    for (let i = 1; i <= 22; i++) wb.addWorksheet(`H${i}`).addRows([['h'], [i]])

    const md = await markdownOf(wb)

    expect(md).toContain('## Hoja: H20')
    expect(md).not.toContain('## Hoja: H21')
    expect(md).toContain('_(se muestran las primeras 20 hojas)_')
  })

  it('stops early when the output reaches maxOutputChars', async () => {
    const wb = new ExcelJS.Workbook()
    for (let i = 1; i <= 3; i++) {
      const ws = wb.addWorksheet(`H${i}`)
      ws.addRow(['texto'])
      for (let r = 0; r < 200; r++) ws.addRow(['x'.repeat(100)])
    }

    const outcome = await xlsxConverter.convert(await toBuffer(wb), { ...limits, maxOutputChars: 5000 })

    if (!('markdown' in outcome)) throw new Error('expected markdown')
    expect(outcome.markdown.length).toBeLessThan(10_000)
    expect(outcome.markdown).toContain('_(resto de hojas omitido por tamano de salida)_')
  })

  it('returns unsupported for a workbook without data', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Vacia')

    expect(await xlsxConverter.convert(await toBuffer(wb), limits)).toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for random bytes without throwing', async () => {
    const outcome = await xlsxConverter.convert(crypto.randomBytes(2048), limits)

    expect(outcome).toEqual({ skipped: 'unsupported' })
  })

  it('returns unsupported for a truncated zip without throwing', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('Datos').addRows([['h'], ['v']])
    const full = await toBuffer(wb)

    expect(await xlsxConverter.convert(full.subarray(0, Math.floor(full.length / 2)), limits)).toEqual({
      skipped: 'unsupported'
    })
  })

  it('returns unsupported for a zip that is not a workbook', async () => {
    const zip = new JSZip()
    zip.file('otro.txt', 'hola')
    const buffer = await zip.generateAsync({ type: 'nodebuffer' })

    expect(await xlsxConverter.convert(buffer, limits)).toEqual({ skipped: 'unsupported' })
  })

  it('returns too_large for an expansion bomb before opening the workbook', async () => {
    const zip = new JSZip()
    zip.file('xl/workbook.xml', 'a'.repeat(5_000_000))
    const bomb = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    expect(bomb.byteLength).toBeLessThan(50_000)

    const outcome = await xlsxConverter.convert(bomb, { ...limits, maxUncompressedBytes: 100_000 })

    expect(outcome).toEqual({ skipped: 'too_large' })
  })
})
