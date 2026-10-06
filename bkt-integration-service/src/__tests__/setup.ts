import { config } from 'dotenv'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

config({ path: '.env.test', override: true })

const REQUIRED_TEST_ENV: Record<string, string> = {
  NODE_ENV: 'local',
  MONGODB_DATABASE: 'integration-service-test',
  MONGODB_HOST: '127.0.0.1',
  MONGODB_USERNAME: 'test',
  MONGODB_PASSWORD: 'test',
  MESH_ID: '6a323e68-6f87-403a-a87d-72da69fcde0d',
  API_KEY: 'test-api-key',
  ORCHESTRATOR_BASE_URL: 'http://127.0.0.1:9999',
  ORCHESTRATOR_ENDPOINT: '/api/v1/tickets',
  ORCHESTRATOR_ROLE: 'agentic-orchestrator-application',
  ORIGINAL_TICKET_COLLECTION_NAME: 'itsm_tickets_test',
  PROCESSED_TICKET_COLLECTION_NAME: 'tickets_test',
  EXECUTIONS_COLLECTION_NAME: 'executions_test',
  MAPPINGS_COLLECTION_NAME: 'mappings_test',
}

for (const [key, value] of Object.entries(REQUIRED_TEST_ENV)) {
  process.env[key] ??= value
}

process.env['NODE_ENV'] = REQUIRED_TEST_ENV['NODE_ENV']

let mongoServer: MongoMemoryServer | undefined

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const mongoUri = mongoServer.getUri()
  await mongoose.connect(mongoUri)
})

afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key]?.deleteMany({})
  }
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer?.stop()
})
jest.setTimeout(10000)
