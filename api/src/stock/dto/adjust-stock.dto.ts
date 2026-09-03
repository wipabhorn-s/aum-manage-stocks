import { z } from 'zod';

export const adjustStockSchema = z.object({
  shopProductId: z.string().uuid(),
  operation: z.enum(['INCREASE', 'DECREASE']),
  quantity: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional(),
  /**
   * ทุนต่อชิ้นของล็อตที่รับเข้ารอบนี้ — ใช้กับ INCREASE เท่านั้น
   *
   * ไม่บังคับกรอกโดยตั้งใจ ถ้าไม่ส่งมาจะใช้ cost_price ปัจจุบันของสินค้า
   * ทำให้ทุกที่ที่เรียก endpoint นี้อยู่แล้ว (แชทบอท LINE สแกนรับของ)
   * ทำงานเหมือนเดิมทุกอย่างโดยไม่ต้องแก้อะไร
   *
   * เงื่อนไขเดียวกับ money ใน shop-product.dto.ts — ทศนิยมไม่เกิน 2 ตำแหน่ง
   */
  unitCost: z.coerce
    .number()
    .min(0, 'ทุนต้องไม่ติดลบ')
    .max(99_999_999.99, 'ทุนเกินขีดจำกัด')
    .refine(
      (value) => Number.isInteger(Math.round(value * 100)),
      'ทุนรองรับทศนิยมไม่เกิน 2 ตำแหน่ง',
    )
    .optional(),
});

export type AdjustStockDto = z.infer<typeof adjustStockSchema>;
