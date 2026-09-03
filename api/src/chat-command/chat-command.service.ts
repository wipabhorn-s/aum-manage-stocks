import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  PendingAction,
  PendingActionSource,
  Prisma,
} from '../database/generated/prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { LowStockNotifier } from '../notifications/low-stock.notifier';
import { StockService } from '../stock/stock.service';
import { STOCK_INVENTORY_PORT } from '../stock/ports/stock-inventory.port';
import type { StockInventoryPort } from '../stock/ports/stock-inventory.port';
import { STOCK_AUTHORIZATION_PORT } from '../stock/ports/stock-authorization.port';
import type { StockAuthorizationPort } from '../stock/ports/stock-authorization.port';
import { UpdatePendingActionDto } from './dto/chat-command.dto';
import { STOCK_COMMAND_PARSER } from './parsers/stock-command-parser';
import type { StockCommandParser } from './parsers/stock-command-parser';
import { SalesService } from '../sales/sales.service';
import { ShopDestinationService } from './shop-destination.service';
import { StockQueryRequestedError } from './stock-query-requested.error';

const persistedItemSchema = z.object({
  id: z.string().uuid(),
  intent: z.enum(['ADJUST_STOCK', 'SELL', 'TRANSFER_STOCK']),
  operation: z.enum(['INCREASE', 'DECREASE']),
  productQuery: z.string().min(1),
  quantity: z.number().int().positive(),
  shopProductId: z.string().uuid(),
});
const persistedItemsSchema = z.array(persistedItemSchema).min(1).max(100);

