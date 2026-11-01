-- =====================================================================
-- บัญชีทดสอบครบทุก role — สำหรับ dev/staging เท่านั้น
--
-- ⚠️ ห้ามย้ายไฟล์นี้ไป prisma/sql/ — SqlScriptsRunner รันทุกไฟล์ในโฟลเดอร์นั้น
--    ให้อัตโนมัติตอนแอปบูต ซึ่งจะแปลว่ามีบัญชีรหัสผ่านสาธารณะโผล่ใน production
--
-- รหัสผ่านทุกบัญชี: Test1234!   (bcrypt cost 12 ตรงกับ BcryptService)
--
-- รันได้ 2 ทาง:
--   1) Railway -> service Postgres -> Console -> วางทั้งไฟล์
--   2) pnpm prisma db execute --file scripts/seed-test-users.sql --schema prisma/schema.prisma
--
-- รันซ้ำได้ไม่พัง — ใช้ UUID คงที่ + ON CONFLICT (id) DO NOTHING
-- ต้องมีแถว FREE ใน subscription_plans ก่อน (migration seed ให้แล้ว)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ผู้ใช้ 4 บัญชี ครบทุก role
-- ---------------------------------------------------------------------
-- email_verified_at ต้องมีค่า ไม่งั้น auth.service.ts:99 บล็อกการล็อกอินด้วยรหัสผ่าน
INSERT INTO users
  (id, first_name, last_name, email, email_verified_at, username, password,
   owner_id, role, status, created_at, updated_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'เจ้าของร้าน', 'ทดสอบ',
   'owner@test.local',  now(), 'test_owner',
   '$2b$12$XRDBHYtCQ/By90CjA9iXyuntAVrpRAqLtIxpFmrnF/YieK02aq1Aq',
   NULL, 'SHOP_OWNER', 'ACTIVE', now(), now()),

  -- พนักงานต้องมี owner_id ชี้ไปที่เจ้าของ — @OwnerId() resolve จากคอลัมน์นี้
  ('00000000-0000-4000-8000-000000000002', 'พนักงาน', 'ทดสอบ',
   'staff@test.local',  now(), 'test_staff',
   '$2b$12$XRDBHYtCQ/By90CjA9iXyuntAVrpRAqLtIxpFmrnF/YieK02aq1Aq',
   '00000000-0000-4000-8000-000000000001', 'SHOP_STAFF', 'ACTIVE', now(), now()),

  -- admin ไม่มีร้านเป็นของตัวเอง เรียก endpoint ปกติจะโดน 403 ต้องใช้ /admin/*
  ('00000000-0000-4000-8000-000000000003', 'แอดมิน', 'ทดสอบ',
   'admin@test.local',  now(), 'test_admin',
   '$2b$12$XRDBHYtCQ/By90CjA9iXyuntAVrpRAqLtIxpFmrnF/YieK02aq1Aq',
   NULL, 'ADMIN', 'ACTIVE', now(), now()),

  ('00000000-0000-4000-8000-000000000004', 'ซูเปอร์แอดมิน', 'ทดสอบ',
   'superadmin@test.local', now(), 'test_superadmin',
   '$2b$12$XRDBHYtCQ/By90CjA9iXyuntAVrpRAqLtIxpFmrnF/YieK02aq1Aq',
   NULL, 'SUPER_ADMIN', 'ACTIVE', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. subscription ของเจ้าของร้าน (Free — expires_at NULL = ไม่มีวันหมดอายุ)
-- ---------------------------------------------------------------------
-- ไม่มีแถวนี้ = ทุก endpoint ที่เช็คโควตา/แพ็กเกจจะพัง
INSERT INTO subscriptions (id, user_id, plan_id, status, started_at, expires_at, created_at, updated_at)
SELECT '00000000-0000-4000-8000-000000000021',
       '00000000-0000-4000-8000-000000000001',
       p.id, 'ACTIVE', now(), NULL, now(), now()
FROM subscription_plans p
WHERE p.code = 'FREE'
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. ร้านของเจ้าของร้าน
-- ---------------------------------------------------------------------
INSERT INTO shops (id, owner_id, name, description, status, created_at, updated_at)
VALUES ('00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000001',
        'ร้านทดสอบ', 'ร้านสำหรับทดสอบระบบ', 'ACTIVE', now(), now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. ผูกพนักงานเข้ากับร้าน + ให้สิทธิ์ครบทุกข้อ
-- ---------------------------------------------------------------------
-- ต้องมีทั้งสองตาราง: ไม่มี shop_staffs = พนักงานไม่เห็นร้าน,
-- ไม่มี staff_permissions = เห็นร้านแต่กดอะไรไม่ได้เลย (default เป็น false หมด)
INSERT INTO shop_staffs (id, shop_id, user_id, assigned_at, removed_at)
VALUES ('00000000-0000-4000-8000-000000000031',
        '00000000-0000-4000-8000-000000000011',
        '00000000-0000-4000-8000-000000000002', now(), NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff_permissions
  (id, shop_staff_id, can_manage_product, can_adjust_stock_manual, can_use_chatbot,
   can_scan_sale, can_view_dashboard, can_view_ai_insight, granted_by, updated_at)
VALUES ('00000000-0000-4000-8000-000000000041',
        '00000000-0000-4000-8000-000000000031',
        true, true, true, true, true, true,
        '00000000-0000-4000-8000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. ปิดบัญชีทดสอบ — รันทันทีหลังเดโมบน production จบ
-- ---------------------------------------------------------------------
-- repo นี้เป็น public ใครก็อ่านรหัสผ่านด้านบนได้ ถ้า seed ค้างอยู่บนฐานข้อมูล
-- จริง = เปิดทางให้คนนอกล็อกอินเป็น SUPER_ADMIN
--
-- ใช้ UPDATE ไม่ใช่ DELETE เพราะ stock_movements / sales อ้างถึง users แบบ
-- onDelete: Restrict — พอบัญชีทดสอบขยับสต็อกหรือขายของไปแล้วจะลบไม่ได้
-- ตั้ง password = NULL (ล็อกอินด้วยรหัสผ่านไม่ได้) + SUSPENDED (AuthGuard ตอบ 403
-- ทันทีแม้จะมี token เก่าอยู่ในมือ) ครอบทั้งสองชั้น
--
-- UPDATE users
-- SET password = NULL, status = 'SUSPENDED', updated_at = now()
-- WHERE email LIKE '%@test.local';

-- ---------------------------------------------------------------------
-- 6. ตรวจผล
-- ---------------------------------------------------------------------
SELECT u.role, u.email, u.username,
       (u.email_verified_at IS NOT NULL) AS verified,
       s.name    AS shop,
       p.code    AS plan
FROM users u
LEFT JOIN shops s              ON s.owner_id = u.id
LEFT JOIN subscriptions sub    ON sub.user_id = u.id
LEFT JOIN subscription_plans p ON p.id = sub.plan_id
WHERE u.email LIKE '%@test.local'
ORDER BY u.role;
