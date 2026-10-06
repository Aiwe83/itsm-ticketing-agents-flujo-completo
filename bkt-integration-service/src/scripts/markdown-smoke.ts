import { readFileSync } from 'node:fs'
import { AttachmentService } from '../services/attachment.service'

// Prueba manual, no automatizada: usa el AttachmentService real (mismas
// reglas de tabla que produccion) contra un .docx real de prueba (el que
// trae el propio mammoth en su suite, tiene una tabla) para ver a ojo que
// sale Markdown de verdad, sin levantar Mongo/orchestrator/docker-compose.
async function main() {
  const service = new AttachmentService(undefined, { bytesLimit: 10 * 1024 * 1024 })

  const [txt] = await service.processAttachments([
    { filename: 'nota.txt', data: 'Texto plano de prueba' },
  ])
  console.log('--- .txt (pass-through, sin cambios) ---')
  console.log(txt)

  const buffer = readFileSync(require.resolve('mammoth/test/test-data/tables.docx'))
  const [docx] = await service.processAttachments([{ filename: 'tabla.docx', buffer }])
  console.log('--- .docx con tabla, convertido a Markdown ---')
  console.log(docx?.markdown)
}

main()
