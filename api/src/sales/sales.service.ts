import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../database/generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { StockChange } from '../notifications/low-stock.notifier';
import { LowStockNotifier } from '../notifications/low-stock.notifier';
import { StockLotsService } from '../stock/stock-lots.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import type { CreateSaleDto, SaleQueryDto } from './dto/sales.dto';
import {
  SALES_PRODUCT_PORT,
  type SalesProductPort,
} from './ports/sales-product.port';
import {
  SALES_STAFF_PORT,
  SALES_SUBSCRIPTION_PORT,
  type SalesStaffPort,
  type SalesSubscriptionPort,
} from './ports/sales-access.port';

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
    @Inject(SALES_PRODUCT_PORT) private readonly products: SalesProductPort,
    @Inject(SALES_STAFF_PORT) private readonly staff: SalesStaffPort,
    @Inject(SALES_SUBSCRIPTION_PORT)
    private readonly subscriptions: SalesSubscriptionPort,
    private readonly lowStock: LowStockNotifier,
    private readonly lots: StockLotsService,
  ) {}

  scan(shopId: string, staffId: string, barcode: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAccess(tx, shopId, staffId);
      await this.subscriptions.assertBarcodeEnabled(tx, shopId);
      return this.products.scan(shopId, barcode);
    });
  }

  /**
   * ปิดการขาย — ประตูที่ใช้คือ assertSalesEnabled ไม่ใช่ assertBarcodeEnabled
   *
   * สิ่งที่แพ็กเกจล็อกไว้คือ "การสแกนบาร์โค้ด" ไม่ใช่ "การขาย" — ตารางแพ็กเกจ
   * ให้ Basic Dashboard กับ Free ซึ่งเป็นแดชบอร์ดที่แสดงยอดขาย ถ้า Free เปิดบิล
   * ไม่ได้เลยแดชบอร์ดนั้นจะว่างตลอดกาล และ void() ก็ใช้ assertSalesEnabled อยู่
   * แล้ว การให้ยกเลิกบิลได้แต่สร้างบิลไม่ได้เป็นสถานะที่ขัดกันในตัวเอง
   *
   * ลูกค้า Free จึงพิมพ์รายการขายเองได้ แต่ใช้กล้องสแกนไม่ได้ (ดู scan())
   */
  async create(shopId: string, staffId: string, input: CreateSaleDto) {
    const { sale, stockChanges } = await this.prisma.$transaction(
      async (tx) => {
        await this.assertAccess(tx, shopId, staffId);
        await this.subscriptions.assertSalesEnabled(tx, shopId);
        const requested = new Map<string, number>();
        for (const item of input.items)
          requested.set(
            item.shopProductId,
            (requested.get(item.shopProductId) ?? 0) + item.quantity,
          );

        /**
         * ลำดับสำคัญมาก — ต้องตัดสต็อกกับล็อต "ก่อน" สร้างบิล
         *
         * เพราะทุนที่ต้อง snapshot ลงบิลคือทุนของล็อตที่ถูกตัดไปจริง ไม่ใช่
         * shop_products.cost_price ปัจจุบัน ซึ่งจะรู้ได้ก็ต่อเมื่อตัดล็อตแล้ว
         *
         * ภายในแต่ละรายการยังต้องตัด stock_qty ก่อนตัดล็อตด้วย เพราะตัวที่เช็ค
         * ว่าของพอไหมคือ adjustStock() ถ้าสลับกันจะไปแตะล็อตก่อนแล้วค่อยพบว่า
         * ของไม่พอ ซึ่ง rollback คืนให้อยู่แล้วแต่ทำงานเปล่าและอ่านยากกว่า
         */
        const items = [];
        const stockChanges: StockChange[] = [];
        let total = new Prisma.Decimal(0);
        for (const [shopProductId, quantity] of requested) {
          const product = await this.products.getForSale(
            tx,
            shopId,
            shopProductId,
          );

          const stock = await this.products.adjustStock(tx, {
            shopId,
            shopProductId,
            quantityDelta: -quantity,
          });
          stockChanges.push({
            shopProductId,
            quantityBefore: stock.quantityBefore,
            quantityAfter: stock.quantityAfter,
          });

          const consumed = await this.lots.consume(tx, {
            shopProductId,
            quantity,
          });

          const lineTotal = product.unitPrice.mul(quantity);
          total = total.add(lineTotal);
          items.push({
            ...product,
            // ทุนจากล็อตที่ตัดจริง ทับค่าที่ getForSale() อ่านมาจาก shop_products
            costPrice: consumed.unitCost,
            quantity,
            lineTotal,
            stock,
          });
        }

        const sale = await tx.sale.create({
          data: {
            shopId,
            staffId,
            saleNo: `S-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
            itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: total,
            note: input.note,
            items: {
              create: items.map(
                ({
                  shopProductId,
                  name,
                  barcode,
                  unitPrice,
                  costPrice,
                  quantity,
                  lineTotal,
                }) => ({
                  shopProductId,
                  productName: name,
                  barcode,
                  unitPrice,
                  costPrice,
                  quantity,
                  lineTotal,
                }),
              ),
            },
          },
          include: { items: true },
        });

        // สต็อกถูกตัดไปแล้วด้านบน เหลือแค่บันทึกประวัติที่ต้องอ้าง sale_item.id
        for (const item of items) {
          await this.movements.create(tx, {
            shopId,
            shopProductId: item.shopProductId,
            actorId: staffId,
            movementType: 'SALE',
            unitCost: item.costPrice,
            quantityDelta: -item.quantity,
            quantityBefore: item.stock.quantityBefore,
            quantityAfter: item.stock.quantityAfter,
            source: 'WEB',
            saleId: sale.id,
            referenceType: 'SALE_ITEM',
            referenceId: sale.items.find(
              (created) => created.shopProductId === item.shopProductId,
            )!.id,
          });
        }
        return { sale, stockChanges };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // นอกทรานแซกชัน — ดูเหตุผลใน StockService.adjust()
    await this.lowStock.notifyIfCrossed(stockChanges);

    return sale;
  }

  list(shopId: string, staffId: string, query: SaleQueryDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAccess(tx, shopId, staffId);
      const rows = await tx.sale.findMany({
        where: { shopId },
        include: { items: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const hasMore = rows.length > query.limit;
      const items = hasMore ? rows.slice(0, query.limit) : rows;
      return { items, nextCursor: hasMore ? items.at(-1)?.id : null };
    });
  }

  get(shopId: string, staffId: string, saleId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAccess(tx, shopId, staffId);
      const sale = await tx.sale.findFirst({
        where: { id: saleId, shopId },
        include: { items: true },
      });
      if (!sale) throw new NotFoundException('Sale not found');
      return sale;
    });
  }

  void(shopId: string, staffId: string, saleId: string, reason: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.assertAccess(tx, shopId, staffId);
        await this.subscriptions.assertSalesEnabled(tx, shopId);
        const sale = await tx.sale.findFirst({
          where: { id: saleId, shopId },
          include: { items: true },
        });
        if (!sale) throw new NotFoundException('Sale not found');
        if (sale.status === 'VOIDED')
          throw new ConflictException('Sale is already voided');

        for (const item of sale.items) {
          const stock = await this.products.adjustStock(tx, {
            shopId,
            shopProductId: item.shopProductId,
            quantityDelta: item.quantity,
          });
          /**
           * คืนของเป็นล็อตใหม่ด้วยทุนที่ snapshot ไว้ในบิล ไม่ใช่คืนเข้าล็อตเดิม
           *
           * เลือกแบบนี้เพราะถ้าจะคืนเข้าล็อตเดิมต้องจำว่าบิลนั้นตัดจากล็อตไหนไป
           * เท่าไหร่ ซึ่งต้องเพิ่มตารางอีกใบ ส่วนวิธีนี้ถูกต้องทางบัญชีอยู่แล้ว —
           * ของกลับเข้ามาด้วยทุนเดียวกับตอนที่มันออกไป
           *
           * ผลข้างเคียงที่ยอมรับ: ของที่ถูกยกเลิกจะไปต่อท้ายคิว FIFO แทนที่จะ
           * กลับไปอยู่ตำแหน่งเดิม ซึ่งกระทบลำดับการตัดครั้งถัดไปเล็กน้อย
           */
          await this.lots.receive(tx, {
            shopProductId: item.shopProductId,
            quantity: item.quantity,
            unitCost: Number(item.costPrice),
            note: `คืนจากบิลที่ยกเลิก ${sale.saleNo}`,
          });

          await this.movements.create(tx, {
            shopId,
            shopProductId: item.shopProductId,
            actorId: staffId,
            movementType: 'SALE_VOID',
            unitCost: item.costPrice,
            quantityDelta: item.quantity,
            quantityBefore: stock.quantityBefore,
            quantityAfter: stock.quantityAfter,
            source: 'WEB',
            note: reason,
            saleId: sale.id,
            referenceType: 'SALE_VOID_ITEM',
            referenceId: item.id,
          });
        }
        return tx.sale.update({
          where: { id: sale.id },
          data: {
            status: 'VOIDED',
            voidedById: staffId,
            voidReason: reason,
            voidedAt: new Date(),
          },
          include: { items: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async assertAccess(
    tx: Prisma.TransactionClient,
    shopId: string,
    staffId: string,
  ) {
    await this.staff.assertCanManageSales(tx, { shopId, staffId });
  }
}
