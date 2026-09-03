import { Injectable } from '@nestjs/common';

import { Prisma } from '../database/generated/prisma/client';

export interface ReceiveLotInput {
  shopProductId: string;
  quantity: number;
  /** ทุนต่อชิ้นของล็อตนี้ — ไม่ส่งมา = ใช้ cost_price ปัจจุบันของสินค้า */
  unitCost?: number;
  note?: string;
}

export interface ReceiveLotResult {
  /**
   * ทุนต่อชิ้นที่ล็อตนี้ถูกเปิดด้วยจริง
   *
   * คืนออกไปเพราะผู้เรียกต้องเอาไปบันทึกลง `stock_movements.unit_cost` ต่อ
   * ถ้าปล่อยให้ผู้เรียกไปอ่าน `cost_price` มาเองอีกรอบ จะมีช่องให้ตัวเลขสองที่
   * ไม่ตรงกันเมื่อ `cost_price` ถูกแก้ระหว่างทาง
   */
  unitCost: Prisma.Decimal;
}

export interface ConsumeLotsInput {
  shopProductId: string;
  quantity: number;
}

export interface ConsumeLotsResult {
  /** ทุนเฉลี่ยถ่วงน้ำหนักของ "ของที่ตัดออกไปจริง" รอบนี้ */
  unitCost: Prisma.Decimal;
  /** ทุนรวมของรอบนี้ = unitCost × quantity (ปัดแล้ว) */
  totalCost: Prisma.Decimal;
  /** ตัดจากล็อตไหนไปเท่าไหร่บ้าง — ไว้ให้ผู้เรียกบันทึกต่อถ้าต้องการ */
  picked: { lotId: string; quantity: number; unitCost: Prisma.Decimal }[];
  /**
   * จำนวนที่ตัดโดยไม่มีล็อตรองรับ (ล็อตหมดแต่ stock_qty ยังเหลือ)
   * ปกติต้องเป็น 0 เสมอ ถ้าไม่ใช่แปลว่าข้อมูลเพี้ยน
   */
  quantityWithoutLot: number;
}

const ZERO = new Prisma.Decimal(0);

/**
 * [เซิ่น] ต้นทุนแยกตามล็อตที่รับเข้า — ตัดของเก่าก่อน (FIFO)
 *
 * ทำไมต้องมี: `shop_products.cost_price` เก็บได้ค่าเดียว พอรับของล็อตใหม่ที่
 * ทุนไม่เท่าเดิม ของเก่าที่ยังขายไม่หมดจะถูกตีเป็นราคาใหม่ไปด้วย กำไรของที่
 * ยังไม่ได้ขายจึงคลาดเคลื่อนทันที และไม่มีอะไรเตือนเลยเพราะตัวเลขยังดูปกติ
 *
 * รวม logic ไว้ที่ service เดียว ไม่กระจายไปตาม service ที่ตัดสต็อกเพราะ
 * ทางที่ทำให้สต็อกลดมีหลายทาง (ปรับมือ ขาย ย้ายร้าน แชทบอท LINE) ถ้าปล่อยให้
 * แต่ละที่คำนวณเอง จะมีสักที่ที่ลืมแน่นอน — บทเรียนเดียวกับตอนแจ้งเตือนของ
 * ใกล้หมดที่ตกหล่นไปเส้นทางหนึ่งโดยไม่มีใครรู้เป็นเดือน
 *
 * ทุกเมธอดรับ `tx` เข้ามา ไม่เปิดทรานแซกชันเอง — ผู้เรียกเป็นคนคุมขอบเขต
 * เพราะการตัดล็อตต้องอยู่ในทรานแซกชันเดียวกับการตัด stock_qty เสมอ
 */
@Injectable()
export class StockLotsService {
  /** รับของเข้า = เปิดล็อตใหม่หนึ่งใบ แล้วคืนทุนที่ใช้เปิดล็อตนั้น */
  async receive(
    tx: Prisma.TransactionClient,
    input: ReceiveLotInput,
  ): Promise<ReceiveLotResult> {
    const unitCost =
      input.unitCost === undefined
        ? await this.currentCostPrice(tx, input.shopProductId)
        : new Prisma.Decimal(input.unitCost);

    // หาทุนก่อนแล้วค่อยเช็คจำนวน เพื่อให้ค่าที่คืนออกไปเป็นความจริงเสมอ
    // ผู้เรียกจะได้ไม่ต้องตีความว่า "จำนวน 0 แล้วทุนที่คืนมาแปลว่าอะไร"
    if (input.quantity <= 0) return { unitCost };

    await tx.stockLot.create({
      data: {
        shopProductId: input.shopProductId,
        unitCost,
        qtyReceived: input.quantity,
        qtyRemaining: input.quantity,
        note: input.note,
      },
    });

    return { unitCost };
  }

