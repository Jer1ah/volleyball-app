import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pool: any = new pg.Pool({ connectionString })
const adapter = new PrismaPg(pool)

const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ adapter }) // No URL here, the adapter handles it!

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma