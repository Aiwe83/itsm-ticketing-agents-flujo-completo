import { database } from '../config/database'
import logger from '../config/logger'
import {
  MESH_MIGRATION_TARGET_DB,
  runMeshMigration,
  type MeshMigrationMode,
} from '../services/mesh-migration.service'

const parseArgs = (): { mode: MeshMigrationMode; confirmTarget?: string } => {
  const modeArg = process.argv.find(argument => argument.startsWith('--mode='))
  const confirmArg = process.argv.find(argument => argument.startsWith('--confirm='))
  const mode = modeArg?.split('=')[1]

  if (mode !== 'dry-run' && mode !== 'apply') {
    throw new Error('Use --mode=dry-run or --mode=apply')
  }

  return {
    mode,
    confirmTarget: confirmArg?.split('=')[1],
  }
}

const run = async (): Promise<void> => {
  await database.connect()
  try {
    const summary = await runMeshMigration(parseArgs())
    logger.info({ summary }, 'Mesh migration completed')
    console.log(JSON.stringify(summary, null, 2))

    if (summary.collections.some(collection => collection.conflicts.length > 0)) {
      process.exitCode = 1
    }
  } finally {
    await database.disconnect()
  }
}

void run().catch((error: unknown) => {
  logger.error({ err: error, targetDatabase: MESH_MIGRATION_TARGET_DB }, 'Mesh migration failed')
  process.exitCode = 1
})
