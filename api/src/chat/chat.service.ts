import { z } from 'zod';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ChatCommandService } from '../chat-command/chat-command.service';
import { StockChoiceService } from '../chat-command/stock-choice.service';
import { PrismaService } from '../database/prisma.service';
import { ChatAccessService } from './chat-access.service';
import type {
  ApplyChatCommandDto,
  ListChatMessagesQueryDto,
  SelectChatProductDto,
} from './dto/chat.dto';
import { ShopDestinationService } from '../chat-command/shop-destination.service';
import { StockQueryService } from '../chat-command/stock-query.service';
import { StockQueryRequestedError } from '../chat-command/stock-query-requested.error';

/**
 * คำทักทาย/ขอความช่วยเหลือ — ชุดเดียวกับฝั่ง LINE (line-webhook.service.ts)
 * เพื่อให้สองช่องทางตอบเหมือนกัน
 */
const HELP_KEYWORDS = [
  'สวัสดี',
  'สวัสดีครับ',
  'สวัสดีค่ะ',
  'หวัดดี',
  'hello',
  'hi',
  'ช่วยเหลือ',
  'help',
  'เมนู',
  'menu',
  'วิธีใช้',
];

/**
 * รูปแบบ parsedItems ที่ ChatCommandService เขียนไว้ (chat-command.service.ts)
 * หนึ่งข้อความสั่งได้หลายรายการ คั่นด้วย ";" หรือขึ้นบรรทัดใหม่
 */
const pendingItemSchema = z.object({
  shopProductId: z.string(),
  productQuery: z.string(),
  operation: z.enum(['INCREASE', 'DECREASE']),
  quantity: z.number().int(),
});

const pendingItemsSchema = z.array(pendingItemSchema).min(1);

type PendingItem = z.infer<typeof pendingItemSchema>;

