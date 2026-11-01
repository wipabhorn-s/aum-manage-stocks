-- คำสั่ง "ขาย" และ "ย้ายไปร้านอื่น" ผ่านแชทบอท (feature/chatbot-resource)
--
-- ส่วนที่หลุดจาก migration 20260903000000 และ 20260903100000 — ตอนสร้างสองตัวนั้น
-- ผมตรวจแค่ว่า "ทุก model มี CREATE TABLE ครบไหม" ซึ่งมองไม่เห็นคอลัมน์กับค่า enum
-- ที่เพิ่มเข้ามาในตารางเดิม จึงขาดไป 4 อย่างนี้ ผลคือ PendingAction.create() พังด้วย
-- P2022 (column does not exist) ทุกครั้งที่มีคนสั่งงานแชทบอทบน production
--
-- ⚠️ ทุกคำสั่งเขียนแบบรันซ้ำได้โดยตั้งใจ
--
-- ฐานข้อมูล production เคยถูก `prisma db push` ยิงใส่ตรง ๆ มาก่อน (api/.env ชี้ไป
-- Railway อยู่ช่วงหนึ่ง) จึงไม่มีทางรู้แน่ว่าค่า enum สองตัวล่างเข้าไปอยู่แล้วหรือยัง
-- ถ้าเขียนแบบธรรมดาแล้วมันมีอยู่แล้ว migrate deploy จะล้มด้วย P3018 แล้วบล็อก
-- migration ตัวถัด ๆ ไปทั้งหมด — เคยเกิดมาแล้วสองรอบกับ CANCELLED และ unit_cost

-- AlterEnum
ALTER TYPE "PendingActionIntent" ADD VALUE IF NOT EXISTS 'SELL';
ALTER TYPE "PendingActionIntent" ADD VALUE IF NOT EXISTS 'TRANSFER_STOCK';

-- AlterTable
ALTER TABLE "PendingAction" ADD COLUMN IF NOT EXISTS "destination_shop_id" UUID;

-- AddForeignKey
-- Postgres ไม่มี ADD CONSTRAINT IF NOT EXISTS จึงต้องเช็คจาก pg_constraint เอง
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PendingAction_destination_shop_id_fkey'
  ) THEN
    ALTER TABLE "PendingAction"
      ADD CONSTRAINT "PendingAction_destination_shop_id_fkey"
      FOREIGN KEY ("destination_shop_id") REFERENCES "shops"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
