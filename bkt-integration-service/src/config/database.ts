import mongoose from 'mongoose'
import { env } from './environment'
import logger from './logger'

class Database {
  private static instance: Database

  private constructor() {}

  public static getInstance(): Database {
    if (!Database.instance) {
      Database.instance = new Database()
    }
    return Database.instance
  }

  public async connect(): Promise<void> {
    try {
      mongoose.set('strictQuery', true)

      const options = {
        maxPoolSize: env.MONGODB_MAX_POOL_SIZE,
        minPoolSize: env.MONGODB_MIN_POOL_SIZE,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      }

      const url = `mongodb://${env.MONGODB_USERNAME}:${env.MONGODB_PASSWORD}@${env.MONGODB_HOST}:27017/${env.MONGODB_DATABASE}?authSource=admin`
      await mongoose.connect(url, options)
      logger.info({ database: mongoose.connection.name }, 'Mongoose connected to MongoDB')
      this.setupEventListeners()
    } catch (error) {
      logger.error({ err: error }, 'MongoDB connection error')
      throw error
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await mongoose.disconnect()
      logger.info('MongoDB disconnected')
    } catch (error) {
      logger.error({ err: error }, 'MongoDB disconnection error')
      throw error
    }
  }

  private setupEventListeners(): void {
    mongoose.connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB')
    })

    mongoose.connection.on('error', err => {
      logger.error({ err }, 'Mongoose connection error')
    })

    mongoose.connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB')
    })

    mongoose.connection.on('reconnected', () => {
      logger.info('Mongoose reconnected to MongoDB')
    })

    process.on('SIGINT', async () => {
      await this.disconnect()
      process.exit(0)
    })

    process.on('SIGTERM', async () => {
      await this.disconnect()
      process.exit(0)
    })
  }

  public isConnected(): boolean {
    return mongoose.connection.readyState === 1
  }

  public getMongoose(): typeof mongoose {
    return mongoose
  }
}

export const database = Database.getInstance()
