import { BadRequestException } from '@nestjs/common';
import { DeterministicStockCommandParser } from './deterministic-stock-command.parser';

describe('DeterministicStockCommandParser', () => {
  const parser = new DeterministicStockCommandParser();

  it('parses a Thai increase command', async () => {
    await expect(parser.parse('เพิ่มโค้ก 20 ขวด')).resolves.toEqual({
      intent: 'ADJUST_STOCK',
      operation: 'INCREASE',
      productQuery: 'โค้ก',
      quantity: 20,
    });
  });

  it('parses a Thai decrease command', async () => {
    await expect(parser.parse('ลด น้ำเปล่า 3 ขวด')).resolves.toMatchObject({
      operation: 'DECREASE',
      productQuery: 'น้ำเปล่า',
      quantity: 3,
    });
  });

  it('rejects an ambiguous command', () => {
    expect(() => parser.parse('ช่วยจัดการโค้กให้หน่อย')).toThrow(
      BadRequestException,
    );
  });

  // [อั้ม] ถามยอดคงเหลือ — productQuery ว่าง = ถามทั้งร้าน
  describe('ถามยอดคงเหลือทั้งร้าน', () => {
    it.each(['สินค้าคงเหลือ', 'ของเหลือ', 'เช็คสต็อก', 'ดูสินค้าคงเหลือ'])(
      '%s',
      async (message) => {
        await expect(parser.parse(message)).resolves.toEqual({
          intent: 'QUERY_STOCK',
          productQuery: '',
        });
      },
    );
  });

  describe('ถามยอดคงเหลือเจาะจงสินค้า', () => {
    it.each([
      ['โค้กเหลือเท่าไหร่', 'โค้ก'],
      ['โค้ก เหลือ', 'โค้ก'],
      ['น้ำแร่คงเหลือ', 'น้ำแร่'],
      ['เช็คโค้กซีโร่เหลือเท่าไร', 'โค้กซีโร่'],
    ])('%s', async (message, productQuery) => {
      await expect(parser.parse(message)).resolves.toEqual({
        intent: 'QUERY_STOCK',
        productQuery,
      });
    });
  });

  /**
   * เส้นแบ่งที่สำคัญที่สุด — คำสั่งปรับสต็อกมีตัวเลขต่อท้ายเสมอ ส่วนคำถามไม่มี
   * ถ้าจับสับกันเมื่อไหร่ ผู้ใช้จะสั่งเพิ่มของแล้วได้คำตอบเป็นยอดคงเหลือแทน
   */
  it('คำสั่งที่มีจำนวน ต้องไม่ถูกตีเป็นคำถาม', async () => {
    await expect(parser.parse('เพิ่มโค้ก 10')).resolves.toMatchObject({
      intent: 'ADJUST_STOCK',
    });
    await expect(parser.parse('ลดน้ำแร่ 3')).resolves.toMatchObject({
      intent: 'ADJUST_STOCK',
    });
  });
});

/**
 * [อั้ม] เส้นแบ่งที่แพงที่สุดในระบบ — สามคำนี้หน้าตาคล้ายกันแต่ผลลัพธ์คนละโลก
 *
 *   ลด  → ของหายไปเฉย ๆ ไม่มีเงินเกี่ยวข้อง (ของเสีย นับสต็อกใหม่)
 *   ขาย → ตัดสต็อก + ออกบิล + มีรายได้
 *   ย้าย → ของไม่ได้หายไปไหน แค่ไปอยู่อีกร้าน
 *
 * จับสลับกันเมื่อไหร่ = ตัดของเสียแล้วได้รายได้ผี หรือขายแล้วรายได้หาย
 */
describe('แยก ลด / ขาย / ย้าย ออกจากกัน', () => {
  const parser = new DeterministicStockCommandParser();

  it('"ลด" ต้องเป็นการปรับสต็อกเสมอ ห้ามกลายเป็นการขาย', async () => {
    await expect(parser.parse('ลดโค้ก 5')).resolves.toEqual({
      intent: 'ADJUST_STOCK',
      operation: 'DECREASE',
      productQuery: 'โค้ก',
      quantity: 5,
    });
    await expect(parser.parse('เอาออก น้ำแร่ 3 ขวด')).resolves.toMatchObject({
      intent: 'ADJUST_STOCK',
      operation: 'DECREASE',
    });
  });

  describe('ขาย', () => {
    it.each([
      ['ขายโค้ก 2', 'โค้ก', 2],
      ['ขาย โค้ก 2 ขวด', 'โค้ก', 2],
      ['ขายน้ำแร่ 12 ขวด', 'น้ำแร่', 12],
    ])('%s', async (message, productQuery, quantity) => {
      await expect(parser.parse(message)).resolves.toEqual({
        intent: 'SELL',
        productQuery,
        quantity,
      });
    });
  });

  describe('ย้ายไปร้านอื่น', () => {
    it.each([
      ['ย้ายโค้ก 10 ไปร้าน the aum', 'โค้ก', 10, 'the aum'],
      ['ย้ายโค้ก 10 ขวด ไปร้าน the aum', 'โค้ก', 10, 'the aum'],
      ['โอนน้ำแร่ 5 ไป the aum', 'น้ำแร่', 5, 'the aum'],
      ['ย้ายโค้ก 3 ไปที่ร้านทดสอบ', 'โค้ก', 3, 'ทดสอบ'],
    ])('%s', async (message, productQuery, quantity, destinationShopQuery) => {
      await expect(parser.parse(message)).resolves.toEqual({
        intent: 'TRANSFER_STOCK',
        productQuery,
        quantity,
        destinationShopQuery,
      });
    });

    it('ไม่ระบุร้านปลายทาง — ยังเป็นคำสั่งย้าย แล้วค่อยไปถามทีหลัง', async () => {
      await expect(parser.parse('ย้ายโค้ก 10')).resolves.toEqual({
        intent: 'TRANSFER_STOCK',
        productQuery: 'โค้ก',
        quantity: 10,
      });
      await expect(parser.parse('ย้ายน้ำแร่ 5 ขวด')).resolves.toEqual({
        intent: 'TRANSFER_STOCK',
        productQuery: 'น้ำแร่',
        quantity: 5,
      });
    });

    /**
     * รูปแบบมีปลายทางต้องถูกลองก่อนเสมอ ถ้าลำดับสลับ รูปแบบสั้นจะกลืน
     * "ไปร้าน the aum" เข้าไปเป็นชื่อสินค้า แล้วหาสินค้าไม่เจอ
     */
    it('ระบุปลายทาง ต้องไม่ถูกรูปแบบสั้นกลืนไปเป็นชื่อสินค้า', async () => {
      await expect(
        parser.parse('ย้ายโค้ก 10 ไปร้าน the aum'),
      ).resolves.toMatchObject({
        productQuery: 'โค้ก',
        destinationShopQuery: 'the aum',
      });
    });
  });
});
