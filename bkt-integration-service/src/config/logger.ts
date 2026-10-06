import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import pino, { multistream, StreamEntry } from 'pino'
import { env } from './environment'
import { toUtcIsoString } from '../utils/date.util'

const shouldPrettyPrint = env.LOG_PRETTY_PRINT && (env.IS_DEVELOPMENT || env.IS_LOCAL)
const logsDir = join(process.cwd(), 'logs')
const dailyLogFile = () => {
  const date = toUtcIsoString().split('T')[0]
  return join(logsDir, `integration-service-${date}.log`)
}

mkdirSync(logsDir, { recursive: true })

const fileStream = pino.destination({
  dest: dailyLogFile(),
  mkdir: true,
})

const consoleStream = shouldPrettyPrint
  ? pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
        singleLine: false,
      },
    })
  : pino.destination(1)

const streams: StreamEntry[] = [{ stream: fileStream }, { stream: consoleStream }]

const logger = pino(
  {
    level: env.LOG_LEVEL,
    redact: {
      censor: '[REDACTED]',
      paths: [
        'authorization',
        'headers.authorization',
        'req.headers.authorization',
        'err.options.headers.authorization',
        'err.request.options.headers.authorization',
        'password',
        'JIRA_PASSWORD',
      ],
    },
    formatters: {
      level: label => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  multistream(streams)
)

export default logger
