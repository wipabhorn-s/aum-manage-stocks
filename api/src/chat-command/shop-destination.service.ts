import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';

/**
 * [อั้ม] แปลงชื่อร้านที่ผู้ใช้พิมพ์ ให้เป็นร้านปลายทางของคำสั่งย้าย
 *
 * ## ทำไมไม่ทำเป็นเมนูตัวเลขให้เลือกเหมือนตอนชื่อสินค้ากำกวม
 *
 * บน LINE ตัวเลขถูกใช้ไปแล้วสองความหมาย — เลือกร้านที่จะทำงาน (ChatShopPrompt)
 * และเลือกสินค้าตอนชื่อกำกวม (StockChoiceService) การเพิ่มความหมายที่สามเข้าไป
 * แปลว่าเลข "1" จะแปลได้สามอย่างขึ้นกับสถานะที่มองไม่เห็น ซึ่งเป็นบั๊กประเภทที่
 * ไล่ยากที่สุดและผู้ใช้จะเจอตอนสั่งย้ายของผิดร้านไปแล้ว
 *
 * จึงเลือกวิธีที่ไม่มีสถานะเลย: หาไม่เจอหรือเจอหลายร้าน ก็บอกรายชื่อร้านที่มี
 * แล้วให้พิมพ์คำสั่งใหม่ให้เจาะจงขึ้น
 */
@Injectable()
export class ShopDestinationService {
  constructor(private readonly prisma: PrismaService) {}
  /**
   * รายการร้านปลายทางที่เลือกได้ พร้อมชื่อร้านที่ยืนอยู่ตอนนี้
   *
   * ผู้ใช้ต้องเห็นว่า "ตอนนี้อยู่ร้านไหน" ก่อนเลือกปลายทาง ไม่งั้นบัญชีที่มีหลายสาขา
   * จะเดาไม่ออกว่ากำลังย้ายของออกจากร้านไหน แล้วเลือกผิดทาง
   */
  async listOptions(fromShopId: string): Promise<{
    currentShopName: string;
    shops: Array<{ id: string; name: string }>;
  }> {
    const current = await this.prisma.shop.findFirst({
      where: { id: fromShopId, deletedAt: null },
      select: { name: true, ownerId: true },
    });

    if (!current) throw new BadRequestException('ไม่พบร้านต้นทาง');

    return {
      currentShopName: current.name,
      shops: await this.siblings(fromShopId, current.ownerId),
    };
  }

  /**
   * [อั้ม] กันการย้ายของข้ามเจ้าของ
   *
   * id ของร้านปลายทางมาจาก client (ปุ่มบนเว็บ / หมายเลขที่พิมพ์ใน LINE) จึงเชื่อ
   * ไม่ได้ว่าเป็นร้านของเจ้าของคนเดียวกัน ถ้าไม่เช็ค ใครก็ยิง id ร้านคนอื่นเข้ามา
   * แล้วโยนของออกจากระบบตัวเองได้
   */
  async assertSibling(
    fromShopId: string,
    destinationShopId: string,
  ): Promise<void> {
    const { shops } = await this.listOptions(fromShopId);

    if (!shops.some((shop) => shop.id === destinationShopId)) {
      throw new BadRequestException(
        'ร้านปลายทางไม่ถูกต้อง กรุณาเลือกจากรายการที่ระบบแสดงให้ครับ',
      );
    }
  }

  private siblings(fromShopId: string, ownerId: string) {
    return this.prisma.shop.findMany({
      where: { ownerId, deletedAt: null, id: { not: fromShopId } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * @param fromShopId ร้านต้นทาง ใช้หาเจ้าของและตัดตัวเองออกจากผลลัพธ์
   * @param query ชื่อร้านปลายทางตามที่ผู้ใช้พิมพ์
   * @throws BadRequestException พร้อมข้อความไทยที่ส่งกลับผู้ใช้ได้ทันที
   */
  async resolve(fromShopId: string, query: string): Promise<string> {
    const source = await this.prisma.shop.findFirst({
      where: { id: fromShopId, deletedAt: null },
      select: { ownerId: true },
    });

    if (!source) {
      throw new BadRequestException('ไม่พบร้านต้นทาง');
    }

    const siblings = await this.siblings(fromShopId, source.ownerId);

    if (siblings.length === 0) {
      throw new BadRequestException(
        'บัญชีนี้มีร้านเดียว จึงย้ายสินค้าไปร้านอื่นไม่ได้ครับ',
      );
    }

    const trimmed = query.trim();
    const matches = siblings.filter((shop) =>
      shop.name.toLowerCase().includes(trimmed.toLowerCase()),
    );

    if (matches.length === 1) return matches[0].id;

    // ชื่อร้านตรงเป๊ะต้องชนะเสมอ กันกรณี "สาขา 1" ที่เป็นคำขึ้นต้นของ "สาขา 10"
    const exact = matches.find(
      (shop) => shop.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) return exact.id;

    const available = siblings.map((shop) => `• ${shop.name}`).join('\n');

    throw new BadRequestException(
      matches.length === 0
        ? `ไม่พบร้านชื่อ "${trimmed}" ครับ ร้านที่ย้ายไปได้มี\n${available}`
        : `ชื่อ "${trimmed}" ตรงกับหลายร้าน กรุณาพิมพ์ให้เจาะจงขึ้นครับ\n${available}`,
    );
  }
}
