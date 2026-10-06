-- CreateEnum
CREATE TYPE "AuthTokenKind" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('UPLOAD_IMAGE', 'UPLOAD_FILE', 'GENERATED_DESIGN', 'PREVIEW');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('QUARANTINE', 'READY', 'REJECTED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ListingVersionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ReviewOutcome" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'ESTIMATED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'RECOVERED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "OperationStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('RUNNING', 'OK', 'DIFFERENCES', 'FAILED');

-- CreateEnum
CREATE TYPE "UsageStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED');

-- AlterEnum
ALTER TYPE "LedgerType" ADD VALUE 'FEE_ADJUSTMENT';
ALTER TYPE "LedgerType" ADD VALUE 'DEBT_OFFSET';
ALTER TYPE "LedgerType" ADD VALUE 'WRITE_OFF';

-- AlterEnum
ALTER TYPE "ListingStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "PayoutStatus" ADD VALUE 'PROCESSING';

-- DropForeignKey
ALTER TABLE "DigitalAsset" DROP CONSTRAINT "DigitalAsset_listingId_fkey";

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN     "costCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "reservationId" TEXT,
ADD COLUMN     "status" "GenerationStatus" NOT NULL DEFAULT 'SUCCEEDED';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "opKey" TEXT,
ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "approvedVersionId" TEXT,
ADD COLUMN     "deliverableAssetId" TEXT,
ADD COLUMN     "designAssetId" TEXT,
ADD COLUMN     "licenseVersionId" TEXT;

-- AlterTable
ALTER TABLE "ListingImage" ADD COLUMN     "assetId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "checkoutKey" TEXT,
ADD COLUMN     "feePolicyVersion" TEXT NOT NULL DEFAULT '2026-10-01',
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'demo',
ADD COLUMN     "processingFeeStatus" "FeeStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "deliverableAssetId" TEXT,
ADD COLUMN     "designAssetId" TEXT,
ADD COLUMN     "designSha256" TEXT,
ADD COLUMN     "inventoryReserved" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "licenseVersionId" TEXT,
ADD COLUMN     "listingVersionId" TEXT,
ADD COLUMN     "partnerProductId" TEXT,
ADD COLUMN     "partnerSpec" JSONB,
ADD COLUMN     "partnerVariantId" TEXT;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "offsetCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "operationId" TEXT;

-- AlterTable
ALTER TABLE "Seller" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payoutsHaltedAt" TIMESTAMP(3),
ADD COLUMN     "payoutsHaltedReason" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isTest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSecret" TEXT;


-- CreateTable
CREATE TABLE "AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AuthTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "SellerInvite" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "email" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "sellerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT,
    "kind" "AssetKind" NOT NULL,
    "visibility" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "status" "AssetStatus" NOT NULL DEFAULT 'QUARANTINE',
    "rejectReason" TEXT,
    "generationId" TEXT,
    "previewOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingVersion" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "ListingVersionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "snapshot" JSONB NOT NULL,
    "designAssetId" TEXT,
    "designSha256" TEXT,
    "deliverableAssetId" TEXT,
    "licenseVersionId" TEXT,
    "manifest" JSONB NOT NULL,
    "checksPassed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewDecision" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "outcome" "ReviewOutcome" NOT NULL,
    "scope" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseVersion" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "commercial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "licenseVersionId" TEXT,
    "status" "EntitlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "revokedReason" TEXT,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER NOT NULL DEFAULT 20,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerReceivable" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sellerOrderId" TEXT,
    "orderId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "recoveredCents" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerReceivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" "OperationStatus" NOT NULL DEFAULT 'REQUESTED',
    "payloadHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "providerRef" TEXT,
    "result" JSONB,
    "lastError" TEXT,
    "sellerId" TEXT,
    "orderId" TEXT,
    "sellerOrderId" TEXT,
    "ownerRole" TEXT NOT NULL DEFAULT 'finance',
    "escalateAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "ownerRole" TEXT NOT NULL DEFAULT 'operations',
    "escalateAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "status" "ReconStatus" NOT NULL DEFAULT 'RUNNING',
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "checked" INTEGER NOT NULL DEFAULT 0,
    "differences" JSONB NOT NULL DEFAULT '[]',
    "haltedSellerIds" TEXT[],
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageReservation" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "estCostCents" INTEGER NOT NULL,
    "actualCostCents" INTEGER,
    "status" "UsageStatus" NOT NULL DEFAULT 'RESERVED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "anonId" TEXT,
    "userId" TEXT,
    "listingId" TEXT,
    "listingVersionId" TEXT,
    "orderId" TEXT,
    "props" JSONB,
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_kind_idx" ON "AuthToken"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SellerInvite_code_key" ON "SellerInvite"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SellerInvite_sellerId_key" ON "SellerInvite"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_sellerId_kind_idx" ON "Asset"("sellerId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ListingVersion_listingId_number_key" ON "ListingVersion"("listingId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseVersion_key_version_key" ON "LicenseVersion"("key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_orderItemId_key" ON "Entitlement"("orderItemId");

-- CreateIndex
CREATE INDEX "Entitlement_orderId_idx" ON "Entitlement"("orderId");

-- CreateIndex
CREATE INDEX "SellerReceivable_sellerId_status_idx" ON "SellerReceivable"("sellerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Operation_key_key" ON "Operation"("key");

-- CreateIndex
CREATE INDEX "Operation_status_updatedAt_idx" ON "Operation"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Operation_sellerOrderId_idx" ON "Operation"("sellerOrderId");

-- CreateIndex
CREATE INDEX "Operation_orderId_idx" ON "Operation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_key_key" ON "Job"("key");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "UsageReservation_sellerId_createdAt_idx" ON "UsageReservation"("sellerId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageReservation_status_createdAt_idx" ON "UsageReservation"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsEvent_dedupeKey_key" ON "AnalyticsEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_anonId_idx" ON "AnalyticsEvent"("anonId");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_opKey_seq_key" ON "LedgerEntry"("opKey", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_approvedVersionId_key" ON "Listing"("approvedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_checkoutKey_key" ON "Order"("checkoutKey");

-- AddForeignKey
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerInvite" ADD CONSTRAINT "SellerInvite_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_designAssetId_fkey" FOREIGN KEY ("designAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_deliverableAssetId_fkey" FOREIGN KEY ("deliverableAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_licenseVersionId_fkey" FOREIGN KEY ("licenseVersionId") REFERENCES "LicenseVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_approvedVersionId_fkey" FOREIGN KEY ("approvedVersionId") REFERENCES "ListingVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_previewOfId_fkey" FOREIGN KEY ("previewOfId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingVersion" ADD CONSTRAINT "ListingVersion_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ListingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewDecision" ADD CONSTRAINT "ReviewDecision_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_listingVersionId_fkey" FOREIGN KEY ("listingVersionId") REFERENCES "ListingVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerReceivable" ADD CONSTRAINT "SellerReceivable_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageReservation" ADD CONSTRAINT "UsageReservation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Carry existing data over ────────────────────────────────────────────────

ALTER TABLE "Order" ALTER COLUMN "feePolicyVersion" DROP DEFAULT;

-- Orders paid through the mock gateway only ever had an estimated fee.
UPDATE "Order" SET
  "processingFeeStatus" = (CASE
    WHEN "paidAt" IS NULL THEN 'PENDING'
    WHEN "stripePaymentIntentId" LIKE 'pi_mock%' THEN 'ESTIMATED'
    ELSE 'ACTUAL' END)::"FeeStatus",
  "mode" = CASE
    WHEN "stripeCheckoutSessionId" LIKE 'cs_live%' THEN 'live'
    WHEN "stripeCheckoutSessionId" LIKE 'cs_test%' THEN 'test'
    ELSE 'demo' END;

-- Digital files become private Asset rows; buyers who paid get entitlements.
INSERT INTO "Asset" ("id", "sellerId", "kind", "visibility", "storageKey", "fileName", "contentType", "sizeBytes", "status", "createdAt")
SELECT 'mig_' || d."id", l."sellerId", 'UPLOAD_FILE', 'private', d."storageKey", d."fileName", d."contentType", d."sizeBytes", 'READY', d."createdAt"
FROM "DigitalAsset" d JOIN "Listing" l ON l."id" = d."listingId";

UPDATE "Listing" l SET "deliverableAssetId" = 'mig_' || d."id" FROM "DigitalAsset" d WHERE d."listingId" = l."id";

UPDATE "OrderItem" oi SET "deliverableAssetId" = l."deliverableAssetId"
FROM "Listing" l WHERE oi."listingId" = l."id" AND l."deliverableAssetId" IS NOT NULL;

INSERT INTO "Entitlement" ("id", "orderItemId", "orderId", "assetId", "status", "downloadCount", "createdAt", "updatedAt")
SELECT 'mig_' || oi."id", oi."id", oi."orderId", oi."deliverableAssetId",
  (CASE WHEN so."status" IN ('REFUNDED', 'CANCELED') THEN 'REVOKED' ELSE 'ACTIVE' END)::"EntitlementStatus",
  oi."downloadCount", o."paidAt", NOW()
FROM "OrderItem" oi
JOIN "Order" o ON o."id" = oi."orderId"
JOIN "SellerOrder" so ON so."id" = oi."sellerOrderId"
WHERE oi."deliverableAssetId" IS NOT NULL AND o."paidAt" IS NOT NULL;

-- Listings published before review existed become version 1, marked as legacy
-- (no technical checks recorded, no reviewer). Admins can re-review them.
INSERT INTO "ListingVersion" ("id", "listingId", "number", "status", "snapshot", "deliverableAssetId", "manifest", "checksPassed", "createdAt")
SELECT 'mig_' || l."id", l."id", 1,
  (CASE WHEN l."status" = 'PENDING_REVIEW' THEN 'PENDING_REVIEW' ELSE 'APPROVED' END)::"ListingVersionStatus",
  jsonb_build_object(
    'title', l."title", 'description', l."description", 'priceCents', l."priceCents", 'kind', l."kind",
    'productType', l."productType", 'provider', l."provider", 'partnerProductId', l."partnerProductId",
    'aiTool', l."aiTool", 'aiInvolvement', l."aiInvolvement", 'howMade', l."howMade", 'prompt', l."prompt"),
  l."deliverableAssetId",
  jsonb_build_object('legacy', true, 'note', 'Published before listing review and file checks existed.'),
  false, l."createdAt"
FROM "Listing" l WHERE l."status" <> 'DRAFT';

UPDATE "Listing" SET "approvedVersionId" = 'mig_' || "id" WHERE "status" NOT IN ('DRAFT', 'PENDING_REVIEW');

-- Freeze what existing order items were sold as.
UPDATE "OrderItem" oi SET "listingVersionId" = v."id" FROM "ListingVersion" v WHERE v."id" = 'mig_' || oi."listingId";
UPDATE "OrderItem" oi SET "partnerProductId" = l."partnerProductId", "partnerSpec" = l."partnerData" FROM "Listing" l WHERE oi."listingId" = l."id";
UPDATE "OrderItem" oi SET "partnerVariantId" = v."partnerVariantId" FROM "ListingVariant" v WHERE oi."variantId" = v."id";

-- Old storage of the same data.
ALTER TABLE "OrderItem" DROP COLUMN "downloadCount";
DROP TABLE "DigitalAsset";
