-- ทุนต่อชิ้นของการเคลื่อนไหวสต็อกแต่ละครั้ง (feature/stock-lots)
--
-- nullable โดยตั้งใจ — แถวที่เกิดก่อนระบบล็อตไม่มีทุนให้บันทึก หน้าเว็บต้อง
-- แสดงเป็น "—" ไม่ใช่ ฿0.00 เพราะ "ไม่มีข้อมูล" กับ "ทุนเป็นศูนย์" คนละเรื่องกัน
-- จึงไม่ backfill ค่าใดๆ ให้แถวเดิม
--
-- สร้างด้วย:
--   prisma migrate diff --from-schema <schema ณ f6cc3b6> --to-schema prisma/schema.prisma --script

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "unit_cost" DECIMAL(12,2);
