-- Seed แพ็กเกจ 3 ระดับตาม SRS §57-59 (ดูตารางใน AGENTS.md)
--
-- คัดลอกมาจาก prisma/sql/003 แบบคำต่อคำ — ตาราง subscription_plans เป็น
-- lookup table ที่ระบบขาดไม่ได้: ถ้าไม่มีแถว FREE การสมัครสมาชิกใหม่จะพังทั้งหมด
-- เพราะหาแพ็กเกจตั้งต้นไม่เจอ จึงต้อง seed มาพร้อม schema ตั้งแต่ migration
--
-- idempotent — ON CONFLICT DO UPDATE ทำให้รันซ้ำได้ และบังคับค่าให้ตรง SRS เสมอ
-- (SubscriptionPlanSeeder ตอนบูตเติมเฉพาะแพ็กเกจที่ขาด ไม่ทับค่าที่มีอยู่)
--
-- duration_months NULL = ไม่มีวันหมดอายุ (Free Plan เท่านั้น)
--
-- ประตูฟีเจอร์ระดับแพ็กเกจ (SRS §116/§171/§179/§193):
--   chatbot_enabled            = AI Chat            -> Plus + Pro
--   barcode_enabled            = ตัดสต็อกบาร์โค้ด     -> Plus + Pro
--   ai_recommendation_enabled  = AI Recommendations -> Pro เท่านั้น
INSERT INTO subscription_plans
  (id, code, name_th, price_thb, duration_months,
   included_shop_quota, included_staff_quota, max_active_products,
   chatbot_enabled, barcode_enabled, ai_recommendation_enabled,
   is_free, is_active)
VALUES
  (gen_random_uuid(), 'FREE', 'ฟรี',      0.00, NULL, 1, 0,  100, false, false, false, true,  true),
  (gen_random_uuid(), 'PLUS', 'พลัส',  2499.00,   12, 3, 6, 3000, true,  true,  false, false, true),
  (gen_random_uuid(), 'PRO',  'โปร',   3499.00,   12, 5, 10, 5000, true,  true,  true,  false, true)
ON CONFLICT (code) DO UPDATE SET
  name_th                   = EXCLUDED.name_th,
  price_thb                 = EXCLUDED.price_thb,
  duration_months           = EXCLUDED.duration_months,
  included_shop_quota       = EXCLUDED.included_shop_quota,
  included_staff_quota      = EXCLUDED.included_staff_quota,
  max_active_products       = EXCLUDED.max_active_products,
  chatbot_enabled           = EXCLUDED.chatbot_enabled,
  barcode_enabled           = EXCLUDED.barcode_enabled,
  ai_recommendation_enabled = EXCLUDED.ai_recommendation_enabled,
  is_free                   = EXCLUDED.is_free,
  is_active                 = EXCLUDED.is_active;
