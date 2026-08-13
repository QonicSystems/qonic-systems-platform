import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Prisma 7 dropped the bundled query engine: the client is constructed with a
// driver adapter and an explicit connection string rather than reading `url`
// from schema.prisma.
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");
  // Each cold Vercel function instance builds its own pool; pg's default max
  // of 10 per pool can exhaust a small Postgres's connection limit under
  // concurrent serverless invocations even with a pooled connection string.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 3 }) });
}

// Dev HMR re-evaluates modules on every edit. Without a globalThis guard each
// reload would construct a new client and exhaust the connection pool in minutes.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient() {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createClient();
  }
  return globalForPrisma.prisma;
}

// Next imports route modules while collecting build metadata. Creating the
// client at module scope would make that import require DATABASE_URL, even
// though no request (and therefore no database operation) is being handled.
// Keep the same `db` API, but create the client only when it is first used.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const value = Reflect.get(getClient(), property);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
});
