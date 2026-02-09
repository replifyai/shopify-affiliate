import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

const defaultDatabaseUrl =
  process.env.NODE_ENV === "production"
    ? "postgresql://postgres:postgres@localhost:5432/postgres?schema=public"
    : "postgresql://postgres:postgres@localhost:5432/postgres?schema=public";

const databaseUrl = process.env.DATABASE_URL || defaultDatabaseUrl;

if (!process.env.DATABASE_URL) {
  console.warn(
    "DATABASE_URL is not set. Falling back to local PostgreSQL at localhost:5432.",
  );
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createPrismaClient();
  }
}

const prisma = global.prismaGlobal ?? createPrismaClient();

async function ensureSessionTableExists() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Session" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "shop" TEXT NOT NULL,
        "state" TEXT NOT NULL,
        "isOnline" BOOLEAN NOT NULL DEFAULT false,
        "scope" TEXT,
        "expires" TIMESTAMP(3),
        "accessToken" TEXT NOT NULL,
        "userId" BIGINT,
        "firstName" TEXT,
        "lastName" TEXT,
        "email" TEXT,
        "accountOwner" BOOLEAN NOT NULL DEFAULT false,
        "locale" TEXT,
        "collaborator" BOOLEAN DEFAULT false,
        "emailVerified" BOOLEAN DEFAULT false,
        "refreshToken" TEXT,
        "refreshTokenExpires" TIMESTAMP(3)
      )
    `);
  } catch (error) {
    console.error("Failed to ensure Session table exists:", error);
  }
}

export const dbReady = ensureSessionTableExists();
export default prisma;
