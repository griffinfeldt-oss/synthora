-- Pre-launch waitlist.
CREATE TYPE "WaitlistRole" AS ENUM ('CREATOR', 'BUYER');

CREATE TABLE "WaitlistSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "WaitlistRole" NOT NULL,
    "portfolio" TEXT,
    "note" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistSignup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistSignup_email_role_key" ON "WaitlistSignup"("email", "role");
CREATE INDEX "WaitlistSignup_createdAt_idx" ON "WaitlistSignup"("createdAt");
