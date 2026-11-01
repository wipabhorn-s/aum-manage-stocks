-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('MANUAL_ADJUSTMENT', 'CHAT_ADJUSTMENT', 'SALE', 'SALE_VOID');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateEnum
CREATE TYPE "StockMovementSource" AS ENUM ('WEB', 'LINE');

-- CreateEnum
CREATE TYPE "PendingActionSource" AS ENUM ('WEB', 'LINE');

-- CreateEnum
CREATE TYPE "PendingActionIntent" AS ENUM ('ADJUST_STOCK');

-- CreateEnum
CREATE TYPE "StockOperation" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SHOP_OWNER', 'SHOP_STAFF', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminAuditAction" AS ENUM ('USER_SUSPEND', 'USER_REACTIVATE', 'USER_ROLE_CHANGE', 'SHOP_SUSPEND', 'SHOP_REACTIVATE');

-- CreateEnum
CREATE TYPE "AdminAuditTargetType" AS ENUM ('USER', 'SHOP');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShopStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('NEW_SUBSCRIPTION', 'RENEWAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "shop_product_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('LOW_STOCK', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_EXPIRED', 'ACCOUNT_SUSPENDED', 'PRODUCT_LIMIT_REACHED', 'SHOP_LIMIT_REACHED');

-- CreateEnum
CREATE TYPE "chat_channel" AS ENUM ('WEB', 'LINE');

-- CreateEnum
CREATE TYPE "chat_role" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "ai_recommendation_type" AS ENUM ('RESTOCK', 'CLEARANCE', 'PROMOTION');

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "shopProductId" UUID NOT NULL,
    "actorId" UUID,
    "sale_id" UUID,
    "pending_action_id" UUID,
    "movementType" "StockMovementType" NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "quantityBefore" INTEGER NOT NULL,
    "quantityAfter" INTEGER NOT NULL,
    "source" "StockMovementSource" NOT NULL,
    "note" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAction" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "actorId" UUID,
    "source" "PendingActionSource" NOT NULL,
    "originalMessage" TEXT NOT NULL,
    "intent" "PendingActionIntent" NOT NULL,
    "shopProductId" UUID,
    "productQuery" TEXT NOT NULL,
    "operation" "StockOperation" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB,
    "parsed_items" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" UUID NOT NULL,
    "shopId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "sale_no" VARCHAR(30) NOT NULL,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "voidedById" UUID,
    "voidReason" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "saleId" UUID NOT NULL,
    "shopProductId" UUID NOT NULL,
    "productName" TEXT NOT NULL,
    "barcode" VARCHAR(50),
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "cost_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "quantity" INTEGER NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "email_verified_at" TIMESTAMPTZ(2),
    "username" VARCHAR(50),
    "password" TEXT,
    "line_user_id" TEXT,
    "google_id" TEXT,
    "owner_id" UUID,
    "role" "UserRole" NOT NULL,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
    "two_factor_secret_enc" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(2),
    "deleted_at" TIMESTAMPTZ(2),
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(2) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "used_at" TIMESTAMPTZ(2),
    "revoked_at" TIMESTAMPTZ(2),
    "expires_at" TIMESTAMPTZ(2) NOT NULL,
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(2) NOT NULL,
    "used_at" TIMESTAMPTZ(2),
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "pending_email" TEXT,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(2) NOT NULL,
    "used_at" TIMESTAMPTZ(2),
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" "AdminAuditAction" NOT NULL,
    "target_type" "AdminAuditTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "two_factor_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(2),
    "created_at" TIMESTAMPTZ(2) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "two_factor_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name_th" VARCHAR(100) NOT NULL,
    "price_thb" DECIMAL(12,2) NOT NULL,
    "duration_months" INTEGER,
    "included_shop_quota" INTEGER NOT NULL DEFAULT 1,
    "included_staff_quota" INTEGER NOT NULL DEFAULT 0,
    "max_active_products" INTEGER,
    "chatbot_enabled" BOOLEAN NOT NULL DEFAULT false,
    "barcode_enabled" BOOLEAN NOT NULL DEFAULT false,
    "ai_recommendation_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "expiry_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "subscription_id" UUID,
    "purpose" "PaymentPurpose" NOT NULL,
    "amount_thb" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'THB',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(50) NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shops" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(500),
    "phone" VARCHAR(20),
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "status" "ShopStatus" NOT NULL DEFAULT 'ACTIVE',
    "paused_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_staffs" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "shop_staffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_permissions" (
    "id" UUID NOT NULL,
    "shop_staff_id" UUID NOT NULL,
    "can_manage_product" BOOLEAN NOT NULL DEFAULT false,
    "can_adjust_stock_manual" BOOLEAN NOT NULL DEFAULT false,
    "can_use_chatbot" BOOLEAN NOT NULL DEFAULT false,
    "can_scan_sale" BOOLEAN NOT NULL DEFAULT false,
    "can_view_dashboard" BOOLEAN NOT NULL DEFAULT false,
    "can_view_ai_insight" BOOLEAN NOT NULL DEFAULT false,
    "granted_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "barcode" VARCHAR(50),
    "unit" VARCHAR(20) NOT NULL,
    "image_url" VARCHAR(500),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_products" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sell_price" DECIMAL(12,2) NOT NULL,
    "cost_price" DECIMAL(12,2) NOT NULL,
    "stock_qty" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 0,
    "status" "shop_product_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "shop_id" UUID,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "chat_channel" NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" TEXT NOT NULL,
    "pending_action_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" UUID NOT NULL,
    "shop_id" UUID NOT NULL,
    "shop_product_id" UUID,
    "type" "ai_recommendation_type" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "metrics" JSONB,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6),
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_sql_scripts" (
    "filename" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "_sql_scripts_pkey" PRIMARY KEY ("filename")
);

