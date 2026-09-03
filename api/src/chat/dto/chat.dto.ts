import { z } from 'zod';

export const SendChatMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'กรุณาพิมพ์ข้อความ')
    .max(1000, 'ข้อความยาวเกินไป'),
});

export type SendChatMessageDto = z.infer<typeof SendChatMessageSchema>;

/**
 * เลือกสินค้าตอนชื่อกำกวม — ใช้ PATCH บน path เดิม (chat/messages) แทนการเพิ่ม
 * path ใหม่ เพราะ allowlist ของ proxy ฝั่งเว็บ (backend-endpoints.ts) ครอบ
 * chat/messages ไว้อยู่แล้ว จะได้ไม่ต้องไปแก้ไฟล์กลางของแพรว
 */
/**
 * [อั้ม] ใช้ทั้งเลือกสินค้า (ชื่อกำกวม) และเลือกร้านปลายทาง (คำสั่งย้าย)
 *
 * ต้องส่งมาอย่างใดอย่างหนึ่ง ไม่ใช่ทั้งคู่และไม่ใช่ไม่ส่งเลย — สองอย่างนี้เป็นคนละ
 * ขั้นของรายการเดียวกัน ถ้าส่งมาพร้อมกันแปลว่าฝั่ง client เข้าใจสถานะผิด
 */
export const SelectChatProductSchema = z
  .object({
    pendingActionId: z.uuid(),
    shopProductId: z.uuid().optional(),
    destinationShopId: z.uuid().optional(),
  })
  .refine(
    (value) =>
      Boolean(value.shopProductId) !== Boolean(value.destinationShopId),
    'ต้องระบุ shopProductId หรือ destinationShopId อย่างใดอย่างหนึ่ง',
  );

export type SelectChatProductDto = z.infer<typeof SelectChatProductSchema>;

/**
 * ยืนยัน/ยกเลิกรายการที่ค้างอยู่ ผ่าน PUT บน path เดิม (chat/messages)
 *
 * ทำที่ ChatModule ไม่ใช่เรียก stock/chat-command ตรงๆ เพราะต้องบันทึกข้อความ
 * ตอบกลับของบอทลงประวัติแชทด้วย — ให้เหมือนฝั่ง LINE ที่ตอบทุกครั้ง
 *
 * รวมสองอย่างไว้ใน endpoint เดียวเพราะ DELETE ส่ง body ไม่ได้ (forwardAuthed
 * ตัด body ทิ้งสำหรับ GET/DELETE) จึงส่ง pendingActionId มากับ DELETE ไม่ได้
 */
export const ApplyChatCommandSchema = z.object({
  pendingActionId: z.uuid(),
  action: z.enum(['CONFIRM', 'CANCEL']),
});

export type ApplyChatCommandDto = z.infer<typeof ApplyChatCommandSchema>;

export const ListChatMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListChatMessagesQueryDto = z.infer<
  typeof ListChatMessagesQuerySchema
>;
