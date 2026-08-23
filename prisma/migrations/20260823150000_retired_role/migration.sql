-- Tombstones for roles deleted through the admin console.
--
-- prisma/seed.ts upserts every SEEDED_ROLES entry on each run, so deleting a
-- built-in role only removed it until the next deploy recreated it. The seed now
-- checks this table first, which is what makes a deletion permanent.

-- CreateTable
CREATE TABLE "RetiredRole" (
    "key" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredById" TEXT,

    CONSTRAINT "RetiredRole_pkey" PRIMARY KEY ("key")
);
