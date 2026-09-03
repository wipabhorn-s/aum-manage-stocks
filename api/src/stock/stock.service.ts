import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PendingAction,
  Prisma,
  StockMovementSource,
} from '../database/generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LowStockNotifier } from '../notifications/low-stock.notifier';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { StockLotsService } from './stock-lots.service';
import { STOCK_AUTHORIZATION_PORT } from './ports/stock-authorization.port';
import type { StockAuthorizationPort } from './ports/stock-authorization.port';
import { STOCK_INVENTORY_PORT } from './ports/stock-inventory.port';
import type { StockInventoryPort } from './ports/stock-inventory.port';

export interface TransferStockInput {
  fromShopId: string;
  toShopId: string;
  shopProductId: string;
  actorId: string;
  quantity: number;
  note?: string;
}

export interface ExecuteAdjustmentInput {
  shopId: string;
  shopProductId: string;
  actorId: string;
  operation: 'INCREASE' | 'DECREASE';
  quantity: number;
  source: StockMovementSource;
  note?: string;
  pendingAction?: PendingAction;
  pendingItemReferenceId?: string;
  /** ทุนต่อชิ้นของล็อตที่รับเข้า — ใช้กับ INCREASE เท่านั้น */
  unitCost?: number;
}

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: StockMovementsService,
    @Inject(STOCK_INVENTORY_PORT)
    private readonly inventory: StockInventoryPort,
    @Inject(STOCK_AUTHORIZATION_PORT)
    private readonly authorization: StockAuthorizationPort,
    private readonly lowStock: LowStockNotifier,
    private readonly lots: StockLotsService,
  ) {}

  async adjust(input: ExecuteAdjustmentInput) {
    const result = await this.prisma.$transaction(
      async (tx) => this.adjustInTransaction(tx, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    /**
     * แจ้งเตือนหลัง commit เท่านั้น ถ้ายิงอยู่ในทรานแซกชันแล้วมันถูก rollback
     * การแจ้งเตือนจะหายไปด้วย และ notifier ก็กลืน error เองอยู่แล้ว
     * การปรับสต็อกจึงไม่มีวันล้มเพราะการแจ้งเตือนล้ม
     */
    await this.lowStock.notifyIfCrossed([
      {
        shopProductId: input.shopProductId,
        quantityBefore: result.stock.quantityBefore,
        quantityAfter: result.stock.quantityAfter,
      },
    ]);

    return result;
  }

  /**
   * ย้ายสต็อกข้ามสาขาในทรานแซกชันเดียว
   *
   * ก่อนหน้านี้หน้าเว็บทำเองด้วยการยิง stock/adjust สองครั้ง (ลดต้นทาง เพิ่ม
   * ปลายทาง) พร้อม compensating rollback ฝั่ง client — ซึ่งแปลว่าถ้าผู้ใช้ปิดแท็บ
   * เน็ตหลุด หรือพับจอ ระหว่างสองคำขอ ของจะหายจากต้นทางโดยไม่ไปถึงปลายทาง
   * และไม่มีอะไรตามเก็บ เพราะตัวที่ต้องคืนของอยู่ในเบราว์เซอร์ที่เพิ่งตายไป
   *
   * ที่นี่ทั้งขาออกและขาเข้าอยู่ในทรานแซกชันเดียวกัน ถ้าขาไหนล้ม Postgres คืนค่า
   * ให้ทั้งคู่เอง ไม่ต้องมี rollback ที่ต้องเชื่อใจว่าจะได้รัน
   *
   * ใช้ movementType MANUAL_ADJUSTMENT เหมือนเดิม ไม่ใช่ค่าใหม่ เพราะการเพิ่ม
   * ค่าใน enum ต้องแก้ schema ซึ่งต้องเป็น PR แยกตาม AGENTS.md — เจตนา "ย้าย"
   * บันทึกไว้ในหมายเหตุแทน เหมือนที่หน้าเว็บทำอยู่แล้ว
   */
  async transfer(input: TransferStockInput) {
    if (input.fromShopId === input.toShopId) {
      throw new BadRequestException({
        message: 'ร้านต้นทางกับร้านปลายทางเป็นร้านเดียวกัน',
        code: 'SAME_SHOP_TRANSFER',
      });
    }

    const result = await this.prisma.$transaction(
      async (tx) => {
        // ต้องมีสิทธิ์ปรับสต็อกทั้งสองร้าน ไม่ใช่แค่ร้านต้นทาง
        // ตัวนี้กันร้านที่ถูกพักไว้ด้วย (SHOP_PAUSED)
        await this.authorization.assertCanAdjustStock(tx, {
          shopId: input.fromShopId,
          actorId: input.actorId,
        });
        await this.authorization.assertCanAdjustStock(tx, {
          shopId: input.toShopId,
          actorId: input.actorId,
        });

        const source = await tx.shopProduct.findFirst({
          where: {
            id: input.shopProductId,
            shopId: input.fromShopId,
            status: 'ACTIVE',
            product: { deletedAt: null },
          },
          select: {
            id: true,
            productId: true,
            product: { select: { name: true } },
            shop: { select: { name: true, ownerId: true } },
          },
        });
        if (!source) {
          throw new NotFoundException({
            message: 'ไม่พบสินค้านี้ในร้านต้นทาง',
            code: 'SOURCE_PRODUCT_NOT_FOUND',
          });
        }

        const destination = await tx.shopProduct.findFirst({
          where: {
            shopId: input.toShopId,
            productId: source.productId,
            status: 'ACTIVE',
            product: { deletedAt: null },
          },
          select: {
            id: true,
            shop: { select: { name: true, ownerId: true } },
          },
        });
        if (!destination) {
          throw new ConflictException({
            message: `ร้านปลายทางยังไม่มี ${source.product.name} ในรายการสินค้า ต้องลงสินค้าเข้าร้านปลายทางก่อนถึงจะย้ายได้`,
            code: 'DESTINATION_PRODUCT_NOT_LISTED',
          });
        }

        // ด่านสุดท้าย — สิทธิ์ผ่านแล้วก็ยังต้องเป็นร้านของเจ้าของเดียวกัน
        // ของไม่ควรข้ามกิจการได้ไม่ว่ากรณีใด
        if (source.shop.ownerId !== destination.shop.ownerId) {
          throw new ForbiddenException({
            message: 'ย้ายสต็อกข้ามเจ้าของร้านไม่ได้',
            code: 'CROSS_OWNER_TRANSFER',
          });
        }

        const outboundNote = input.note?.trim()
          ? `ย้ายไป ${destination.shop.name} — ${input.note.trim()}`
          : `ย้ายไป ${destination.shop.name}`;
        const inboundNote = input.note?.trim()
          ? `ย้ายมาจาก ${source.shop.name} — ${input.note.trim()}`
          : `ย้ายมาจาก ${source.shop.name}`;

        // ขาออกก่อน ถ้าของไม่พอจะล้มตรงนี้ก่อนที่ปลายทางจะได้รับอะไร
        const outbound = await this.inventory.adjustStock(tx, {
          shopId: input.fromShopId,
          shopProductId: source.id,
          quantityDelta: -input.quantity,
        });

        /**
         * ตัดล็อตต้นทางแล้วเอา "ทุนของที่ย้ายไปจริง" ไปเปิดล็อตที่ปลายทาง
         *
         * ถ้าปลายทางเปิดล็อตด้วย cost_price ของร้านตัวเองแทน ต้นทุนจะเพี้ยน
         * ทันทีที่สองร้านตั้งทุนไม่เท่ากัน ทั้งที่เป็นของชิ้นเดียวกันที่แค่ย้ายที่
         */
        const moved = await this.lots.consume(tx, {
          shopProductId: source.id,
          quantity: input.quantity,
        });
        const outboundMovement = await this.movements.create(tx, {
          shopId: input.fromShopId,
          shopProductId: source.id,
          actorId: input.actorId,
          movementType: 'MANUAL_ADJUSTMENT',
          unitCost: moved.unitCost,
          quantityDelta: -input.quantity,
          quantityBefore: outbound.quantityBefore,
          quantityAfter: outbound.quantityAfter,
          source: 'WEB',
          note: outboundNote,
        });

        const inbound = await this.inventory.adjustStock(tx, {
          shopId: input.toShopId,
          shopProductId: destination.id,
          quantityDelta: input.quantity,
        });
        const receivedAtDestination = await this.lots.receive(tx, {
          shopProductId: destination.id,
          quantity: input.quantity,
          unitCost: moved.unitCost.toNumber(),
          note: inboundNote,
        });
        const inboundMovement = await this.movements.create(tx, {
          shopId: input.toShopId,
          shopProductId: destination.id,
          actorId: input.actorId,
          movementType: 'MANUAL_ADJUSTMENT',
          unitCost: receivedAtDestination.unitCost,
          quantityDelta: input.quantity,
          quantityBefore: inbound.quantityBefore,
          quantityAfter: inbound.quantityAfter,
          source: 'WEB',
          note: inboundNote,
        });

        return {
          from: {
            shopId: input.fromShopId,
            shopProductId: source.id,
            movement: outboundMovement,
            stock: outbound,
          },
          to: {
            shopId: input.toShopId,
            shopProductId: destination.id,
            movement: inboundMovement,
            stock: inbound,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // ร้านต้นทางเท่านั้นที่สต็อกลดลง ปลายทางเพิ่มขึ้นจึงไม่มีทางข้ามเส้นลงมา
    await this.lowStock.notifyIfCrossed([
      {
        shopProductId: result.from.shopProductId,
        quantityBefore: result.from.stock.quantityBefore,
        quantityAfter: result.from.stock.quantityAfter,
      },
    ]);

    return result;
  }

  async adjustInTransaction(
    tx: Prisma.TransactionClient,
    input: ExecuteAdjustmentInput,
  ) {
    const authorizationInput = {
      shopId: input.shopId,
      actorId: input.actorId,
    };
    if (input.pendingAction) {
      await this.authorization.assertCanUseChatbot(tx, authorizationInput);
    } else {
      await this.authorization.assertCanAdjustStock(tx, authorizationInput);
    }
    const quantityDelta =
      input.operation === 'INCREASE' ? input.quantity : -input.quantity;
    const stock = await this.inventory.adjustStock(tx, {
      shopId: input.shopId,
      shopProductId: input.shopProductId,
      quantityDelta,
    });

    /**
     * ล็อตต้องขยับในทรานแซกชันเดียวกับ stock_qty เสมอ ถ้าแยกกันแล้วอันใดอันหนึ่ง
     * ล้ม จำนวนคงเหลือกับผลรวมของล็อตจะไม่ตรงกัน แล้วไม่มีอะไรจับได้เลย
     */
    const lot =
      input.operation === 'INCREASE'
        ? await this.lots.receive(tx, {
            shopProductId: input.shopProductId,
            quantity: input.quantity,
            unitCost: input.unitCost,
            note: input.note,
          })
        : await this.lots.consume(tx, {
            shopProductId: input.shopProductId,
            quantity: input.quantity,
          });

    const movement = await this.movements.create(tx, {
      shopId: input.shopId,
      shopProductId: input.shopProductId,
      actorId: input.actorId,
      movementType: input.pendingAction
        ? 'CHAT_ADJUSTMENT'
        : 'MANUAL_ADJUSTMENT',
      unitCost: lot.unitCost,
      quantityDelta,
      quantityBefore: stock.quantityBefore,
      quantityAfter: stock.quantityAfter,
      source: input.source,
      note: input.note,
      referenceType: input.pendingAction ? 'PENDING_ACTION' : undefined,
      referenceId: input.pendingItemReferenceId ?? input.pendingAction?.id,
      pendingActionId: input.pendingAction?.id,
    });
    return { movement, stock };
  }
}
