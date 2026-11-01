-- ส่วนต่างที่เกิดขึ้นหลังสร้าง baseline (commit ba0d029) จนถึง schema ปัจจุบัน
--
-- baseline ถอดมาจาก schema ตอนที่มี 23 model ตอนนี้เป็น 25 แล้ว — สองตัวที่เพิ่ม
-- เข้ามาคือ StockLot (ต้นทุนแยกตามล็อต) และ ChatShopPrompt (ร้านที่ค้างไว้ใน LINE)
-- ถ้าไม่มีไฟล์นี้ `prisma migrate deploy` จะสร้าง database ที่ขาดสองตารางนั้น
-- โดยไม่ error อะไรเลย แล้วไปพังตอน query จริง
--
-- สร้างด้วย:
--   prisma migrate diff --from-schema <schema ณ ba0d029> --to-schema prisma/schema.prisma --script

-- AlterEnum
-- PostgreSQL 12+ รัน ADD VALUE ในทรานแซกชันได้ ตราบใดที่ไม่เอาค่าใหม่ไปใช้
-- ในทรานแซกชันเดียวกัน — ไฟล์นี้แค่เพิ่มค่า ไม่ได้ใช้ จึงปลอดภัย
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" UUID NOT NULL,
    "shop_product_id" UUID NOT NULL,
    "unit_cost" DECIMAL(12,2) NOT NULL,
    "qty_received" INTEGER NOT NULL,
    "qty_remaining" INTEGER NOT NULL,
    "note" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_shop_prompts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "original_message" TEXT NOT NULL,
    "selected_shop_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_shop_prompts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_stock_lot_fifo" ON "stock_lots"("shop_product_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_shop_prompts_user_id_key" ON "chat_shop_prompts"("user_id");

-- AddForeignKey
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_shop_product_id_fkey" FOREIGN KEY ("shop_product_id") REFERENCES "shop_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_shop_prompts" ADD CONSTRAINT "chat_shop_prompts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_shop_prompts" ADD CONSTRAINT "chat_shop_prompts_selected_shop_id_fkey" FOREIGN KEY ("selected_shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
