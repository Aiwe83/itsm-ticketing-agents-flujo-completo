import { jsonConverter, markdownConverter } from '../services/attachment-converters/text-formats.converter'
import { buildLimits } from '../services/attachment-converters/utils'

const limits = buildLimits(10_000_000)

describe('jsonConverter', () => {
  it('pretty-prints valid JSON inside a json fence', async () => {
    const result = await jsonConverter.convert(Buffer.from('{"a":1,"b":[1,2]}'), limits)
    expect(result).toEqual({
      markdown: '```json\n{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n```'
    })
  })

  it('keeps invalid JSON as raw text', async () => {
    const result = await jsonConverter.convert(Buffer.from('{ no es json'), limits)
    expect(result).toEqual({ markdown: '```json\n{ no es json\n```' })
  })

  it('uses a longer fence when the content contains backticks', async () => {
    const result = await jsonConverter.convert(Buffer.from('{"x":"```\\n# inyeccion\\n```"}'), limits)
    expect(result).toHaveProperty('markdown')
    const markdown = (result as { markdown: string }).markdown
    expect(markdown.startsWith('````json\n')).toBe(true)
    expect(markdown.endsWith('\n````')).toBe(true)
  })

  it('strips a leading BOM', async () => {
    const result = await jsonConverter.convert(Buffer.from('﻿{"a":1}'), limits)
    expect(result).toEqual({ markdown: '```json\n{\n  "a": 1\n}\n```' })
  })

  it('returns unsupported for empty content', async () => {
    expect(await jsonConverter.convert(Buffer.alloc(0), limits)).toEqual({ skipped: 'unsupported' })
    expect(await jsonConverter.convert(Buffer.from('  \n '), limits)).toEqual({ skipped: 'unsupported' })
  })
})

describe('markdownConverter', () => {
  it('passes the text through trimmed', async () => {
    const result = await markdownConverter.convert(Buffer.from('\n# Titulo\n\ntexto\n\n'), limits)
    expect(result).toEqual({ markdown: '# Titulo\n\ntexto' })
  })

  it('strips a leading BOM', async () => {
    const result = await markdownConverter.convert(Buffer.from('﻿# Titulo'), limits)
    expect(result).toEqual({ markdown: '# Titulo' })
  })

  it('returns unsupported for empty content', async () => {
    expect(await markdownConverter.convert(Buffer.alloc(0), limits)).toEqual({ skipped: 'unsupported' })
    expect(await markdownConverter.convert(Buffer.from('﻿  '), limits)).toEqual({ skipped: 'unsupported' })
  })
})
