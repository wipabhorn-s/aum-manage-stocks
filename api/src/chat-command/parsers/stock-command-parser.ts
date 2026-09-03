export const STOCK_COMMAND_PARSER = Symbol('STOCK_COMMAND_PARSER');

/** สั่งปรับสต็อก — ต้องให้ผู้ใช้ยืนยันก่อนบันทึกเสมอ */
export interface ParsedStockAdjustCommand {
  intent: 'ADJUST_STOCK';
  operation: 'INCREASE' | 'DECREASE';
  productQuery: string;
  quantity: number;
}

/**
 * [อั้ม] ถามยอดคงเหลือ — อ่านอย่างเดียว ไม่ต้องสร้าง PendingAction และไม่ต้องยืนยัน
 *
 * productQuery ว่าง = ถามทั้งร้าน ("สินค้าคงเหลือ")
 * productQuery มีค่า = ถามเจาะจง ("โค้กเหลือเท่าไหร่")
 */
export interface ParsedStockQueryCommand {
  intent: 'QUERY_STOCK';
  productQuery: string;
}

/**
 * [อั้ม] ขายผ่านแชท — ตัดสต็อกพร้อมคิดเงิน ต้องยืนยันก่อนเสมอเพราะมีเงินเกี่ยวข้อง
 *
 * **แยกจาก ADJUST_STOCK + DECREASE โดยเด็ดขาด** — "ลดโค้ก 5" คือของหายไปเฉย ๆ
 * (ของเสีย นับสต็อกใหม่) ส่วน "ขายโค้ก 5" ต้องมีบิลและยอดเงิน ถ้าสองอย่างนี้จับ
 * สลับกันเมื่อไหร่ ผู้ใช้จะสั่งลดของแล้วโดนคิดเงิน หรือขายของแล้วรายได้หาย
 *
 * ไม่มีฟิลด์ราคา — ราคามาจาก shop_products.sellPrice ตอนยืนยันเสมอ ตัวเดียวกับ
 * ที่หน้าขายใช้ ผู้ใช้ระบุราคาเองผ่านแชทไม่ได้
 */
export interface ParsedSellCommand {
  intent: 'SELL';
  productQuery: string;
  quantity: number;
}

/** [อั้ม] ย้ายของไปร้านอื่นของเจ้าของคนเดียวกัน */
export interface ParsedTransferCommand {
  intent: 'TRANSFER_STOCK';
  productQuery: string;
  quantity: number;
  /**
   * ชื่อร้านปลายทางตามที่ผู้ใช้พิมพ์ — ยังไม่ได้แปลงเป็น id
   *
   * **ไม่ระบุก็ได้** ("ย้ายโค้ก 20" เฉย ๆ) แล้วระบบจะถามต่อว่าจะย้ายไปร้านไหน
   * พร้อมรายการให้เลือก การบังคับให้พิมพ์ชื่อร้านเองแปลว่าผู้ใช้ต้องจำชื่อร้าน
   * ให้ตรงเป๊ะ ซึ่งใช้ยากเกินไปเมื่อมีหลายสาขา
   */
  destinationShopQuery?: string;
}

export type ParsedStockCommand =
  | ParsedStockAdjustCommand
  | ParsedStockQueryCommand
  | ParsedSellCommand
  | ParsedTransferCommand;

export interface StockCommandParser {
  parse(message: string): Promise<ParsedStockCommand>;
}