@Injectable()
export class ChatCommandService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly stock: StockService,
    private readonly lowStock: LowStockNotifier,
    // [อั้ม] ขาย/ย้ายผ่านแชท — ใช้ตรรกะเดิมของโมดูลขายและสต็อก ไม่เขียนซ้ำ
    private readonly sales: SalesService,
    private readonly destinations: ShopDestinationService,
    @Inject(STOCK_COMMAND_PARSER)
    private readonly parser: StockCommandParser,
    @Inject(STOCK_INVENTORY_PORT)
    private readonly inventory: StockInventoryPort,
    @Inject(STOCK_AUTHORIZATION_PORT)
    private readonly authorization: StockAuthorizationPort,
  ) {}

  async create(input: {
    shopId: string;
    actorId?: string;
    source: PendingActionSource;
    message: string;
  }) {
    if (!input.actorId) {
      throw new ForbiddenException('Authenticated chatbot user is required');
    }
    await this.assertChatbotAccess(input.shopId, input.actorId);
    const commandLines = input.message
      .split(/\r?\n|;/u)
      .map((line) => line.trim())
      .filter(Boolean);
    if (commandLines.length > 100) {
      throw new BadRequestException('A command can contain at most 100 items');
    }
    const parsedItems = await Promise.all(
      commandLines.map(async (line) => {
        const parsed = await this.parser.parse(line);

        /**
         * [อั้ม] การ "ถามยอดคงเหลือ" ไม่ใช่คำสั่งที่ต้องยืนยัน จึงไม่มีอะไรให้
         * เก็บเป็น PendingAction — โยนออกไปให้ WEB/LINE ตอบด้วย StockQueryService
         */
        if (parsed.intent === 'QUERY_STOCK') {
          throw new StockQueryRequestedError(parsed.productQuery);
        }

        const product = await this.inventory.resolveProduct(
          input.shopId,
          parsed.productQuery,
        );

        /**
         * ขายกับย้ายไม่มี operation มาจาก parser แต่คอลัมน์เป็น NOT NULL และ
         * ทั้งคู่ทำให้ของในร้านต้นทางลดลงจริง จึงเก็บเป็น DECREASE
         * ตัวที่บอกว่าเกิดอะไรขึ้นจริง ๆ คือ intent ไม่ใช่ operation
         */
        const operation =
          parsed.intent === 'ADJUST_STOCK' ? parsed.operation : 'DECREASE';

        return {
          id: randomUUID(),
          ...parsed,
          operation,
          shopProductId: product.shopProductId,
        };
      }),
    );
    const first = parsedItems[0];

    /**
     * [อั้ม] ห้ามปนชนิดคำสั่งในข้อความเดียว
     *
     * PendingAction หนึ่งแถวมี intent เดียว และตอนยืนยันก็เดินได้เส้นทางเดียว
     * ถ้าปล่อยให้ "ขายโค้ก 2; ลดน้ำแร่ 1" ผ่านไป บรรทัดที่สองจะถูกทำเป็นการขาย
     * ตาม intent ของบรรทัดแรก = คิดเงินของที่ผู้ใช้แค่อยากตัดทิ้ง
     */
    if (parsedItems.some((item) => item.intent !== first.intent)) {
      throw new BadRequestException(
        'คำสั่งเดียวกันต้องเป็นชนิดเดียวกันทั้งหมด กรุณาแยกส่งทีละชนิดครับ',
      );
    }

    /**
     * ย้ายได้ทีละรายการ เพราะ StockService.transfer() รับสินค้าตัวเดียวต่อครั้ง
     * ถ้ารับหลายรายการแล้ววนเรียก จะไม่อยู่ในทรานแซกชันเดียวกัน — ย้ายสำเร็จ
     * ครึ่งหนึ่งแล้วพังกลางทางคือสภาพที่ตามแก้ยากที่สุด
     */
    if (first.intent === 'TRANSFER_STOCK' && parsedItems.length > 1) {
      throw new BadRequestException('ย้ายสินค้าได้ครั้งละหนึ่งรายการครับ');
    }

    /**
     * [อั้ม] ไม่ระบุร้านปลายทางก็สร้างรายการได้ แล้วค่อยถามทีหลัง
     *
     * แถวที่ destinationShopId ยังว่าง = สถานะ "รอเลือกร้านปลายทาง" ซึ่งเป็น
     * สถานะที่อ่านออกจากฐานข้อมูลได้ตรง ๆ ไม่ต้องเก็บอะไรไว้ในหน่วยความจำ
     * — จำเป็นเพราะ LINE ส่งข้อความมาเป็นคนละ request เสมอ
     */
    const destinationShopId =
      first.intent === 'TRANSFER_STOCK' && first.destinationShopQuery
        ? await this.destinations.resolve(
            input.shopId,
            first.destinationShopQuery,
          )
        : null;
    const ttl = this.config.get<number>('PENDING_ACTION_TTL_MINUTES', 15);
    return this.prisma.pendingAction.create({
      data: {
        shopId: input.shopId,
        actorId: input.actorId,
        source: input.source,
        originalMessage: input.message,
        intent: first.intent,
        shopProductId: first.shopProductId,
        productQuery: first.productQuery,
        operation: first.operation,
        quantity: first.quantity,
        destinationShopId,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        payload: first,
        parsedItems,
      },
    });
  }

  async update(
    shopId: string,
    pendingId: string,
    actorId: string,
    patch: UpdatePendingActionDto,
  ) {
    await this.assertChatbotAccess(shopId, actorId);
    await this.expireElapsed(shopId, pendingId);
    const pending = await this.requirePending(shopId, pendingId);
    this.assertActionable(pending);
    this.assertActor(pending, actorId);
    let shopProductId = patch.shopProductId;
    if (patch.productQuery && !shopProductId) {
      shopProductId = (
        await this.inventory.resolveProduct(shopId, patch.productQuery)
      ).shopProductId;
    }
    const existingItems = pending.parsedItems
      ? persistedItemsSchema.parse(pending.parsedItems)
      : [];
    const firstItem = existingItems[0] ?? {
      id: randomUUID(),
      intent: 'ADJUST_STOCK' as const,
      shopProductId: pending.shopProductId,
      productQuery: pending.productQuery,
      operation: pending.operation,
      quantity: pending.quantity,
    };
    if (!shopProductId && !firstItem.shopProductId) {
      throw new BadRequestException('Pending action has no resolved product');
    }

    /**
     * [อั้ม] ร้านปลายทางเป็นของทั้งรายการ ไม่ใช่ของสินค้าแต่ละบรรทัด
     * จึงต้องแยกออกจาก patch ก่อน ไม่ให้ไหลลง parsedItems ซึ่งเป็นระดับบรรทัด
     */
    const { destinationShopId, ...itemPatch } = patch;

    if (destinationShopId) {
      await this.destinations.assertSibling(shopId, destinationShopId);
    }

    const parsedItems = [
      {
        ...firstItem,
        ...itemPatch,
        shopProductId: shopProductId ?? firstItem.shopProductId,
      },
      ...existingItems.slice(1),
    ];
    const result = await this.prisma.pendingAction.updateMany({
      where: { id: pendingId, shopId, status: 'PENDING' },
      data: {
        ...itemPatch,
        destinationShopId,
        shopProductId,
        parsedItems,
      },
    });
    if (result.count !== 1) {
      throw new ConflictException('Pending action changed concurrently');
    }
    return this.requirePending(shopId, pendingId);
  }

  async cancel(shopId: string, pendingId: string, actorId: string) {
    await this.assertChatbotAccess(shopId, actorId);
    await this.expireElapsed(shopId, pendingId);
    const pending = await this.requirePending(shopId, pendingId);
    this.assertActionable(pending);
    this.assertActor(pending, actorId);
    const result = await this.prisma.pendingAction.updateMany({
      where: { id: pendingId, shopId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (result.count !== 1) {
      throw new ConflictException('Pending action changed concurrently');
    }
    return { id: pendingId, status: 'CANCELLED' as const };
  }

  async confirm(shopId: string, pendingId: string, actorId: string) {
    await this.assertChatbotAccess(shopId, actorId);
    await this.expireElapsed(shopId, pendingId);

    const pending = await this.requirePending(shopId, pendingId);
    if (pending.intent !== 'ADJUST_STOCK') {
      return this.confirmNonAdjust(shopId, pending, actorId);
    }

    return this.confirmAdjust(shopId, pendingId, actorId);
  }

  /**
   * [อั้ม] ขายและย้าย — สองอย่างนี้ต้อง "จองก่อนแล้วค่อยทำ"
   *
   * SalesService.create() กับ StockService.transfer() เปิดทรานแซกชันของตัวเอง
   * จึงซ้อนเข้าไปใน $transaction ของ confirmAdjust() ไม่ได้ (ต่างจาก
   * stock.adjustInTransaction ที่รับ tx เข้าไป) ลำดับจึงต้องเป็น
   *
   *   1. มาร์ก CONFIRMED แบบมีเงื่อนไข status ยังเป็น PENDING — ใครกดพร้อมกัน
   *      จะได้ count = 0 แล้วถูกปฏิเสธ
   *   2. ค่อยทำงานจริง
   *   3. พังก็คืนสถานะกลับ
   *
   * **ห้ามสลับเป็นทำก่อนแล้วค่อยมาร์ก** — กดยืนยันสองครั้งพร้อมกันจะขายซ้ำ
   * ออกบิลสองใบและตัดสต็อกสองรอบ ซึ่งแก้ทีหลังแทบไม่ได้ ส่วนความเสี่ยงของลำดับนี้
   * คือถ้าโปรเซสตายระหว่างขั้น 2–3 รายการจะค้างเป็น CONFIRMED ทั้งที่ยังไม่ได้ทำ
   * ผู้ใช้แค่สั่งใหม่ ซึ่งเจ็บน้อยกว่ากันมาก
   */
  private async confirmNonAdjust(
    shopId: string,
    pending: PendingAction,
    actorId: string,
  ) {
    this.assertActionable(pending);
    this.assertActor(pending, actorId);
    if (!pending.shopProductId) {
      throw new BadRequestException('Pending action has no resolved product');
    }

    const claimed = await this.prisma.pendingAction.updateMany({
      where: { id: pending.id, shopId, status: 'PENDING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date(), actorId },
    });
    if (claimed.count !== 1) {
      throw new ConflictException('Pending action changed concurrently');
    }

    try {
      if (pending.intent === 'SELL') {
        const items = pending.parsedItems
          ? persistedItemsSchema.parse(pending.parsedItems)
          : [
              {
                shopProductId: pending.shopProductId,
                quantity: pending.quantity,
              },
            ];

        const sale = await this.sales.create(shopId, actorId, {
          items: items.map((item) => ({
            shopProductId: item.shopProductId,
            quantity: item.quantity,
          })),
          note: `ขายผ่านแชทบอท: ${pending.originalMessage}`.slice(0, 500),
        });

        /**
         * คืนรูปเดียวกับเส้นทางปรับสต็อก (มี items) เพื่อให้ตัวเรนเดอร์ฝั่ง
         * WEB/LINE ใช้ตัวเดิมได้ — การขายไม่มีเลขก่อน/หลังให้แสดง จึงส่ง items
         * เปล่าไป แล้วให้ผู้เรียกอ่านยอดเงินจาก sale แทน
         */
        return {
          intent: 'SELL' as const,
          sale,
          items: [],
          pendingActionId: pending.id,
        };
      }

      if (!pending.destinationShopId) {
        throw new BadRequestException('Pending action has no destination shop');
      }

      const transfer = await this.stock.transfer({
        fromShopId: shopId,
        toShopId: pending.destinationShopId,
        shopProductId: pending.shopProductId,
        actorId,
        quantity: pending.quantity,
        note: `ย้ายผ่านแชทบอท: ${pending.originalMessage}`.slice(0, 500),
      });

      return {
        intent: 'TRANSFER_STOCK' as const,
        transfer,
        // ยอดคงเหลือที่ผู้ใช้อยากรู้คือของร้านต้นทางที่ตัวเองยืนอยู่
        items: [
          { movement: transfer.from.movement, stock: transfer.from.stock },
        ],
        pendingActionId: pending.id,
      };
    } catch (error) {
      // คืนสถานะให้ผู้ใช้กดยืนยันใหม่ได้ ไม่ปล่อยให้ค้างเป็น CONFIRMED ทั้งที่ไม่สำเร็จ
      await this.prisma.pendingAction.updateMany({
        where: { id: pending.id, shopId, status: 'CONFIRMED' },
        data: { status: 'PENDING', confirmedAt: null },
      });
      throw error;
    }
  }

  private confirmAdjust(shopId: string, pendingId: string, actorId: string) {
    return Promise.resolve()
      .then(() =>
        this.prisma.$transaction(
          async (tx) => {
            const pending = await tx.pendingAction.findFirst({
              where: { id: pendingId, shopId },
            });
            if (!pending)
              throw new NotFoundException('Pending action not found');
            this.assertActionable(pending);
            if (pending.actorId && pending.actorId !== actorId) {
              throw new ForbiddenException(
                'Pending action belongs to another actor',
              );
            }
            if (!pending.shopProductId) {
              throw new BadRequestException(
                'Pending action has no resolved product',
              );
            }
            const items = pending.parsedItems
              ? persistedItemsSchema.parse(pending.parsedItems)
              : [
                  {
                    id: pending.id,
                    intent: 'ADJUST_STOCK' as const,
                    shopProductId: pending.shopProductId,
                    productQuery: pending.productQuery,
                    operation: pending.operation,
                    quantity: pending.quantity,
                  },
                ];
            const adjusted = [];
            for (const item of items) {
              adjusted.push(
                await this.stock.adjustInTransaction(tx, {
                  shopId,
                  shopProductId: item.shopProductId,
                  actorId,
                  operation: item.operation,
                  quantity: item.quantity,
                  source: pending.source,
                  pendingAction: pending,
                  pendingItemReferenceId: item.id,
                }),
              );
            }
            const updated = await tx.pendingAction.updateMany({
              where: { id: pendingId, shopId, status: 'PENDING' },
              data: { status: 'CONFIRMED', confirmedAt: new Date(), actorId },
            });
            if (updated.count !== 1) {
              throw new ConflictException(
                'Pending action changed concurrently',
              );
            }
            return {
              ...adjusted[0],
              items: adjusted,
              pendingActionId: pendingId,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
      )
      .then(async (result) => {
        /**
         * แจ้งเตือนของใกล้หมดหลัง commit เหมือน StockService.adjust()
         *
         * ยิงในทรานแซกชันไม่ได้ เพราะถ้ามัน rollback การแจ้งเตือนจะหายไปด้วย
         * และ notifier กลืน error เองอยู่แล้ว การยืนยันคำสั่งจึงไม่มีวันล้ม
         * เพราะการแจ้งเตือนล้ม
         *
         * ก่อนหน้านี้เส้นทางนี้ไม่ยิงเลย ลดสต็อกผ่านแชทบอท/LINE จนต่ำกว่าเส้น
         * แล้วกระดิ่งไม่ขึ้น ต่างจากการปรับสต็อกหน้าเว็บที่ยิงมาตั้งแต่แรก
         */
        await this.lowStock.notifyIfCrossed(
          result.items.map((entry) => ({
            shopProductId: entry.movement.shopProductId,
            quantityBefore: entry.stock.quantityBefore,
            quantityAfter: entry.stock.quantityAfter,
          })),
        );
        return result;
      });
  }

  private assertChatbotAccess(shopId: string, actorId: string) {
    return this.prisma.$transaction((tx) =>
      this.authorization.assertCanUseChatbot(tx, { shopId, actorId }),
    );
  }

  private async requirePending(shopId: string, pendingId: string) {
    const pending = await this.prisma.pendingAction.findFirst({
      where: { id: pendingId, shopId },
    });
    if (!pending) throw new NotFoundException('Pending action not found');
    return pending;
  }

  private assertActionable(pending: PendingAction): void {
    if (pending.status === 'CONFIRMED') {
      throw new ConflictException('Pending action is already confirmed');
    }
    if (pending.status === 'CANCELLED') {
      throw new ConflictException('Pending action is cancelled');
    }
    if (pending.status === 'EXPIRED' || pending.expiresAt <= new Date()) {
      throw new GoneException('Pending action is expired');
    }
  }

  private assertActor(pending: PendingAction, actorId: string): void {
    if (pending.actorId !== actorId) {
      throw new ForbiddenException('Pending action belongs to another actor');
    }
  }

  private async expireElapsed(
    shopId: string,
    pendingId: string,
  ): Promise<void> {
    await this.prisma.pendingAction.updateMany({
      where: {
        id: pendingId,
        shopId,
        status: 'PENDING',
        expiresAt: { lte: new Date() },
      },
      data: { status: 'EXPIRED' },
    });
  }
}
