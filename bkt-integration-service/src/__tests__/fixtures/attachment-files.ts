import ExcelJS from 'exceljs'
import JSZip from 'jszip'

// Ficheros de prueba generados en memoria (datos ficticios), compartidos por los
// tests de conversion y por la suite E2E.

export async function xlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Datos')
  sheet.addRow(['Paso', 'Resultado'])
  sheet.addRow([1, 'OK'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function pptxBuffer(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/presentation.xml', '<p:presentation/>')
  zip.file('ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Hola</a:t></a:r></a:p></p:sld>')
  return zip.generateAsync({ type: 'nodebuffer' })
}

function buildPdf(objects: string[]): Buffer {
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

// PDF minimo de una pagina con texto, con la tabla xref calculada.
export function pdfBuffer(text: string): Buffer {
  const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ])
}

// PDF de varias paginas; cada pagina es una lista de lineas de texto.
export function pdfPagesBuffer(pages: string[][]): Buffer {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>']
  objects.push(
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`
  )
  pages.forEach((lines, index) => {
    const body = lines
      .map((line, row) => `BT /F1 14 Tf 40 ${760 - row * 22} Td (${line.replace(/[()\\]/g, '')}) Tj ET`)
      .join('\n')
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${4 + index * 2} 0 R /Resources << /Font << /F1 ${3 + pages.length * 2} 0 R >> >> >>`
    )
    objects.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`)
  })
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  return buildPdf(objects)
}

async function incidentsWorkbook(): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  const incidents = workbook.addWorksheet('Incidencias')
  incidents.addRow(['Id', 'Titulo', 'Prioridad', 'Estado'])
  incidents.addRow(['INC-1042', 'Error al generar informe', 'Alta', 'Abierta'])
  incidents.addRow(['INC-1043', 'Lentitud | consulta de saldos', 'Media', 'En curso'])
  incidents.addRow(['INC-1044', 'Fallo de login', 'Alta', { formula: 'IF(1>0,"Cerrada","Abierta")', result: 'Cerrada' }])
  const summary = workbook.addWorksheet('Resumen')
  summary.addRow(['Total', 'Abiertas'])
  summary.addRow([3, 2])
  return workbook
}

export async function incidentsXlsx(): Promise<Buffer> {
  return Buffer.from(await (await incidentsWorkbook()).xlsx.writeBuffer())
}

export async function slidesPptx(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', '<Types/>')
  zip.file('ppt/presentation.xml', '<p:presentation/>')
  const slide = (...texts: string[]): string =>
    `<p:sld>${texts.map(text => `<a:p><a:r><a:t>${text}</a:t></a:r></a:p>`).join('')}</p:sld>`
  zip.file('ppt/slides/slide1.xml', slide('Revision mensual de incidencias', 'Septiembre 2026'))
  zip.file('ppt/slides/slide2.xml', slide('Resultados', 'Incidencias abiertas: 2', 'Tiempo medio de resolucion: 4 h &amp; 30 min'))
  zip.file('ppt/slides/slide10.xml', slide('Conclusiones', 'Reforzar la monitorizacion del modulo de informes'))
  return zip.generateAsync({ type: 'nodebuffer' })
}

// Word minimo: un parrafo y una tabla de dos filas.
export async function docxBuffer(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  )
  const cell = (text: string): string => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`
  const row = (...cells: string[]): string => `<w:tr>${cells.map(cell).join('')}</w:tr>`
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p><w:r><w:t>Informe de la incidencia mensual</w:t></w:r></w:p>' +
      `<w:tbl>${row('Paso', 'Resultado')}${row('Abrir informes', 'OK')}${row('Generar informe', 'Error 500')}</w:tbl>` +
      '</w:body></w:document>'
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

// Excel "hostil": ~6,5 MB comprimidos que descomprimen a ~80 MB de XML muy repetitivo. Esta por
// debajo del tope de descompresion, asi que solo lo frena el limite de memoria del worker.
export async function hostileXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('H').addRow(['a'])
  const zip = await JSZip.loadAsync(Buffer.from(await workbook.xlsx.writeBuffer()))
  const rows: string[] = []
  for (let row = 1; row <= 1_300_000; row++) {
    rows.push(`<row r="${row}"><c r="A${row}" t="inlineStr"><is><t>x</t></is></c></row>`)
  }
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      `<sheetData>${rows.join('')}</sheetData></worksheet>`
  )
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360f8cfc0000003010100c9fe92ef0000000049454e44ae426082',
  'hex'
)

export type ExpectedOutcome = { markdownIncludes: string[] } | { skippedReason: 'unsupported' | 'too_large' }

export interface AttachmentCase {
  filename: string
  mimeType: string
  buffer: Buffer
  expected: ExpectedOutcome
}

// Los 10 casos de la guia de pruebas manuales (documentos_prueba/LEEME.md): 6 se
// convierten y 4 se omiten como "no soportado".
export async function buildAttachmentCases(): Promise<AttachmentCase[]> {
  const workbookBytes = await incidentsXlsx()
  return [
    {
      filename: '01_incidencia_pdf.pdf',
      mimeType: 'application/pdf',
      buffer: pdfPagesBuffer([
        ['Incidencia INC-2026-1042: error al generar informe mensual', 'Sistema afectado: modulo de informes'],
        ['Pagina 2 - Analisis', 'Causa probable: tiempo de espera agotado en la consulta.']
      ]),
      expected: { markdownIncludes: ['## Página 1', '## Página 2', 'INC-2026-1042', 'tiempo de espera agotado'] }
    },
    {
      filename: '02_incidencias_excel.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: workbookBytes,
      expected: {
        markdownIncludes: ['## Hoja: Incidencias', '## Hoja: Resumen', 'Lentitud \\| consulta de saldos', 'Cerrada']
      }
    },
    {
      filename: '03_revision_powerpoint.pptx',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      buffer: await slidesPptx(),
      expected: { markdownIncludes: ['## Diapositiva 1', '## Diapositiva 2', '## Diapositiva 10', '4 h & 30 min'] }
    },
    {
      filename: '04_configuracion.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ entorno: 'pre', reintentos: 3, umbral: { cpu: 80 } })),
      expected: { markdownIncludes: ['```json', '"entorno": "pre"', '"cpu": 80'] }
    },
    {
      filename: '05_notas.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Notas de la incidencia\n\n| Paso | Resultado |\n| --- | --- |\n| Reintento | Mismo error |\n'),
      expected: { markdownIncludes: ['# Notas de la incidencia', '| Reintento | Mismo error |'] }
    },
    {
      filename: '06_notas_sin_extension',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('# Markdown sin extension: se omite, solo se aceptan tipos con firma conocida.'),
      expected: { skippedReason: 'unsupported' }
    },
    {
      filename: '07_excel_corrupto.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: workbookBytes.subarray(0, 90),
      expected: { skippedReason: 'unsupported' }
    },
    {
      filename: '08_captura.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
      expected: { skippedReason: 'unsupported' }
    },
    {
      filename: '09_pdf_renombrado.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Esto es texto plano con extension .pdf: debe marcarse como no soportado.'),
      expected: { skippedReason: 'unsupported' }
    },
    {
      filename: '10_informe.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: await docxBuffer(),
      expected: { markdownIncludes: ['Informe de la incidencia mensual', '| Paso | Resultado |', '| Generar informe | Error 500 |'] }
    }
  ]
}
