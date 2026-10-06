export const toUtcIsoString = (value: Date | number | string = new Date()): string => {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date value')
  }

  return date.toISOString()
}

export const parseBsonDate = (value: unknown, fieldPath: string): Date | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid date at ${fieldPath}`)
    return value
  }
  if (typeof value !== 'string') throw new Error(`Invalid date type at ${fieldPath}`)

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date at ${fieldPath}`)
  return parsed
}