  /**
   * ตัดของออกตามลำดับล็อตเก่าสุดก่อน แล้วคืนทุนของที่ตัดไปจริง
   *
   * ตัวเลข `unitCost` ที่คืนออกไปคือสิ่งที่ต้อง snapshot ลงบิลขาย ไม่ใช่
   * `shop_products.cost_price` — นั่นคือทั้งหมดที่ฟีเจอร์นี้มีไว้ทำ
   */
  async consume(
    tx: Prisma.TransactionClient,
    input: ConsumeLotsInput,
  ): Promise<ConsumeLotsResult> {
    if (input.quantity <= 0) {
      return {
        unitCost: ZERO,
        totalCost: ZERO,
        picked: [],
        quantityWithoutLot: 0,
      };
    }

    await this.ensureOpeningLot(tx, input.shopProductId);

    const lots = await tx.stockLot.findMany({
      where: { shopProductId: input.shopProductId, qtyRemaining: { gt: 0 } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, qtyRemaining: true, unitCost: true },
    });

    const picked: ConsumeLotsResult['picked'] = [];
    let outstanding = input.quantity;
    let totalCost = ZERO;

    for (const lot of lots) {
      if (outstanding <= 0) break;
      const take = Math.min(lot.qtyRemaining, outstanding);

      await tx.stockLot.update({
        where: { id: lot.id },
        data: { qtyRemaining: { decrement: take } },
      });

      picked.push({ lotId: lot.id, quantity: take, unitCost: lot.unitCost });
      totalCost = totalCost.add(lot.unitCost.mul(take));
      outstanding -= take;
    }

    /**
     * ล็อตหมดแต่ยังตัดไม่ครฺ — ข้อมูลไม่ตรงกันระหว่าง stock_qty กับล็อต
     * (เช่นมีคนไปแก้ stock_qty ตรงๆ ในฐานข้อมูล)
     *
     * เลือกใช้ cost_price ปัจจุบันเป็นค่าสำรองแทนการโยน error เพราะการขายของ
     * ไม่ควรล้มเพราะบัญชีต้นทุนไม่ตรง — ของออกจากร้านไปแล้วจริงๆ ต้องบันทึกให้ได้
     * ส่วนที่ตัวเลขทุนอาจไม่แม่น รายงานมี itemsWithoutCost คอยบอกอยู่แล้ว
     */
    if (outstanding > 0) {
      const fallback = await this.currentCostPrice(tx, input.shopProductId);
      totalCost = totalCost.add(fallback.mul(outstanding));
    }

    const unitCost = totalCost
      .div(input.quantity)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      unitCost,
      totalCost: totalCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      picked,
      quantityWithoutLot: outstanding,
    };
  }

  /**
   * สินค้าที่มีของอยู่ก่อนฟีเจอร์นี้จะยังไม่มีล็อตสักใบ — สร้างล็อตตั้งต้นให้
   * จาก stock_qty กับ cost_price ที่มีอยู่ ณ ตอนนั้น
   *
   * ทำแบบ lazy ตอนจะตัดของครั้งแรก ไม่ใช้สคริปต์ backfill เพราะสคริปต์ต้องรัน
   * ตอนไม่มีใครใช้งาน ซึ่งบังคับให้ต้องหยุดระบบ ส่วนวิธีนี้ทยอยสร้างเองทีละตัว
   * ในทรานแซกชันเดียวกับการตัด และสินค้าที่ไม่มีใครแตะก็ไม่ต้องสร้างเลย
   *
   * ทุน 0 ยังสร้างล็อตตามปกติ เพราะ 0 แปลว่า "ยังไม่เคยกรอกทุน" ซึ่งเป็นความจริง
   * ที่ต้องเก็บไว้ ไม่ใช่ข้อมูลที่ควรเดาแทนผู้ใช้
   */
  async ensureOpeningLot(
    tx: Prisma.TransactionClient,
    shopProductId: string,
  ): Promise<void> {
    const existing = await tx.stockLot.count({ where: { shopProductId } });
    if (existing > 0) return;

    const product = await tx.shopProduct.findUnique({
      where: { id: shopProductId },
      select: { stockQty: true, costPrice: true },
    });
    if (!product || product.stockQty <= 0) return;

    await tx.stockLot.create({
      data: {
        shopProductId,
        unitCost: product.costPrice,
        qtyReceived: product.stockQty,
        qtyRemaining: product.stockQty,
        note: 'ล็อตตั้งต้นจากยอดคงเหลือเดิม',
      },
    });
  }

  private async currentCostPrice(
    tx: Prisma.TransactionClient,
    shopProductId: string,
  ): Promise<Prisma.Decimal> {
    const product = await tx.shopProduct.findUnique({
      where: { id: shopProductId },
      select: { costPrice: true },
    });
    return product?.costPrice ?? ZERO;
  }
}
