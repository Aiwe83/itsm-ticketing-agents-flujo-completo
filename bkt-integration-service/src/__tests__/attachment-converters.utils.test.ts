import JSZip from 'jszip'
import {
  TRUNCATION_MARKER,
  buildLimits,
  escapeTableCell,
  fenceFor,
  isZipTooLarge,
  readZipEntries,
  sniffFileType,
  truncateMarkdown,
  withTimeout
} from '../services/attachment-converters/utils'

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(files)) zip.file(name, content)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

describe('attachment converter utils', () => {
  it('reads zip entry names and sizes without inflating', async () => {
    const buffer = await zipOf({ 'a.txt': 'hola', 'dir/b.txt': 'x'.repeat(1000) })
    const files = readZipEntries(buffer)?.filter(entry => !entry.name.endsWith('/'))
    expect(files).toEqual([
      { name: 'a.txt', uncompressedSize: 4 },
      { name: 'dir/b.txt', uncompressedSize: 1000 }
    ])
  })

  it('returns null for data that is not a zip', () => {
    expect(readZipEntries(Buffer.from('no soy un zip'))).toBeNull()
    expect(readZipEntries(Buffer.alloc(0))).toBeNull()
  })

  it('detects an expansion bomb from the declared sizes', async () => {
    const buffer = await zipOf({ 'grande.txt': 'a'.repeat(5_000_000) })
    expect(buffer.byteLength).toBeLessThan(50_000)
    expect(isZipTooLarge(buffer, { ...buildLimits(100_000), maxUncompressedBytes: 1_000_000 })).toBe(true)
    expect(isZipTooLarge(buffer, { ...buildLimits(100_000), maxUncompressedBytes: 10_000_000 })).toBe(false)
  })

  it('sniffs the real type from the file signature', async () => {
    expect(sniffFileType(Buffer.from('%PDF-1.7\n...'))).toBe('pdf')
    expect(sniffFileType(await zipOf({ 'word/document.xml': '<w/>' }))).toBe('docx')
    expect(sniffFileType(await zipOf({ 'xl/workbook.xml': '<w/>' }))).toBe('xlsx')
    expect(sniffFileType(await zipOf({ 'ppt/presentation.xml': '<p/>' }))).toBe('pptx')
    expect(sniffFileType(await zipOf({ 'otro.txt': 'x' }))).toBe('zip')
    expect(sniffFileType(Buffer.from('texto plano'))).toBeNull()
  })

  it('truncates long output with an explicit marker', () => {
    expect(truncateMarkdown('corto', 100)).toBe('corto')
    const truncated = truncateMarkdown('a'.repeat(500), 100)
    expect(truncated).toHaveLength(100)
    expect(truncated.endsWith(TRUNCATION_MARKER)).toBe(true)
  })

  it('escapes pipes and newlines in table cells', () => {
    expect(escapeTableCell('a|b\nc')).toBe('a\\|b c')
  })

  it('uses a fence longer than any backtick run in the content', () => {
    expect(fenceFor('sin backticks')).toBe('```')
    expect(fenceFor('hay ```` cuatro')).toBe('`````')
  })

  it('rejects when the promise does not settle in time', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'prueba')).rejects.toThrow(/timed out/)
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'prueba')).resolves.toBe('ok')
  })
})
