import { BadRequestException, Injectable } from '@nestjs/common';
import { ParsedStockCommand, StockCommandParser } from './stock-command-parser';

@Injectable()
export class DeterministicStockCommandParser implements StockCommandParser {
  parse(message: string): Promise<ParsedStockCommand> {
    const normalized = message.trim().replace(/\s+/g, ' ');

    // ต้องลองคำถามก่อนคำสั่งปรับสต็อก ไม่งั้น "โค้กเหลือเท่าไหร่" จะไปเข้า
    // เส้นทางปรับสต็อกแล้วพังด้วยข้อความที่ไม่เกี่ยวกับสิ่งที่ผู้ใช้ถาม
    const query = this.parseQuery(normalized);
    if (query) return Promise.resolve(query);

    /**
     * [อั้ม] ย้ายก่อนขาย ก่อนปรับสต็อก — สามคำสั่งนี้ขึ้นต้นด้วยคำต่างกันชัดเจน
     * จึงชนกันไม่ได้ แต่เรียงไว้ให้ตายตัวเพื่อไม่ให้ใครมาสลับทีหลังแล้วผลเปลี่ยน
     */
    const transfer = this.parseTransfer(normalized);
    if (transfer) return Promise.resolve(transfer);

    const sell = this.parseSell(normalized);
    if (sell) return Promise.resolve(sell);

    const match = /^(เพิ่ม|เติม|ลด|เอาออก)\s*(.+?)\s+(\d+)(?:\s*\S+)?$/u.exec(
      normalized,
    );
    if (!match) {
      throw new BadRequestException(
        'Unsupported stock command. Example: เพิ่มโค้ก 20 ขวด',
      );
    }
    const quantity = this.parseQuantity(match[3]);
    return Promise.resolve({
      intent: 'ADJUST_STOCK',
      operation:
        match[1] === 'ลด' || match[1] === 'เอาออก' ? 'DECREASE' : 'INCREASE',
      productQuery: match[2].trim(),
      quantity,
    });
  }

  /**
   * [อั้ม] ขาย — ตัดสต็อกพร้อมคิดเงิน
   *
   * **ห้ามรวมคำว่า "ลด" หรือ "เอาออก" เข้ามาในกลุ่มนี้เด็ดขาด** สองคำนั้นคือของ
   * หายไปเฉย ๆ (ของเสีย นับสต็อกใหม่) ไม่ใช่การขาย ถ้าจับรวมกันเมื่อไหร่ ผู้ใช้
   * สั่งตัดของเสียแล้วจะได้บิลขายพร้อมรายได้ที่ไม่เคยเกิดขึ้นจริง
   */
  private parseSell(normalized: string): ParsedStockCommand | null {
    const match = /^(?:ขาย|sell)\s*(.+?)\s+(\d+)(?:\s*\S+)?$/iu.exec(
      normalized,
    );
    if (!match) return null;

    return {
      intent: 'SELL',
      productQuery: match[1].trim(),
      quantity: this.parseQuantity(match[2]),
    };
  }

  /**
   * [อั้ม] ย้ายไปร้านอื่น — "ย้ายโค้ก 10 ไปร้าน the aum"
   *
   * หน่วยนับ (ขวด/ชิ้น) เป็น optional และต้อง lazy เพราะคำว่า "ไป" ที่ตามมา
   * ก็เป็น \S+ เหมือนกัน ถ้าใช้ greedy มันจะกลืนคำว่า "ไปร้าน" ไปเป็นหน่วยนับ
   * แล้วชื่อร้านปลายทางจะเพี้ยน
   */
  private parseTransfer(normalized: string): ParsedStockCommand | null {
    const match =
      /^(?:ย้าย|โอน|transfer)\s*(.+?)\s+(\d+)\s*(\S*?)\s*ไป(?:ที่|ยัง)?\s*(?:ร้าน)?\s*(.+)$/iu.exec(
        normalized,
      );

    if (!match) {
      /**
       * ไม่ระบุปลายทาง — "ย้ายโค้ก 20" เฉย ๆ ระบบจะถามต่อว่าไปร้านไหน
       *
       * ต้องลองแบบมีปลายทางก่อนเสมอ ไม่งั้นรูปแบบสั้นนี้จะกลืน "ไปร้าน the aum"
       * เข้าไปเป็นส่วนหนึ่งของชื่อสินค้า แล้วหาสินค้าไม่เจอ
       */
      const withoutDestination =
        /^(?:ย้าย|โอน|transfer)\s*(.+?)\s+(\d+)(?:\s*\S+)?$/iu.exec(normalized);
      if (!withoutDestination) return null;

      return {
        intent: 'TRANSFER_STOCK',
        productQuery: withoutDestination[1].trim(),
        quantity: this.parseQuantity(withoutDestination[2]),
      };
    }

    return {
      intent: 'TRANSFER_STOCK',
      productQuery: match[1].trim(),
      quantity: this.parseQuantity(match[2]),
      destinationShopQuery: match[4].trim(),
    };
  }

  private parseQuantity(raw: string): number {
    const quantity = Number(raw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('Quantity must be a positive integer');
    }
    return quantity;
  }

  /**
   * [อั้ม] จับคำถามยอดคงเหลือ คืน null เมื่อไม่เข้าข่าย ให้ไปลองเส้นทางปรับสต็อกต่อ
   *
   * ตัวนี้เป็นแค่ทางลัดสำหรับรูปประโยคที่พบบ่อย — รูปที่แปลกกว่านี้ปล่อยให้ LLM
   * รับไป (FallbackStockCommandParser ลอง LLM ก่อนเสมอเมื่อตั้ง env ไว้)
   */
  private parseQuery(normalized: string): ParsedStockCommand | null {
    // ถามทั้งร้านแบบไม่มีคำว่า "เหลือ" — "เช็คสต็อก" / "ดูสินค้า"
    if (
      /^(?:ดู|เช็ค|ขอดู|ขอ)\s*(?:สินค้า|ของ|สต็อก|stock)\s*[?？]?$/iu.test(
        normalized,
      )
    ) {
      return { intent: 'QUERY_STOCK', productQuery: '' };
    }

    // ถามทั้งร้าน — ในประโยคไม่มีชื่อสินค้า
    if (
      /^(?:ดู|เช็ค|ขอดู|ขอ)?\s*(?:สินค้า|ของ|สต็อก|stock)?\s*(?:คงเหลือ|เหลือ|ทั้งหมด)\s*(?:เท่าไหร่|เท่าไร|กี่ชิ้น)?[?？]?$/iu.test(
        normalized,
      )
    ) {
      return { intent: 'QUERY_STOCK', productQuery: '' };
    }

    // ถามเจาะจง — "<ชื่อสินค้า> เหลือเท่าไหร่" / "<ชื่อสินค้า> คงเหลือ"
    const specific =
      /^(?:ดู|เช็ค|ขอดู|ขอ)?\s*(.+?)\s*(?:ยัง)?(?:คง)?เหลือ\s*(?:อยู่)?\s*(?:เท่าไหร่|เท่าไร|กี่\S*)?[?？]?$/u.exec(
        normalized,
      );

    if (specific) {
      const productQuery = specific[1].trim();
      // กันคำว่า "สินค้า"/"ของ" ล้วน ๆ ไม่ให้ถูกตีความเป็นชื่อสินค้า
      if (
        productQuery &&
        !/^(?:สินค้า|ของ|สต็อก|stock)$/iu.test(productQuery)
      ) {
        return { intent: 'QUERY_STOCK', productQuery };
      }
    }

    return null;
  }
}
