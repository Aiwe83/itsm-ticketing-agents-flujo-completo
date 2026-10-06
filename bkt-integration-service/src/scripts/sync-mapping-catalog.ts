// Script de linea de comandos para `pnpm mappings:dry-run` y `pnpm mappings:apply`.
// Es solo un envoltorio fino: lee los flags de la terminal, conecta a Mongo, llama al servicio
// real (mapping-catalog.service.ts, que es donde esta toda la logica) y pinta el resultado.
// Calco del mismo patron que ya usa migrate-mesh.ts para la migracion de meshId.

import { database } from '../config/database'
import logger from '../config/logger'
import {
  runMappingCatalogSync,
  type MappingCatalogSyncMode,
} from '../services/mapping-catalog.service'

// Lee los argumentos --mode=, --confirm-version= y --context= tal cual se pasan por terminal.
// Ejemplo real: pnpm mappings:apply -- --confirm-version=1.0.0
const parseArgs = (): {
  mode: MappingCatalogSyncMode
  confirmVersion?: string
  contextPath?: string
} => {
  const modeArg = process.argv.find(argument => argument.startsWith('--mode='))
  const confirmArg = process.argv.find(argument => argument.startsWith('--confirm-version='))
  const contextArg = process.argv.find(argument => argument.startsWith('--context='))
  const mode = modeArg?.split('=')[1]

  if (mode !== 'dry-run' && mode !== 'apply') {
    throw new Error('Use --mode=dry-run or --mode=apply')
  }

  return {
    mode,
    confirmVersion: confirmArg?.split('=')[1],
    contextPath: contextArg?.split('=')[1],
  }
}

const run = async (): Promise<void> => {
  await database.connect()
  try {
    const summary = await runMappingCatalogSync(parseArgs())
    logger.info({ summary }, 'Mapping catalog sync completed')
    // Se imprime tambien por consola (ademas del log) para que el resumen se vea claro al
    // ejecutar el comando a mano en la terminal.
    console.log(JSON.stringify(summary, null, 2))

    // Si hubo conflictos, el proceso termina con codigo de error — util para que un pipeline
    // automatico (CI, por ejemplo) detecte que algo necesita revision manual.
    if (summary.conflicts.length > 0) {
      process.exitCode = 1
    }
  } finally {
    // Pase lo que pase (exito o error), siempre se cierra la conexion a Mongo al final.
    await database.disconnect()
  }
}

void run().catch((error: unknown) => {
  logger.error({ err: error }, 'Mapping catalog sync failed')
  process.exitCode = 1
})
