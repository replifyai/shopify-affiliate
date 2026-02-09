import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function getDatabaseUrl() {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) return configuredUrl;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is required in production for Shopify session storage.",
    );
  }

  console.warn(
    "DATABASE_URL is not set. Falling back to local PostgreSQL at localhost:5432 for development.",
  );
  return "postgresql://postgres:postgres@localhost:5432/postgres?schema=public";
}

const databaseUrl = getDatabaseUrl();

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
}

export const dbReady = ensureSessionTableExists().catch((error) => {
  console.error("Failed to ensure Session table exists:", error);
  throw error;
});
export default prisma;
