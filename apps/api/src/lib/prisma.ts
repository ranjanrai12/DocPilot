import { PrismaClient } from '@prisma/client';

// Singleton pattern — reuse the same client across hot-reloads in dev.
// In Node.js each module is cached, so this runs once per process.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