-- CreateIndex
CREATE INDEX "StockMovement_shopId_createdAt_idx" ON "StockMovement"("shopId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMovement_shopId_shopProductId_createdAt_idx" ON "StockMovement"("shopId", "shopProductId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMovement_shopId_actorId_createdAt_idx" ON "StockMovement"("shopId", "actorId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMovement_shopId_movementType_createdAt_idx" ON "StockMovement"("shopId", "movementType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StockMovement_sale_id_idx" ON "StockMovement"("sale_id");

-- CreateIndex
CREATE INDEX "StockMovement_pending_action_id_idx" ON "StockMovement"("pending_action_id");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_referenceType_referenceId_key" ON "StockMovement"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "PendingAction_shopId_status_createdAt_idx" ON "PendingAction"("shopId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PendingAction_expiresAt_status_idx" ON "PendingAction"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "Sale_shopId_createdAt_idx" ON "Sale"("shopId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Sale_shopId_status_createdAt_idx" ON "Sale"("shopId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Sale_shopId_sale_no_key" ON "Sale"("shopId", "sale_no");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleItem_shopProductId_idx" ON "SaleItem"("shopProductId");

-- CreateIndex
CREATE UNIQUE INDEX "users_line_user_id_key" ON "users"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "idx_user_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_user_username" ON "users"("username");

-- CreateIndex
CREATE INDEX "idx_user_line" ON "users"("line_user_id");

-- CreateIndex
CREATE INDEX "idx_user_google" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "idx_user_owner" ON "users"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_refresh_token_user" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_refresh_token_family" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "idx_password_reset_user" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_hash_key" ON "email_verification_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_email_verification_user" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_admin_audit_actor" ON "admin_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_admin_audit_target" ON "admin_audit_logs"("target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_2fa_recovery_user" ON "two_factor_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_category_owner_name" ON "categories"("owner_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscription_expires" ON "subscriptions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_provider_ref_key" ON "payments"("provider_ref");

-- CreateIndex
CREATE INDEX "idx_payment_user_date" ON "payments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_shop_owner" ON "shops"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_shop_staff_user" ON "shop_staffs"("user_id", "removed_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_shop_staff" ON "shop_staffs"("shop_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_permissions_shop_staff_id_key" ON "staff_permissions"("shop_staff_id");

-- CreateIndex
CREATE INDEX "idx_product_owner_deleted" ON "products"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "idx_product_owner_name" ON "products"("owner_id", "name");

-- CreateIndex
CREATE INDEX "idx_product_category" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "idx_shop_product_shop_status" ON "shop_products"("shop_id", "status");

-- CreateIndex
CREATE INDEX "idx_shop_product_product" ON "shop_products"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_shop_product" ON "shop_products"("shop_id", "product_id");

-- CreateIndex
CREATE INDEX "idx_notification_unread" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "idx_chat_scope_date" ON "chat_messages"("shop_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_ai_reco_shop_date" ON "ai_recommendations"("shop_id", "generated_at");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_shopProductId_fkey" FOREIGN KEY ("shopProductId") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_pending_action_id_fkey" FOREIGN KEY ("pending_action_id") REFERENCES "PendingAction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_shopProductId_fkey" FOREIGN KEY ("shopProductId") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingAction" ADD CONSTRAINT "PendingAction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_shopProductId_fkey" FOREIGN KEY ("shopProductId") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "two_factor_recovery_codes" ADD CONSTRAINT "two_factor_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shops" ADD CONSTRAINT "shops_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_staffs" ADD CONSTRAINT "shop_staffs_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_staffs" ADD CONSTRAINT "shop_staffs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_shop_staff_id_fkey" FOREIGN KEY ("shop_staff_id") REFERENCES "shop_staffs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_permissions" ADD CONSTRAINT "staff_permissions_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
