import { z } from 'zod'

// String size/shape bounds for the 42Crunch security audit (pattern + maxLength).
export const ID_MAX = 128
export const SHORT_TEXT_MAX = 500
export const LONG_TEXT_MAX = 50_000
// Not 1:1 with ATTACHMENT_BYTES_LIMIT (4 194 304 bytes, src/config/environment.ts):
// that caps the downloaded binary, not the text extracted from it - compressed
// formats like .docx/.odt can expand well past their source byte size.
export const ATTACHMENT_TEXT_MAX = 20_000_000
export const DATE_TIME_MAX = 40

// Free text / human-authored strings (Jira fields, descriptions): blocks only
// control characters (keeps \t/\n/\r and all normal unicode). Shared between
// the OpenAPI-only schemas (src/openapi/schemas.ts) and the real runtime
// validator (src/validators/issue.validator.ts) - both need the same
// control-character-safe pattern, one doc-only and one enforced on real
// incoming Jira/TC payloads.
export const freeText = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]*$/)

// Identifiers/tokens our own code generates or composes (e.g. `${MESH_ID}:${ticketKey}`):
// no whitespace, no control characters.
export const token = (max: number) =>
  z
    .string()
    .max(max)
    .regex(/^[^\s\x00-\x1F\x7F]*$/)
