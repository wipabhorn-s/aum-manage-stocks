import { z } from 'zod';

export const createChatCommandSchema = z.object({
  message: z.string().trim().min(1).max(1000),
});

export const updatePendingActionSchema = z
  .object({
    shopProductId: z.string().uuid().optional(),
    productQuery: z.string().trim().min(1).max(255).optional(),
    operation: z.enum(['INCREASE', 'DECREASE']).optional(),
    quantity: z.coerce.number().int().positive().optional(),
    // [อั้ม] ร้านปลายทางที่ผู้ใช้เลือกทีหลัง สำหรับคำสั่งย้ายที่ยังไม่ได้ระบุปลายทาง
    destinationShopId: z.string().uuid().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'At least one field is required',
  );

export type CreateChatCommandDto = z.infer<typeof createChatCommandSchema>;
export type UpdatePendingActionDto = z.infer<typeof updatePendingActionSchema>;