const HELP_TEXT = [
  'ผมช่วยจัดการสต็อก ขายของ และย้ายของระหว่างร้านให้ได้ครับ พิมพ์เป็นภาษาพูดได้เลย',
  '',
  'ตัวอย่าง',
  '• เพิ่มโค้ก 10',
  '• ลดน้ำเปล่า 5',
  '• ขายโค้ก 2   (ตัดสต็อกพร้อมคิดเงิน)',
  '• ย้ายโค้ก 10 ไปร้าน สาขาสอง',
  '• สินค้าคงเหลือ',
  '',
  'ผมจะสรุปให้ดูก่อน แล้วกดยืนยันเพื่อบันทึก หรือกดยกเลิกได้',
].join('\n');

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatAccess: ChatAccessService,
    private readonly chatCommand: ChatCommandService,
    private readonly stockChoice: StockChoiceService,
    private readonly stockQuery: StockQueryService,
    // [อั้ม] รายชื่อร้านปลายทางของคำสั่งย้าย
    private readonly destinations: ShopDestinationService,
  ) {}

  async listMessages(
    userId: string,
    shopId: string,
    query: ListChatMessagesQueryDto,
  ) {
    const ctx = await this.chatAccess.assertCanViewChat(userId, shopId);

    return this.prisma.chatMessage.findMany({
      where: { shopId, userId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
  }

  async sendMessage(userId: string, shopId: string, content: string) {
    const ctx = await this.chatAccess.assertCanUseChatbot(userId, shopId);

    await this.prisma.chatMessage.create({
      data: {
        shopId,
        userId: ctx.userId,
        channel: 'WEB',
        role: 'USER',
        content,
      },
    });

    // ทักทาย/ขอวิธีใช้ ไม่ใช่คำสั่งสต็อก ตอบวิธีใช้ไปเลยดีกว่าปล่อยให้ parser
    // ล้มแล้วขึ้นเป็น error ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
    if (HELP_KEYWORDS.includes(content.trim().toLowerCase())) {
      await this.prisma.chatMessage.create({
        data: {
          shopId,
          userId: ctx.userId,
          channel: 'WEB',
          role: 'ASSISTANT',
          content: HELP_TEXT,
        },
      });

      return { pendingAction: null, reply: HELP_TEXT, candidates: [] };
    }

    try {
      const pending = await this.chatCommand.create({
        shopId,
        actorId: ctx.userId,
        source: 'WEB',
        message: content,
      });

      const reply = await this.buildSummary(shopId, pending);

      await this.prisma.chatMessage.create({
        data: {
          shopId,
          userId: ctx.userId,
          channel: 'WEB',
          role: 'ASSISTANT',
          content: reply,
          pendingActionId: pending.id,
        },
      });

      /**
       * [อั้ม] ย้ายแต่ยังไม่ได้บอกปลายทาง — ส่งรายชื่อร้านไปให้หน้าเว็บวาดปุ่ม
       * ผู้ใช้จะได้ไม่ต้องจำชื่อร้านแล้วพิมพ์เอง
       */
      const destinationShops =
        pending.intent === 'TRANSFER_STOCK' && !pending.destinationShopId
          ? (await this.destinations.listOptions(shopId)).shops
          : [];

      return {
        pendingAction: pending,
        reply,
        candidates: [],
        destinationShops,
      };
    } catch (error) {
      /**
       * [อั้ม] ถามยอดคงเหลือ ไม่ใช่สั่งแก้ — ตอบทันที ไม่ต้องยืนยัน
       *
       * ฝั่งเว็บไม่ต้องถามว่าร้านไหน เพราะตัวสลับร้านมุมซ้ายบนบอกอยู่แล้วว่า
       * กำลังคุยกับร้านไหน (ต่างจาก LINE ที่ไม่มี context นั้น)
       */
      if (error instanceof StockQueryRequestedError) {
        const reply = await this.stockQuery.answer(shopId, error.productQuery);

        await this.recordAssistant(shopId, ctx.userId, reply);

        return { pendingAction: null, reply, candidates: [] };
      }

      /**
       * ชื่อกำกวม = แมตช์ได้หลายตัว ให้ผู้ใช้เลือกจากรายการแทนการเดาให้
       * ฝั่ง LINE ให้พิมพ์หมายเลข ส่วนเว็บเอา candidates ไปวาดเป็นปุ่ม
       */
      if (error instanceof ConflictException) {
        const pending = await this.stockChoice.createChoicePending({
          shopId,
          actorId: ctx.userId,
          source: 'WEB',
          message: content,
        });

        if (pending) {
          const { candidates } = this.stockChoice.readChoicePayload(
            pending.payload,
          );
          const reply = this.stockChoice.renderChoices(pending);

          await this.prisma.chatMessage.create({
            data: {
              shopId,
              userId: ctx.userId,
              channel: 'WEB',
              role: 'ASSISTANT',
              content: reply,
              pendingActionId: pending.id,
            },
          });

          return { pendingAction: pending, reply, candidates };
        }
      }

      this.logger.warn(
        `chat command failed (shop=${shopId}): ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );

      const reply = await this.buildErrorReply(error, content, shopId);

      await this.prisma.chatMessage.create({
        data: {
          shopId,
          userId: ctx.userId,
          channel: 'WEB',
          role: 'ASSISTANT',
          content: reply,
        },
      });

      return { pendingAction: null, reply, candidates: [] };
    }
  }

  /**
   * ผู้ใช้เลือกสินค้าแล้ว — เติม shopProductId ให้รายการที่ค้างอยู่ แล้วบันทึก
   * ข้อความตอบกลับของบอทลงประวัติแชทด้วย
   *
   * ถ้าไม่บันทึกข้อความ ประวัติแชทจะจบลงที่รายการตัวเลือกเฉยๆ ผู้ใช้เปิดหน้ามา
   * ใหม่จะไม่รู้ว่าตัวเองเลือกอะไรไปแล้ว และไม่รู้ว่าเหลือแค่กดยืนยัน
   */
  async selectProduct(
    userId: string,
    shopId: string,
    dto: SelectChatProductDto,
  ) {
    const ctx = await this.chatAccess.assertCanUseChatbot(userId, shopId);

    const pending = await this.chatCommand.update(
      shopId,
      dto.pendingActionId,
      ctx.userId,
      dto.shopProductId
        ? { shopProductId: dto.shopProductId }
        : { destinationShopId: dto.destinationShopId },
    );

    const reply = await this.buildSummary(shopId, pending);

    await this.prisma.chatMessage.create({
      data: {
        shopId,
        userId: ctx.userId,
        channel: 'WEB',
        role: 'ASSISTANT',
        content: reply,
        pendingActionId: pending.id,
      },
    });

    // เลือกสินค้าเสร็จแล้วอาจยังเหลือขั้นเลือกร้านปลายทางอีกขั้น
    const destinationShops =
      pending.intent === 'TRANSFER_STOCK' && !pending.destinationShopId
        ? (await this.destinations.listOptions(shopId)).shops
        : [];

    return { pendingAction: pending, reply, candidates: [], destinationShops };
  }

  /**
   * ยืนยันหรือยกเลิกรายการที่ค้างอยู่ แล้วบันทึกคำตอบของบอทลงประวัติแชท
   *
   * ตอนยืนยันจะบอกจำนวนก่อน→หลังไปด้วย เพราะเป็นจุดเดียวที่สต็อกเปลี่ยนจริง
   * ผู้ใช้ควรเห็นตัวเลขยืนยันทันทีโดยไม่ต้องไปเปิดหน้าสินค้าเช็คเอง
   */
  async applyCommand(userId: string, shopId: string, dto: ApplyChatCommandDto) {
    const ctx = await this.chatAccess.assertCanUseChatbot(userId, shopId);

    const pending = await this.prisma.pendingAction.findFirst({
      where: { id: dto.pendingActionId, shopId },
      select: { productQuery: true, shopProductId: true },
    });

    const productName = pending?.shopProductId
      ? (
          await this.prisma.shopProduct.findFirst({
            where: { id: pending.shopProductId, shopId },
            select: { product: { select: { name: true } } },
          })
        )?.product.name
      : undefined;

    const label = productName ?? pending?.productQuery ?? '';

    if (dto.action === 'CANCEL') {
      await this.chatCommand.cancel(shopId, dto.pendingActionId, ctx.userId);

      const reply = `ยกเลิกรายการแล้ว${label ? ` — ${label}` : ''}`;
      await this.recordAssistant(shopId, ctx.userId, reply);

      return { pendingAction: null, reply, candidates: [] };
    }

    const result = (await this.chatCommand.confirm(
      shopId,
      dto.pendingActionId,
      ctx.userId,
    )) as {
      items?: Array<{
        movement?: { shopProductId?: string };
        stock?: { quantityBefore: number; quantityAfter: number };
      }>;
    };

    // confirm() คืน items เป็น array เพราะหนึ่งคำสั่งมีได้หลายรายการ
    // ต้องรายงานครบทุกตัว ไม่งั้นผู้ใช้ไม่รู้ว่าอะไรถูกตัดไปบ้าง
    const adjusted = result.items ?? [];
    const names = await this.resolveProductNames(
      shopId,
      adjusted
        .map((item) => item.movement?.shopProductId)
        .filter((id): id is string => Boolean(id)),
    );

    const lines = adjusted.map((item) => {
      const stock = item.stock;

      if (!stock) return `• ${label}`;

      const delta = stock.quantityAfter - stock.quantityBefore;
      const sign = delta >= 0 ? '+' : '-';
      const name = names.get(item.movement?.shopProductId ?? '') ?? label;

      return `• ${name} ${sign}${Math.abs(delta)} (${stock.quantityBefore} → ${stock.quantityAfter})`;
    });

    const reply = [
      '✅ ยืนยันแล้ว',
      ...(lines.length > 0 ? lines : [`• ${label}`]),
    ].join('\n');

    await this.recordAssistant(shopId, ctx.userId, reply);

    return { pendingAction: null, reply, candidates: [] };
  }

  private async recordAssistant(
    shopId: string,
    userId: string,
    content: string,
    pendingActionId?: string,
  ) {
    await this.prisma.chatMessage.create({
      data: {
        shopId,
        userId,
        channel: 'WEB',
        role: 'ASSISTANT',
        content,
        pendingActionId,
      },
    });
  }

  /**
   * อ่านรายการจาก parsedItems ไม่ใช่ฟิลด์ระดับบน
   *
   * ฟิลด์ระดับบน (productQuery/operation/quantity) เก็บแค่ "รายการแรก" เท่านั้น
   * ถ้าใช้มันสรุป ผู้ใช้ที่พิมพ์ "เพิ่มโค้ก 10; ลดน้ำเปล่า 3" จะเห็นแค่โค้ก
   * แล้วกดยืนยันโดยไม่รู้ว่าน้ำเปล่าจะถูกตัดไปด้วย
   *
   * แสดงชื่อสินค้าจริงแทนคำที่ผู้ใช้พิมพ์ ผู้ใช้จะได้เห็นว่าระบบเข้าใจตรงกัน
   */
  private async buildSummary(
    shopId: string,
    pending: {
      intent?: string;
      destinationShopId?: string | null;
      productQuery: string;
      operation: 'INCREASE' | 'DECREASE';
      quantity: number;
      shopProductId: string | null;
      parsedItems?: unknown;
    },
  ): Promise<string> {
    const items = this.readPendingItems(pending);
    const names = await this.resolveProductNames(
      shopId,
      items.map((item) => item.shopProductId).filter(Boolean),
    );

    /**
     * [อั้ม] ขายต้องเห็นยอดเงินก่อนกดยืนยัน ไม่งั้นผู้ใช้ยืนยันบิลที่ไม่รู้ราคา
     * ราคาที่โชว์เป็นยอดประมาณการ ของจริงถูก snapshot ตอน SalesService.create()
     * (ข้อความต้องตรงกับฝั่ง LINE — ผู้ใช้คนเดียวกันสลับช่องทางไปมาได้)
     */
    let lines: string[];

    if (pending.intent === 'SELL') {
      const priced = await this.prisma.shopProduct.findMany({
        where: {
          id: { in: items.map((item) => item.shopProductId).filter(Boolean) },
          shopId,
        },
        select: { id: true, sellPrice: true },
      });
      const prices = new Map(priced.map((row) => [row.id, row.sellPrice]));
      let total = 0;

      lines = items.map((item) => {
        const label = names.get(item.shopProductId) ?? item.productQuery;
        const unit = Number(prices.get(item.shopProductId) ?? 0);
        const line = unit * item.quantity;
        total += line;

        return `• ${label} x${item.quantity} = ${line.toLocaleString()} บาท (${unit.toLocaleString()}/หน่วย)`;
      });
      lines.push(`รวม ${total.toLocaleString()} บาท (ยอดประมาณการ)`);
    } else if (pending.intent === 'TRANSFER_STOCK') {
      const destination = pending.destinationShopId
        ? await this.prisma.shop.findUnique({
            where: { id: pending.destinationShopId },
            select: { name: true },
          })
        : null;

      lines = items.map((item) => {
        const label = names.get(item.shopProductId) ?? item.productQuery;

        // ยังไม่เลือกปลายทาง — หน้าเว็บกำลังจะวาดปุ่มให้เลือกอยู่
        return destination
          ? `• ย้าย ${label} ${item.quantity} ไปร้าน ${destination.name}`
          : `• ย้าย ${label} ${item.quantity} — เลือกร้านปลายทางด้านล่าง`;
      });
    } else {
      lines = items.map((item) => {
        const sign = item.operation === 'INCREASE' ? '+' : '-';
        const label = names.get(item.shopProductId) ?? item.productQuery;

        return `• ${label} ${sign}${item.quantity}`;
      });
    }

    return [...lines, '', 'กดยืนยันเพื่อบันทึก หรือกดยกเลิกเพื่อยกเลิก'].join(
      '\n',
    );
  }

  /** parsedItems ว่างได้ (เช่นรายการที่รอเลือกสินค้า) จึงต้องมีทางถอยเสมอ */
  private readPendingItems(pending: {
    productQuery: string;
    operation: 'INCREASE' | 'DECREASE';
    quantity: number;
    shopProductId: string | null;
    parsedItems?: unknown;
  }): PendingItem[] {
    const parsed = pendingItemsSchema.safeParse(pending.parsedItems);

    if (parsed.success) return parsed.data;

    return [
      {
        shopProductId: pending.shopProductId ?? '',
        productQuery: pending.productQuery,
        operation: pending.operation,
        quantity: pending.quantity,
      },
    ];
  }

  private async resolveProductNames(
    shopId: string,
    shopProductIds: string[],
  ): Promise<Map<string, string>> {
    const ids = shopProductIds.filter(Boolean);

    if (ids.length === 0) return new Map();

    const rows = await this.prisma.shopProduct.findMany({
      where: { id: { in: ids }, shopId },
      select: { id: true, product: { select: { name: true } } },
    });

    return new Map(rows.map((row) => [row.id, row.product.name]));
  }

  /**
   * แปลง exception เป็นข้อความไทย ให้ตรงกับที่ฝั่ง LINE ตอบ
   *
   * เดิมส่งข้อความดิบของ exception ออกไปตรงๆ ผู้ใช้จึงเห็นภาษาอังกฤษอย่าง
   * "Shop product not found" ซึ่งอ่านไม่รู้เรื่องและไม่บอกว่าต้องทำอะไรต่อ
   */
  private async buildErrorReply(
    error: unknown,
    message: string,
    shopId: string,
  ): Promise<string> {
    if (error instanceof NotFoundException) {
      return `ไม่พบสินค้าที่ตรงกับ "${message}" ในร้าน กรุณาตรวจสอบชื่อสินค้าแล้วลองใหม่`;
    }

    // ชื่อกำกวมเกิดง่ายเมื่อสินค้าเยอะขึ้น เพราะค้นแบบ "มีคำนี้อยู่ในชื่อ"
    if (error instanceof ConflictException) {
      return `มีสินค้าหลายรายการที่ตรงกับ "${message}" กรุณาพิมพ์ชื่อให้เจาะจงขึ้น หรือใช้บาร์โค้ดแทน`;
    }

    // แพ็กเกจไม่รองรับ / พนักงานไม่มีสิทธิ์ / แพ็กเกจหมดอายุ
    if (error instanceof ForbiddenException) {
      const detail = error.getResponse() as { message?: string } | string;
      const text =
        typeof detail === 'string' ? detail : (detail?.message ?? '');

      if (text.includes('does not include chatbot')) {
        return 'แพ็กเกจของคุณยังไม่รองรับแชทบอท กรุณาอัปเกรดเป็น Plus หรือ Pro';
      }
      if (text.includes('read-only')) {
        return 'แพ็กเกจหมดอายุแล้ว ตอนนี้ดูข้อมูลได้อย่างเดียว กรุณาต่ออายุก่อนปรับสต็อก';
      }

      return 'คุณไม่มีสิทธิ์ใช้แชทบอทในร้านนี้';
    }

    /**
     * ก่อนยอมแพ้ ลองมองว่าเป็นชื่อสินค้า — คนพิมพ์ "โค้ก" เฉย ๆ กำลังถามว่าร้าน
     * มีไหม เหลือเท่าไหร่ ตอบว่าไม่เข้าใจทั้งที่ตอบได้ทำให้เขาพิมพ์ซ้ำเดิมไปเรื่อย ๆ
     * ใช้ StockQueryService ตัวเดียวกับฝั่ง LINE คำตอบสองช่องทางจึงตรงกันเสมอ
     */
    if (error instanceof BadRequestException) {
      const guess = await this.stockQuery.answerUnknownCommand(shopId, message);

      return guess.matched ? guess.text : `${guess.text}\n\n${HELP_TEXT}`;
    }

    return 'ตีความคำสั่งไม่สำเร็จ กรุณาลองพิมพ์ใหม่ เช่น "เพิ่มโค้ก 10"';
  }
}
