-- AlterTable: Make clerkUserId nullable, add self-hosted auth fields
ALTER TABLE "User" ALTER COLUMN "clerkUserId" DROP NOT NULL;

-- Add password and refresh token fields
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "refreshTokenExpiresAt" TIMESTAMP(3);

-- Add address fields for B2B sign-up
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "postalCode" TEXT;
