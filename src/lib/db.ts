import { PrismaClient } from '@/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  /** The class the kept client was made from — a regenerated client after a migration is another class. */
  prismaClass: typeof PrismaClient | undefined
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

// In development the client outlives a reload of the code, which is the
// point; but after a migration the regenerated client knows fields the kept
// one does not, and every query naming them would fail until a restart.
const kept = globalForPrisma.prismaClass === PrismaClient ? globalForPrisma.prisma : undefined
if (!kept && globalForPrisma.prisma) void globalForPrisma.prisma.$disconnect().catch(() => {})

export const db = kept ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
  globalForPrisma.prismaClass = PrismaClient
}
