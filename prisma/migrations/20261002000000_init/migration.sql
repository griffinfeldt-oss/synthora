-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('BUYER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('NONE', 'INCOMPLETE', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "PartnerAuthType" AS ENUM ('API_KEY', 'OAUTH', 'NONE');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'PAUSED', 'PAUSED_BILLING', 'SUSPENDED', 'REMOVED');

-- CreateEnum
CREATE TYPE "ListingKind" AS ENUM ('PARTNER', 'SELF_SHIP', 'DIGITAL');

-- CreateEnum
CREATE TYPE "AiInvolvement" AS ENUM ('FULL', 'ASSISTED');

-- CreateEnum
CREATE TYPE "ImageKind" AS ENUM ('PHOTO', 'DESIGN', 'MOCKUP_PARTNER', 'MOCKUP_RENDER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'FULFILLING', 'COMPLETED', 'CANCELED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SellerOrderStatus" AS ENUM ('PENDING', 'PAID', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'ACTION_NEEDED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('NOT_READY', 'HELD', 'ELIGIBLE', 'PAID', 'REVERSED', 'CANCELED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "FulfillmentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PayoutTransferStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('CHARGE', 'SELLER_SALE', 'COMMISSION', 'PROCESSING_FEE', 'PAYOUT', 'REFUND', 'COMMISSION_REVERSAL', 'TRANSFER_REVERSAL', 'DISPUTE', 'SUBSCRIPTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('NOT_AI_MADE', 'IP_INFRINGEMENT', 'PROHIBITED_ITEM', 'MISLEADING', 'OFFENSIVE', 'SCAM', 'OTHER');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'ACTIONED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "TakedownStatus" AS ENUM ('RECEIVED', 'LISTING_REMOVED', 'REJECTED', 'COUNTER_NOTICE', 'RESTORED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'BUYER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "location" TEXT,
    "status" "SellerStatus" NOT NULL DEFAULT 'PENDING',
    "statusReason" TEXT,
    "stripeAccountId" TEXT,
    "chargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "detailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "stripeCustomerId" TEXT,
    "subscriptionId" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'NONE',
    "currentPeriodEnd" TIMESTAMP(3),
    "offersSelfShip" BOOLEAN NOT NULL DEFAULT false,
    "offersDigital" BOOLEAN NOT NULL DEFAULT false,
    "defaultShipFrom" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerConnection" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "authType" "PartnerAuthType" NOT NULL,
    "encryptedCredentials" TEXT NOT NULL,
    "accountLabel" TEXT,
    "externalShopId" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "mock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "statusReason" TEXT,
    "kind" "ListingKind" NOT NULL,
    "productType" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "aiTool" TEXT NOT NULL,
    "aiInvolvement" "AiInvolvement" NOT NULL DEFAULT 'FULL',
    "howMade" TEXT NOT NULL,
    "prompt" TEXT,
    "generationId" TEXT,
    "provider" TEXT NOT NULL,
    "partnerConnectionId" TEXT,
    "partnerProductId" TEXT,
    "partnerData" JSONB,
    "baseCostCents" INTEGER NOT NULL DEFAULT 0,
    "shippingCents" INTEGER,
    "processingDays" INTEGER NOT NULL DEFAULT 3,
    "inventory" INTEGER,
    "rightsConfirmedAt" TIMESTAMP(3),
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingVariant" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partnerVariantId" TEXT,
    "baseCostCents" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "kind" "ImageKind" NOT NULL DEFAULT 'PHOTO',
    "mockup" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalAsset" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "buyerId" TEXT,
    "email" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "shippingAddress" JSONB,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "processingFeeCents" INTEGER,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "accessToken" TEXT NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerOrder" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "SellerOrderStatus" NOT NULL DEFAULT 'PENDING',
    "itemsCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "processingFeeCents" INTEGER NOT NULL,
    "partnerCostCents" INTEGER NOT NULL,
    "netCents" INTEGER NOT NULL,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "payoutStatus" "PayoutStatus" NOT NULL DEFAULT 'NOT_READY',
    "payoutEligibleAt" TIMESTAMP(3),
    "buyerConfirmedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fulfillment" (
    "id" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connectionId" TEXT,
    "partnerOrderId" TEXT,
    "status" "FulfillmentStatus" NOT NULL DEFAULT 'PENDING',
    "trackingNumber" TEXT,
    "trackingCarrier" TEXT,
    "trackingUrl" TEXT,
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "fulfillmentId" TEXT,
    "listingId" TEXT NOT NULL,
    "variantId" TEXT,
    "title" TEXT NOT NULL,
    "variantName" TEXT,
    "imageUrl" TEXT,
    "provider" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "baseCostCents" INTEGER NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "sellerOrderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripeTransferId" TEXT,
    "status" "PayoutTransferStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "reversedCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "account" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "sellerId" TEXT,
    "orderId" TEXT,
    "sellerOrderId" TEXT,
    "stripeRef" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "stripeDisputeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "reporterId" TEXT,
    "email" TEXT,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL DEFAULT 'OPEN',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TakedownRequest" (
    "id" TEXT NOT NULL,
    "listingId" TEXT,
    "listingUrl" TEXT NOT NULL,
    "claimantName" TEXT NOT NULL,
    "claimantEmail" TEXT NOT NULL,
    "claimantAddress" TEXT,
    "rightsOwner" TEXT NOT NULL,
    "workDescription" TEXT NOT NULL,
    "infringementNote" TEXT NOT NULL,
    "goodFaith" BOOLEAN NOT NULL,
    "accurate" BOOLEAN NOT NULL,
    "signature" TEXT NOT NULL,
    "status" "TakedownStatus" NOT NULL DEFAULT 'RECEIVED',
    "counterNotice" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TakedownRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailOutbox" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_userId_key" ON "Seller"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_slug_key" ON "Seller"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_stripeAccountId_key" ON "Seller"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_stripeCustomerId_key" ON "Seller"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_subscriptionId_key" ON "Seller"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerConnection_sellerId_provider_key" ON "PartnerConnection"("sellerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_slug_key" ON "Listing"("slug");

-- CreateIndex
CREATE INDEX "Listing_status_category_idx" ON "Listing"("status", "category");

-- CreateIndex
CREATE INDEX "Listing_status_productType_idx" ON "Listing"("status", "productType");

-- CreateIndex
CREATE INDEX "Listing_status_aiTool_idx" ON "Listing"("status", "aiTool");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalAsset_listingId_key" ON "DigitalAsset"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_accessToken_key" ON "Order"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeCheckoutSessionId_key" ON "Order"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripePaymentIntentId_key" ON "Order"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeChargeId_key" ON "Order"("stripeChargeId");

-- CreateIndex
CREATE INDEX "SellerOrder_sellerId_status_idx" ON "SellerOrder"("sellerId", "status");

-- CreateIndex
CREATE INDEX "SellerOrder_payoutStatus_payoutEligibleAt_idx" ON "SellerOrder"("payoutStatus", "payoutEligibleAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fulfillment_provider_partnerOrderId_key" ON "Fulfillment"("provider", "partnerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_stripeTransferId_key" ON "Payout"("stripeTransferId");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_createdAt_idx" ON "LedgerEntry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_sellerId_idx" ON "LedgerEntry"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_stripeDisputeId_key" ON "Dispute"("stripeDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_orderItemId_key" ON "Review"("orderItemId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscriber_email_key" ON "Subscriber"("email");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerConnection" ADD CONSTRAINT "PartnerConnection_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_partnerConnectionId_fkey" FOREIGN KEY ("partnerConnectionId") REFERENCES "PartnerConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingVariant" ADD CONSTRAINT "ListingVariant_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalAsset" ADD CONSTRAINT "DigitalAsset_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_fulfillmentId_fkey" FOREIGN KEY ("fulfillmentId") REFERENCES "Fulfillment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ListingVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakedownRequest" ADD CONSTRAINT "TakedownRequest_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

