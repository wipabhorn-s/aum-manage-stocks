-- ดัชนีที่ Prisma schema เขียนเองไม่ได้ (partial index ต้องมี WHERE, และ
-- unique บน expression อย่าง lower(email) ก็เขียนใน schema ไม่ได้)
--
-- คัดลอกมาจาก prisma/sql/001 และ 004 แบบคำต่อคำ — `db push` ข้ามโฟลเดอร์
-- prisma/sql/ ทั้งหมด ทีมจึงเคยต้องรันเอง ย้ายมาไว้ที่นี่เพื่อให้
-- `prisma migrate deploy` สร้าง database ที่ถูกต้องครบถ้วนได้ในคำสั่งเดียว
--
-- ⚠️ SqlScriptsRunner ยังรันไฟล์ต้นทางใน prisma/sql/ ตอนบูตอยู่ (เป็นตาข่ายรอง
-- ให้เครื่อง dev ที่ใช้ db push) ทุกคำสั่งจึงต้องรันซ้ำได้ไม่พัง
-- **ถ้าแก้ไฟล์นี้ ต้องแก้ prisma/sql/001 และ 004 ให้ตรงกันด้วย**

-- ---------------------------------------------------------------------
-- products (จาก prisma/sql/001)
-- ---------------------------------------------------------------------

-- SRS: บาร์โค้ดห้ามซ้ำภายในคลังสินค้ากลางของเจ้าของร้านคนเดียวกัน
-- ต้องเป็น PARTIAL index มิฉะนั้นสินค้าที่ถูก soft delete ไปแล้ว
-- จะกันไม่ให้เพิ่มสินค้าบาร์โค้ดเดิมกลับเข้ามาได้ตลอดกาล
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_owner_barcode
  ON products (owner_id, barcode)
  WHERE deleted_at IS NULL AND barcode IS NOT NULL;

-- ช่วย query นับ active product quota (max_active_products) ให้เร็วขึ้น
CREATE INDEX IF NOT EXISTS ix_products_owner_active
  ON products (owner_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- users (จาก prisma/sql/004)
-- ---------------------------------------------------------------------

-- unique ธรรมดาที่ Prisma สร้างให้นับแถวที่ soft delete ไปแล้วด้วย ทำให้อีเมล
-- ที่เคยลบทิ้งถูกจองค้างไว้ตลอดกาล — ต้องเปลี่ยนเป็น partial unique แทน
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- แถวที่เขียนไว้ก่อนแก้อาจยังเป็นตัวพิมพ์ผสม (ฐานใหม่จะไม่มีผลอะไร)
UPDATE users SET email = lower(email) WHERE email <> lower(email);

DROP INDEX IF EXISTS uq_users_email_active;

-- เทียบอีเมลแบบไม่สนตัวพิมพ์ — โดเมนเมลไม่แยกตัวพิมพ์ และทุกเส้นทางอ่านใน
-- users.service.ts แปลงเป็นตัวพิมพ์เล็กก่อน query อยู่แล้ว แถวที่เก็บเป็น
-- Earthty@gmail.com จึงเรียกไม่เจอ = เช็คซ้ำผ่านเงียบๆ แล้วเจ้าของล็อกอินไม่ได้
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active
  ON users (lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_active
  ON users (username)
  WHERE deleted_at IS NULL AND username IS NOT NULL;
