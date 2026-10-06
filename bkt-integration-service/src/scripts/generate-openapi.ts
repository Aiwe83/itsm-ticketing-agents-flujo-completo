import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { stringify } from 'yaml'
import { buildOpenApiDocument } from '../openapi/document'

// Resolved relative to this file's own location (not process.cwd()) so it
// works identically run via ts-node from src/ or compiled to dist/scripts/.
const OUTPUT_PATH = resolve(__dirname, '..', '..', 'openapi.yaml')

const HEADER =
  '# GENERATED FILE - do not edit by hand.\n' +
  '# Source of truth: src/openapi/{schemas,examples,document}.ts\n' +
  '# Regenerate with: pnpm openapi:generate\n' +
  '# Verify it is in sync (CI-safe, no write) with: pnpm openapi:check\n\n'

const run = (): void => {
  const checkOnly = process.argv.includes('--check')
  const document = buildOpenApiDocument()
  const yaml = HEADER + stringify(document, { indentSeq: false })

  if (checkOnly) {
    if (!existsSync(OUTPUT_PATH)) {
      console.error(`openapi.yaml missing at ${OUTPUT_PATH}. Run: pnpm openapi:generate`)
      process.exitCode = 1
      return
    }
    const current = readFileSync(OUTPUT_PATH, 'utf8')
    if (current !== yaml) {
      console.error('openapi.yaml is out of sync with src/openapi/*.ts. Run: pnpm openapi:generate')
      process.exitCode = 1
      return
    }
    console.log('openapi.yaml is in sync.')
    return
  }

  writeFileSync(OUTPUT_PATH, yaml, 'utf8')
  console.log(`openapi.yaml written to ${OUTPUT_PATH}`)
}

run()
