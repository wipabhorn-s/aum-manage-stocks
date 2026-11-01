import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { ChatCommandService } from '../chat-command/chat-command.service';
import { STOCK_COMMAND_PARSER } from '../chat-command/parsers/stock-command-parser';
import type { StockCommandParser } from '../chat-command/parsers/stock-command-parser';
import { Prisma } from '../database/generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LineReplyService } from './line-reply.service';
import { LineUserMessageError } from './line-user-message.error';
import { LINE_IDENTITY_PORT } from './ports/line-identity.port';
import type { LineIdentityPort } from './ports/line-identity.port';
import { ShopDestinationService } from '../chat-command/shop-destination.service';
import { StockQueryService } from '../chat-command/stock-query.service';
import { StockQueryRequestedError } from '../chat-command/stock-query-requested.error';
import type { ShopSelectionRequired } from './ports/line-identity.port';

const lineWebhookSchema = z.object({
  destination: z.string().min(1),
  events: z.array(
    z.object({
      type: z.string(),
      replyToken: z.string().optional(),
      source: z.object({ userId: z.string().optional() }).passthrough(),
      message: z
        .object({ type: z.string(), text: z.string().optional() })
        .optional(),
    }),
  ),
});

const CONFIRM_KEYWORDS = ['ยืนยัน', 'confirm', 'ตกลง', 'ใช่'];
const CANCEL_KEYWORDS = ['ยกเลิก', 'cancel', 'ไม่'];
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

// แสดงตัวเลือกให้ครบทุกรายการ เพราะผู้ใช้มักจำชื่อสินค้าเต็มๆ ไม่ได้
// การตัดเหลือไม่กี่รายการทำให้คนที่ไม่รู้ชื่อเต็มหาไม่เจอ
//
// LINE ส่งข้อความได้ครั้งละ 5,000 ตัวอักษร จึงต้องมีเพดานกันข้อความยาวจนยิงไม่ออก
// (ร้าน Pro มีสินค้าได้ถึง 5,000 ตัว คำค้นกว้างๆ อย่าง "น้ำ" ชนได้เป็นร้อยรายการ)
const CANDIDATE_FETCH_LIMIT = 100;
const LINE_TEXT_LIMIT = 4800;

/** รูปแบบ parsedItems ที่ ChatCommandService เขียนไว้ */
const pendingItemsSchema = z
  .array(
    z.object({
      shopProductId: z.string(),
      productQuery: z.string(),
      operation: z.enum(['INCREASE', 'DECREASE']),
      quantity: z.number().int(),
    }),
  )
  .min(1);

const candidateSchema = z.object({
  shopProductId: z.string(),
  name: z.string(),
  unit: z.string(),
  stockQty: z.number(),
});

const choicePayloadSchema = z.object({
  candidates: z.array(candidateSchema).min(1),
  totalMatches: z.number().int().optional(),
});

type Candidate = z.infer<typeof candidateSchema>;

/** รูปแบบที่ ChatCommandService.confirm() คืนมา — หนึ่งคำสั่งปรับได้หลายรายการ */
type ConfirmResult = {
  items?: Array<{
    movement?: { shopProductId?: string };
    stock?: { quantityBefore: number; quantityAfter: number };
  }>;
};

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
  'ผมจะสรุปให้ดูก่อน แล้วพิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อยกเลิก',
].join('\n');

/**
 * [อั้ม] แปลง ForbiddenException ของ guard ให้เป็นข้อความที่ผู้ใช้ LINE เข้าใจ
 *
 * เหตุผลเดียวกับที่ createPending() แปลง NotFoundException ไว้แล้ว — ข้อความ
 * ตั้งต้น ("ตีความคำสั่งไม่สำเร็จ") ทำให้เข้าใจผิดว่าพิมพ์ผิด ทั้งที่ตีความสำเร็จ
 * ตั้งแต่แรก แค่สิทธิ์ไม่ถึง ผู้ใช้จึงพิมพ์ซ้ำเดิมไปเรื่อย ๆ โดยไม่มีทางสำเร็จ
 *
 * แปลที่ชั้นนี้แทนการแก้ guard ใน src/stock/ports/ เพราะฝั่ง WEB ต้องได้ 403
 * ตามเดิม และ guard ตัวนั้นเป็นของโมดูล stock (AGENTS.md: อย่าแก้ข้ามโมดูล)
 *
 * ถ้อยคำล้อกับ ChatService.buildErrorReply() ให้ตอบเหมือนกันทั้งสองช่องทาง
 * — **แก้ที่นี่แล้วต้องไปแก้ที่นั่นด้วย** หลักเดียวกับที่ StockQueryService
 * ถูกใช้ร่วมกันเพื่อให้คำตอบฝั่งเว็บกับฝั่ง LINE ตรงกันเสมอ
 *
 * เทียบจากข้อความอังกฤษที่ guard โยนมา ถ้าฝั่ง stock แก้ถ้อยคำเมื่อไหร่
 * จะตกมาที่ข้อความตั้งต้นบรรทัดสุดท้าย ซึ่งยังอ่านรู้เรื่องอยู่ ไม่พังเงียบ
 */
function forbiddenMessage(error: ForbiddenException): string {
  const response = error.getResponse();
  const code =
    typeof response === 'object' && response !== null
      ? (response as { code?: unknown }).code
      : undefined;

  if (code === 'SHOP_PAUSED') {
    return 'ร้านนี้ถูกพักไว้ชั่วคราว กรุณาเปิดร้านอีกครั้งก่อนปรับสต็อก';
  }

  const reason = error.message;

  // ต้องเช็คก่อน 'Subscription' ตัวล่าง เพราะข้อความนี้มีคำว่า Subscription ด้วย
  if (reason.includes('read-only')) {
    return 'แพ็กเกจหมดอายุแล้ว ตอนนี้ดูข้อมูลได้อย่างเดียว กรุณาต่ออายุก่อนปรับสต็อก';
  }

  /**
   * guard ของฝั่ง stock ใช้ข้อความเดียวกันทั้งกรณีแพ็กเกจ Free และกรณีแพ็กเกจ
   * หมดอายุ (isSubscriptionReadOnly) — ต่างจาก ChatAccessService ของฝั่งเว็บ
   * ที่แยกสองเคสให้ จึงแยกจากตรงนี้ไม่ได้ ต้องพ่วงเรื่องวันหมดอายุไว้ด้วย
   * ไม่งั้นคนที่แพ็กเกจหมดอายุจะถูกบอกให้ไปอัปเกรดทั้งที่ซื้อไปแล้ว
   */
  if (reason.includes('does not include chatbot')) {
    return [
      'แพ็กเกจของคุณยังไม่รองรับแชทบอท กรุณาอัปเกรดเป็น Plus หรือ Pro',
      'ถ้าเคยอัปเกรดไว้แล้ว กรุณาตรวจสอบว่าแพ็กเกจหมดอายุหรือยัง',
    ].join('\n');
  }

  if (reason.includes('Chatbot access')) {
    return 'คุณไม่มีสิทธิ์ใช้แชทบอทในร้านนี้ กรุณาติดต่อเจ้าของร้านให้เปิดสิทธิ์ให้';
  }

  if (reason.includes('Manual stock adjustment')) {
    return 'คุณไม่มีสิทธิ์ปรับสต็อกในร้านนี้ กรุณาติดต่อเจ้าของร้านให้เปิดสิทธิ์ให้';
  }

  if (reason.includes('Stock history access')) {
    return 'คุณไม่มีสิทธิ์ดูประวัติสต็อกในร้านนี้ กรุณาติดต่อเจ้าของร้านให้เปิดสิทธิ์ให้';
  }

  return 'คุณไม่มีสิทธิ์ทำรายการนี้ในร้านนี้ กรุณาติดต่อเจ้าของร้าน';
}

@Injectable()
export class LineWebhookService {
  private readonly logger = new Logger(LineWebhookService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly commands: ChatCommandService,
    private readonly prisma: PrismaService,
    private readonly reply: LineReplyService,
    @Inject(LINE_IDENTITY_PORT)
    private readonly identity: LineIdentityPort,
    @Inject(STOCK_COMMAND_PARSER)
    private readonly parser: StockCommandParser,
    private readonly stockQuery: StockQueryService,
    // [อั้ม] รายชื่อร้านปลายทางของคำสั่งย้าย
    private readonly destinations: ShopDestinationService,
  ) {}

  async handle(rawBody: Buffer, signature: string | undefined) {
    this.verifySignature(rawBody, signature);
    const payload = lineWebhookSchema.parse(
      JSON.parse(rawBody.toString('utf8')),
    );
    const results: Array<{ pendingActionId?: string }> = [];

    for (const event of payload.events) {
      if (
        event.type !== 'message' ||
        event.message?.type !== 'text' ||
        !event.message.text ||
        !event.source.userId
      ) {
        continue;
      }

      results.push(
        await this.handleTextEvent({
          destination: payload.destination,
          lineUserId: event.source.userId,
          text: event.message.text,
          replyToken: event.replyToken,
        }),
      );
    }

    // LINE จะยิงซ้ำถ้าไม่ได้ 2xx จึงต้องตอบ accepted เสมอแม้บางเหตุการณ์จะล้มเหลว
    return { accepted: true, results };
  }

  private async handleTextEvent(input: {
    destination: string;
    lineUserId: string;
    text: string;
    replyToken?: string;
  }): Promise<{ pendingActionId?: string }> {
    let context: { shopId: string; actorId: string } | undefined;

    try {
      const identity = await this.identity.resolve({
        destination: input.destination,
        lineUserId: input.lineUserId,
        message: input.text,
      });

      /**
       * [อั้ม] บัญชีที่มีหลายร้าน — ข้อความจาก LINE ไม่มี context ของร้านติดมา
       * (บอทตัวเดียวใช้ร่วมทุกร้าน destination จึงซ้ำกันหมด) ต้องถามก่อน
       */
      const scope =
        identity.kind === 'NEEDS_SHOP'
          ? await this.resolveShopChoice(identity, input.text, input.replyToken)
          : {
              shopId: identity.shopId,
              actorId: identity.actorId,
              message: identity.message,
            };

      // ถามไปแล้วว่าร้านไหน รอผู้ใช้ตอบรอบหน้า
      if (!scope) return {};

      const { shopId, message } = scope;
      const actorId = scope.actorId;

      if (!actorId) {
        throw new LineUserMessageError(
          'ไม่สามารถระบุผู้ใช้ได้ กรุณาติดต่อผู้ดูแลระบบ',
        );
      }

      // รู้ร้านและผู้ใช้แล้ว — ถ้าพังหลังจากนี้ยังบันทึกข้อความตอบกลับลงประวัติได้
      context = { shopId, actorId };

      const normalized = message.trim().toLowerCase();

      await this.record(shopId, actorId, 'USER', input.text);

      if (CONFIRM_KEYWORDS.includes(normalized)) {
        return await this.confirmLatest(shopId, actorId, input.replyToken);
      }

      if (CANCEL_KEYWORDS.includes(normalized)) {
        return await this.cancelLatest(shopId, actorId, input.replyToken);
      }

      // ทักทาย/ขอความช่วยเหลือไม่ใช่คำสั่งสต็อก ตอบวิธีใช้ไปเลยดีกว่าปล่อยให้
      // parser ล้มแล้วขึ้นเป็น error ทั้งที่ผู้ใช้ไม่ได้ทำอะไรผิด
      if (HELP_KEYWORDS.includes(normalized)) {
        await this.respond(shopId, actorId, input.replyToken, HELP_TEXT);

        return {};
      }

      const chosen = await this.trySelectCandidate(
        shopId,
        actorId,
        normalized,
        input.replyToken,
      );

      if (chosen) return chosen;

      // ต้องอยู่หลังการเลือกสินค้าเสมอ — ดูเหตุผลใน trySelectDestination
      const destination = await this.trySelectDestination(
        shopId,
        actorId,
        normalized,
        input.replyToken,
      );

      if (destination) return destination;

      let pending;

      try {
        pending = await this.createPending(shopId, actorId, message);
      } catch (error) {
        /**
         * [อั้ม] ถามยอดคงเหลือ ไม่ใช่สั่งแก้ — ตอบทันที ไม่ต้องยืนยัน
         * productQuery ติดมากับ error แล้ว จึงไม่ต้อง parse ซ้ำ (parser เรียก LLM)
         */
        if (error instanceof StockQueryRequestedError) {
          const reply = await this.stockQuery.answer(
            shopId,
            error.productQuery,
          );

          await this.respond(shopId, actorId, input.replyToken, reply);

          return {};
        }

        throw error;
      }

      // shopProductId ว่าง = ชื่อกำกวม ยังเลือกไม่ได้ว่าตัวไหน ต้องให้ผู้ใช้เลือกก่อน
      if (!pending.shopProductId) {
        await this.respond(
          shopId,
          actorId,
          input.replyToken,
          this.renderChoices(pending),
          pending.id,
        );

        return { pendingActionId: pending.id };
      }

      // ย้ายแต่ยังไม่รู้ปลายทาง — ถามก่อน ยังยืนยันไม่ได้
      if (pending.intent === 'TRANSFER_STOCK' && !pending.destinationShopId) {
        await this.respond(
          shopId,
          actorId,
          input.replyToken,
          await this.renderDestinationChoices(shopId, pending),
          pending.id,
        );

        return { pendingActionId: pending.id };
      }

      const summary = [
        ...(await this.renderItems(shopId, pending)),
        '',
        'พิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อยกเลิก',
      ].join('\n');

      await this.respond(
        shopId,
        actorId,
        input.replyToken,
        summary,
        pending.id,
      );

      return { pendingActionId: pending.id };
    } catch (error) {
      await this.replyWithError(input.replyToken, error, context);

      return {};
    }
  }

  /**
   * [อั้ม] จัดการขั้น "ร้านไหน" ของบัญชีที่มีหลายร้าน
   *
   * คืน scope เมื่อรู้ร้านแล้ว หรือคืน null เมื่อเพิ่งถามไป ต้องรอผู้ใช้ตอบรอบหน้า
   *
   * ## ทำไมต้องจำร้านที่เลือกไว้ด้วย ไม่ใช่แค่จำคำสั่ง
   *
   * ข้อความ LINE มาแบบไร้บริบททุกครั้ง ถ้าจำแค่คำสั่ง พอผู้ใช้เลือกร้านแล้วระบบ
   * ตอบ "พิมพ์ยืนยัน" แต่พอพิมพ์ "ยืนยัน" จริง ๆ ระบบจะถามว่าร้านไหนซ้ำอีกรอบ
   * วนไม่จบ — selectedShopId จึงต้องอยู่ต่อหลังเลือกเสร็จ
   *
   * ## ตัวเลขมีสองความหมาย แยกด้วย selectedShopId
   *
   * ยังไม่ได้เลือกร้าน → เลข = เลือกร้าน
   * เลือกร้านแล้ว → เลข = เลือกสินค้า (ส่งต่อให้ trySelectCandidate)
   *
   * ## คำสั่งใหม่ถามร้านใหม่เสมอ
   *
   * ไม่เดาว่าคำสั่งถัดไปหมายถึงร้านเดิม — สั่งปรับสต็อกผิดร้านแก้ทีหลังยาก
   * ร้านที่จำไว้ใช้เฉพาะกับข้อความต่อเนื่อง (ยืนยัน/ยกเลิก/เลือกเลข) เท่านั้น
   */
  private async resolveShopChoice(
    identity: ShopSelectionRequired,
    rawText: string,
    replyToken: string | undefined,
  ): Promise<{ shopId: string; actorId: string; message: string } | null> {
    const answer = rawText.trim();
    const normalized = answer.toLowerCase();
    const isNumber = /^[0-9]+$/.test(answer);
    const isFollowUp =
      isNumber ||
      CONFIRM_KEYWORDS.includes(normalized) ||
      CANCEL_KEYWORDS.includes(normalized);

    const prompt = isFollowUp
      ? await this.prisma.chatShopPrompt.findUnique({
          where: { userId: identity.actorId },
        })
      : null;

    const usable = prompt && prompt.expiresAt.getTime() > Date.now();

    if (prompt && !usable) {
      // หมดอายุแล้ว เก็บกวาดทิ้งไปเลยจะได้ไม่ค้างในตาราง
      await this.prisma.chatShopPrompt.delete({ where: { id: prompt.id } });
    }

    if (usable && prompt) {
      // เลือกร้านไปแล้ว — ข้อความต่อเนื่องใช้ร้านเดิม ไม่ถามซ้ำ
      if (prompt.selectedShopId) {
        return {
          shopId: prompt.selectedShopId,
          actorId: identity.actorId,
          message: rawText,
        };
      }

      // ยังไม่ได้เลือก และพิมพ์ตัวเลขมา = กำลังเลือกร้าน
      if (isNumber) {
        const chosen = await this.identity.selectShop({
          actorId: identity.actorId,
          index: Number(answer),
        });

        if (!chosen) {
          await this.reply.reply(
            replyToken ?? '',
            `เลือกได้เฉพาะหมายเลข 1-${identity.shops.length} ครับ`,
          );

          return null;
        }

        await this.prisma.chatShopPrompt.update({
          where: { id: prompt.id },
          data: { selectedShopId: chosen.shopId },
        });

        return {
          shopId: chosen.shopId,
          actorId: identity.actorId,
          message: prompt.originalMessage,
        };
      }
    }

    // คำสั่งใหม่ — จำไว้แล้วถามว่าร้านไหน (ล้าง selectedShopId ของรอบก่อนทิ้ง)
    const ttl = this.config.get<number>('PENDING_ACTION_TTL_MINUTES', 15);
    const expiresAt = new Date(Date.now() + ttl * 60_000);

    await this.prisma.chatShopPrompt.upsert({
      where: { userId: identity.actorId },
      create: {
        userId: identity.actorId,
        originalMessage: rawText,
        expiresAt,
      },
      update: {
        originalMessage: rawText,
        selectedShopId: null,
        expiresAt,
      },
    });

    const lines = identity.shops.map(
      (shop, index) => `${index + 1}. ${shop.name}`,
    );

    await this.reply.reply(
      replyToken ?? '',
      [
        'บัญชีนี้มีหลายร้าน ต้องการทำที่ร้านไหนครับ',
        'พิมพ์หมายเลขที่ต้องการ',
        '',
        ...lines,
      ].join('\n'),
    );

    return null;
  }

  /**
   * แปลง NotFoundException ของ ChatCommandService ให้เป็นข้อความที่ผู้ใช้เข้าใจ
   *
   * ฝั่ง WEB ต้องได้ 404 ตามเดิม จึงแปลงที่ชั้นนี้แทนการแก้ ChatCommandService
   * ที่ใช้ร่วมกับโมดูลอื่น ข้อความเดิม ("ตีความคำสั่งไม่สำเร็จ") ทำให้เข้าใจผิด
   * เพราะจริงๆ ตีความสำเร็จแล้ว แค่ไม่มีสินค้าชื่อนั้นในร้าน ผู้ใช้จึงพิมพ์ซ้ำเดิม
   */
  private async createPending(
    shopId: string,
    actorId: string,
    message: string,
  ) {
    try {
      return await this.commands.create({
        shopId,
        actorId,
        source: 'LINE',
        message,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new LineUserMessageError(
          `ไม่พบสินค้าที่ตรงกับ "${message}" ในร้าน กรุณาตรวจสอบชื่อสินค้าแล้วลองใหม่`,
        );
      }

      // ชื่อกำกวมเกิดง่ายเมื่อสินค้าเยอะขึ้น เพราะ resolveProduct ใช้ contains
      // เช่น "โค้ก" จะแมตช์ทั้ง "โค้ก 325ml" และ "โค้กซีโร่ 325ml"
      if (error instanceof ConflictException) {
        return await this.createChoicePending(shopId, actorId, message);
      }
      /**
       * StockQueryRequestedError สืบทอดจาก BadRequestException — ต้องเช็คก่อน
       * ไม่งั้นกิ่งข้างล่างจะกลืนไปตอบว่า "ไม่เข้าใจคำสั่ง" ทั้งที่เป็นคำถามยอดคงเหลือ
       * ที่ handleTextEvent รออยู่ (บั๊กนี้ทำให้ถามยอดบน LINE ไม่ได้เลย)
       */
      if (error instanceof StockQueryRequestedError) throw error;

      /**
       * ผู้ใช้พิมพ์อะไรที่ไม่ใช่คำสั่งสต็อกเป็นเรื่องปกติ ไม่ใช่ error ของระบบ
       * ถ้าไม่ดักไว้ log จะเต็มไปด้วย ERROR + stack trace ทุกครั้งที่มีคนคุยเล่น
       *
       * ก่อนยอมแพ้ ลองมองว่าเป็นชื่อสินค้า — คนพิมพ์ "โค้ก" เฉย ๆ กำลังถามว่า
       * ร้านมีไหม การตอบว่าไม่เข้าใจทั้งที่ตอบได้ทำให้เขาพิมพ์ซ้ำเดิมไปเรื่อย ๆ
       */
      if (error instanceof BadRequestException) {
        const guess = await this.stockQuery.answerUnknownCommand(
          shopId,
          message,
        );

        throw new LineUserMessageError(
          guess.matched ? guess.text : `${guess.text}\n\n${HELP_TEXT}`,
        );
      }

      throw error;
    }
  }

  private async confirmLatest(
    shopId: string,
    actorId: string,
    replyToken?: string,
  ): Promise<{ pendingActionId?: string }> {
    const pending = await this.findLatestPending(shopId, actorId);

    if (!pending) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        'ไม่มีรายการที่รอยืนยันอยู่',
      );

      return {};
    }

    if (!pending.shopProductId) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        `กรุณาเลือกหมายเลขสินค้าก่อนครับ\n\n${this.renderChoices(pending)}`,
        pending.id,
      );

      return { pendingActionId: pending.id };
    }

    if (pending.intent === 'TRANSFER_STOCK' && !pending.destinationShopId) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        await this.renderDestinationChoices(shopId, pending),
        pending.id,
      );

      return { pendingActionId: pending.id };
    }

    const result = await this.confirmPending(shopId, actorId, pending);
    await this.respond(
      shopId,
      actorId,
      replyToken,
      await this.renderConfirmed(shopId, result, pending),
      pending.id,
    );

    return { pendingActionId: pending.id };
  }

  /**
   * ข้อความยืนยันบอกจำนวนก่อน→หลังด้วย เพราะเป็นจุดเดียวที่สต็อกเปลี่ยนจริง
   * ผู้ใช้บน LINE ไม่มีหน้าจอสินค้าให้เปิดเช็ค จึงควรเห็นตัวเลขในแชทเลย
   *
   * ถ้าอ่าน items ไม่ได้ (เช่น api เปลี่ยนรูปแบบ) ถอยไปใช้สรุปแบบไม่มีตัวเลข
   * ดีกว่าไม่ตอบอะไรเลย
   */
  private async renderConfirmed(
    shopId: string,
    result: ConfirmResult,
    pending: {
      productQuery: string | null;
      operation: 'INCREASE' | 'DECREASE';
      quantity: number;
      shopProductId: string | null;
      parsedItems?: unknown;
    },
  ): Promise<string> {
    const adjusted = result.items ?? [];

    if (adjusted.length === 0) {
      return [
        '✅ ยืนยันแล้ว',
        ...(await this.renderItems(shopId, pending)),
      ].join('\n');
    }

    const ids = adjusted
      .map((item) => item.movement?.shopProductId)
      .filter((id): id is string => Boolean(id));
    const rows = ids.length
      ? await this.prisma.shopProduct.findMany({
          where: { id: { in: ids }, shopId },
          select: { id: true, product: { select: { name: true } } },
        })
      : [];
    const names = new Map(rows.map((row) => [row.id, row.product.name]));

    const lines = adjusted.map((item) => {
      const stock = item.stock;
      const name =
        names.get(item.movement?.shopProductId ?? '') ??
        pending.productQuery ??
        '';

      if (!stock) return `• ${name}`;

      const delta = stock.quantityAfter - stock.quantityBefore;
      const sign = delta >= 0 ? '+' : '-';

      return `• ${name} ${sign}${Math.abs(delta)} (${stock.quantityBefore} → ${stock.quantityAfter})`;
    });

    return ['✅ ยืนยันแล้ว', ...lines].join('\n');
  }

  /**
   * หนึ่งคำสั่งมีได้หลายรายการ (คั่นด้วย ";" หรือขึ้นบรรทัดใหม่ — ดู
   * ChatCommandService.create()) ฟิลด์ระดับบนของ PendingAction เก็บแค่รายการแรก
   * ถ้าใช้มันสรุป ผู้ใช้ที่พิมพ์ "เพิ่มโค้ก 10; ลดน้ำเปล่า 3" จะเห็นแค่โค้ก
   * แล้วยืนยันโดยไม่รู้ว่าน้ำเปล่าจะถูกตัดไปด้วย
   */
  private async renderItems(
    shopId: string,
    pending: {
      intent?: string;
      destinationShopId?: string | null;
      productQuery: string | null;
      operation: 'INCREASE' | 'DECREASE';
      quantity: number;
      shopProductId: string | null;
      parsedItems?: unknown;
    },
  ): Promise<string[]> {
    const parsed = pendingItemsSchema.safeParse(pending.parsedItems);
    const items = parsed.success
      ? parsed.data
      : [
          {
            shopProductId: pending.shopProductId ?? '',
            productQuery: pending.productQuery ?? '',
            operation: pending.operation,
            quantity: pending.quantity,
          },
        ];

    const ids = items.map((item) => item.shopProductId).filter(Boolean);
    const rows = ids.length
      ? await this.prisma.shopProduct.findMany({
          where: { id: { in: ids }, shopId },
          select: { id: true, product: { select: { name: true } } },
        })
      : [];
    const names = new Map(rows.map((row) => [row.id, row.product.name]));

    /**
     * [อั้ม] ขายต้องเห็นยอดเงินก่อนกดยืนยัน ไม่งั้นผู้ใช้ยืนยันบิลที่ไม่รู้ราคา
     *
     * ราคาที่โชว์เป็นยอดประมาณการจาก sellPrice ปัจจุบัน ส่วนราคาที่ลงบิลจริง
     * ถูก snapshot ตอน SalesService.create() ทำงาน ถ้ามีคนแก้ราคาระหว่างนั้น
     * สองค่าจะต่างกันได้ — จึงบอกไว้ให้ชัดว่าเป็นยอดประมาณการ
     */
    if (pending.intent === 'SELL') {
      const priced = ids.length
        ? await this.prisma.shopProduct.findMany({
            where: { id: { in: ids }, shopId },
            select: { id: true, sellPrice: true },
          })
        : [];
      const prices = new Map(priced.map((row) => [row.id, row.sellPrice]));
      let total = 0;

      const detail = items.map((item) => {
        const label = names.get(item.shopProductId) ?? item.productQuery;
        const unit = Number(prices.get(item.shopProductId) ?? 0);
        const line = unit * item.quantity;
        total += line;

        return `• ${label} x${item.quantity} = ${line.toLocaleString()} บาท (${unit.toLocaleString()}/หน่วย)`;
      });

      return [...detail, `รวม ${total.toLocaleString()} บาท (ยอดประมาณการ)`];
    }

    if (pending.intent === 'TRANSFER_STOCK') {
      const destination = pending.destinationShopId
        ? await this.prisma.shop.findUnique({
            where: { id: pending.destinationShopId },
            select: { name: true },
          })
        : null;

      return items.map((item) => {
        const label = names.get(item.shopProductId) ?? item.productQuery;

        return `• ย้าย ${label} ${item.quantity} ไปร้าน ${destination?.name ?? '-'}`;
      });
    }

    return items.map((item) => {
      const sign = item.operation === 'INCREASE' ? '+' : '-';
      const label = names.get(item.shopProductId) ?? item.productQuery;

      return `• ${label} ${sign}${item.quantity}`;
    });
  }

  /**
   * ชื่อกำกวม = แมตช์ได้หลายตัว ให้ผู้ใช้เลือกจากรายการแทนการเดาให้
   *
   * เก็บเป็น PendingAction ที่ shopProductId ยังว่าง (schema อนุญาต และ
   * ChatCommandService.confirm() กันไว้อยู่แล้ว) ไม่เก็บใน memory เพราะผู้ใช้
   * อาจตอบกลับมาอีกหลายนาทีต่อมา หรือคนละ process กัน
   */
  private async createChoicePending(
    shopId: string,
    actorId: string,
    message: string,
  ) {
    // ต้อง parse ซ้ำ เพราะ ChatCommandService.create() โยน error ทิ้งก่อนคืนผล
    // การตีความ — เกิดเฉพาะตอนชื่อกำกวมซึ่งไม่บ่อย จึงยอมเรียก LLM รอบที่สอง
    const parsed = await this.parser.parse(message);

    // คำถามยอดคงเหลือถูกดักตอบไปก่อนแล้ว ส่วนคำสั่งย้ายไม่รับเข้าเส้นทางนี้
    // เพราะแถวที่สร้างยังไม่มีร้านปลายทาง (ดูเหตุผลเต็มใน StockChoiceService)
    if (parsed.intent === 'QUERY_STOCK') {
      throw new LineUserMessageError(
        'ตีความคำสั่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      );
    }

    const { candidates, totalMatches } = await this.findCandidates(
      shopId,
      parsed.productQuery,
    );

    if (candidates.length === 0) {
      throw new LineUserMessageError(
        `ไม่พบสินค้าที่ตรงกับ "${parsed.productQuery}" ในร้าน`,
      );
    }

    const ttl = this.config.get<number>('PENDING_ACTION_TTL_MINUTES', 15);

    return this.prisma.pendingAction.create({
      data: {
        shopId,
        actorId,
        source: 'LINE',
        originalMessage: message,
        intent: parsed.intent,
        shopProductId: null,
        productQuery: parsed.productQuery,
        operation:
          parsed.intent === 'ADJUST_STOCK' ? parsed.operation : 'DECREASE',
        quantity: parsed.quantity,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        payload: { ...parsed, candidates, totalMatches },
      },
    });
  }

  /**
   * เงื่อนไขการค้นต้องตรงกับ PrismaStockInventoryAdapter.resolveProduct()
   * ไม่งั้นรายการที่โชว์จะไม่ตรงกับที่ระบบหาเจอจริง — ถ้าฝั่ง stock แก้กติกา
   * การค้น ต้องแก้ที่นี่ด้วย (ทางที่ดีคือย้ายขึ้นไปเป็นเมธอดใน StockInventoryPort)
   */
  private async findCandidates(
    shopId: string,
    productQuery: string,
  ): Promise<{ candidates: Candidate[]; totalMatches: number }> {
    const query = productQuery.trim();
    const where = {
      shopId,
      status: 'ACTIVE' as const,
      product: {
        deletedAt: null,
        OR: [
          { barcode: query },
          { name: { contains: query, mode: 'insensitive' as const } },
        ],
      },
    };

    // นับแยกจากที่ดึงมาแสดง เพราะ take จำกัดไว้ ถ้าใช้ length มานับจะแยกไม่ออก
    // ว่า "เจอ 5 พอดี" หรือ "เจอ 30 แล้วถูกตัดเหลือ 5"
    const [matches, totalMatches] = await Promise.all([
      this.prisma.shopProduct.findMany({
        where,
        select: {
          id: true,
          stockQty: true,
          product: { select: { name: true, unit: true } },
        },
        orderBy: { product: { name: 'asc' } },
        take: CANDIDATE_FETCH_LIMIT,
      }),
      this.prisma.shopProduct.count({ where }),
    ]);

    return {
      candidates: matches.map((match) => ({
        shopProductId: match.id,
        name: match.product.name,
        unit: match.product.unit,
        stockQty: match.stockQty,
      })),
      totalMatches,
    };
  }

  private readChoicePayload(payload: Prisma.JsonValue | null): {
    candidates: Candidate[];
    totalMatches: number;
  } {
    const parsed = choicePayloadSchema.safeParse(payload);

    if (!parsed.success) return { candidates: [], totalMatches: 0 };

    return {
      candidates: parsed.data.candidates,
      totalMatches: parsed.data.totalMatches ?? parsed.data.candidates.length,
    };
  }

  private renderChoices(pending: {
    productQuery: string;
    operation: 'INCREASE' | 'DECREASE';
    quantity: number;
    payload: Prisma.JsonValue | null;
  }): string {
    const { candidates, totalMatches } = this.readChoicePayload(
      pending.payload,
    );
    const sign = pending.operation === 'INCREASE' ? '+' : '-';
    const items = candidates.map(
      (item, index) =>
        `${index + 1}. ${item.name} (เหลือ ${item.stockQty} ${item.unit})`,
    );

    const compose = (shown: string[]): string => {
      const lines = [
        `พบ ${totalMatches} รายการที่ตรงกับ "${pending.productQuery}" ครับ`,
        `พิมพ์หมายเลขที่ต้องการ ${sign}${pending.quantity}`,
        '',
        ...shown,
        '',
      ];

      if (totalMatches > shown.length) {
        lines.push(
          `แสดง ${shown.length} จากทั้งหมด ${totalMatches} รายการ (ข้อความยาวเกินที่ LINE ส่งได้) ถ้าไม่เจอที่ต้องการ ให้พิมพ์ชื่อให้เจาะจงขึ้น หรือใช้บาร์โค้ด`,
        );
      }

      lines.push('หรือพิมพ์ "ยกเลิก" เพื่อยกเลิก');

      return lines.join('\n');
    };

    // ตัดออกทีละรายการเฉพาะเมื่อยาวเกินจริง ไม่ตัดตายตัวไว้ก่อน เพราะส่วนใหญ่
    // ร้านมีสินค้าที่ชื่อชนกันไม่กี่ตัว ผู้ใช้ควรได้เห็นครบ
    const shown = [...items];

    while (shown.length > 1 && compose(shown).length > LINE_TEXT_LIMIT) {
      shown.pop();
    }

    return compose(shown);
  }

  /** ตัวเลขล้วนจะถือเป็นการเลือก ก็ต่อเมื่อมีรายการรอเลือกค้างอยู่จริง */
  /**
   * [อั้ม] เมนูเลือกร้านปลายทาง — บอกร้านที่ยืนอยู่ตอนนี้ด้วยเสมอ
   *
   * บัญชีที่มีหลายสาขาจะเดาไม่ออกว่ากำลังย้ายของออกจากร้านไหน ถ้าไม่บอก
   */
  private async renderDestinationChoices(
    shopId: string,
    pending: { productQuery: string | null; quantity: number },
  ): Promise<string> {
    const { currentShopName, shops } =
      await this.destinations.listOptions(shopId);

    return [
      `ตอนนี้อยู่ที่ร้าน ${currentShopName}`,
      `จะย้าย ${pending.productQuery ?? ''} ${pending.quantity} ไปร้านไหนครับ`,
      '',
      ...shops.map((shop, index: number) => `${index + 1}. ${shop.name}`),
      '',
      'พิมพ์หมายเลขร้านปลายทาง',
    ].join('\n');
  }

  /**
   * [อั้ม] ตัวเลขบน LINE มีสามความหมาย — ตัวนี้คือความหมายที่สาม
   *
   *   1. ยังไม่ได้เลือกร้านที่จะทำงาน (ChatShopPrompt) → เลือกร้านที่จะทำงาน
   *   2. pending ที่ shopProductId ว่าง → เลือกสินค้า (trySelectCandidate)
   *   3. pending ย้ายที่ปลายทางว่าง → เลือกร้านปลายทาง (ตัวนี้)
   *
   * ข้อ 2 กับ 3 ตัดกันเองด้วย shopProductId จึงซ้อนทับกันไม่ได้ และต้องเรียก
   * ตัวนี้ **หลัง** trySelectCandidate เสมอ เพื่อให้ลำดับความหมายคงที่
   */
  private async trySelectDestination(
    shopId: string,
    actorId: string,
    normalized: string,
    replyToken: string | undefined,
  ): Promise<{ pendingActionId?: string } | null> {
    if (!/^[0-9]+$/.test(normalized)) return null;

    const pending = await this.findLatestPending(shopId, actorId);

    if (
      !pending ||
      pending.intent !== 'TRANSFER_STOCK' ||
      !pending.shopProductId ||
      pending.destinationShopId
    ) {
      return null;
    }

    const { shops } = await this.destinations.listOptions(shopId);
    const choice = shops[Number(normalized) - 1];

    if (!choice) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        `เลือกได้เฉพาะหมายเลข 1-${shops.length} ครับ`,
        pending.id,
      );

      return { pendingActionId: pending.id };
    }

    await this.commands.update(shopId, pending.id, actorId, {
      destinationShopId: choice.id,
    });

    await this.respond(
      shopId,
      actorId,
      replyToken,
      [
        ...(await this.renderItems(shopId, {
          ...pending,
          destinationShopId: choice.id,
        })),
        '',
        'พิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อยกเลิก',
      ].join('\n'),
      pending.id,
    );

    return { pendingActionId: pending.id };
  }

  private async trySelectCandidate(
    shopId: string,
    actorId: string,
    normalized: string,
    replyToken: string | undefined,
  ): Promise<{ pendingActionId?: string } | null> {
    if (!/^[0-9]+$/.test(normalized)) return null;

    const pending = await this.findLatestPending(shopId, actorId);

    if (!pending || pending.shopProductId) return null;

    const { candidates } = this.readChoicePayload(pending.payload);
    const choice = candidates[Number(normalized) - 1];

    if (!choice) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        `เลือกได้เฉพาะหมายเลข 1-${candidates.length} ครับ`,
        pending.id,
      );

      return { pendingActionId: pending.id };
    }

    await this.commands.update(shopId, pending.id, actorId, {
      shopProductId: choice.shopProductId,
    });

    await this.respond(
      shopId,
      actorId,
      replyToken,
      [
        `• ${choice.name} ${pending.operation === 'INCREASE' ? '+' : '-'}${pending.quantity}`,
        '',
        'พิมพ์ "ยืนยัน" เพื่อบันทึก หรือ "ยกเลิก" เพื่อยกเลิก',
      ].join('\n'),
      pending.id,
    );

    return { pendingActionId: pending.id };
  }

  /**
   * ตอนกดยืนยันคือจุดที่สต็อกถูกตัดจริง จึงเป็นที่เดียวที่ "สต็อกไม่พอ" โผล่ได้
   *
   * ระหว่างสร้างรายการกับกดยืนยันอาจห่างกันหลายนาที ของอาจถูกขายไปก่อน หรือ
   * สินค้าถูกลบไปแล้ว — ทั้งสองกรณีเป็นสถานการณ์ปกติ ไม่ใช่ error ของระบบ
   */
  private async confirmPending(
    shopId: string,
    actorId: string,
    pending: {
      id: string;
      shopProductId: string | null;
      productQuery: string | null;
    },
  ): Promise<ConfirmResult> {
    try {
      return await this.commands.confirm(shopId, pending.id, actorId);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new LineUserMessageError(await this.outOfStockMessage(pending));
      }

      if (error instanceof NotFoundException) {
        throw new LineUserMessageError(
          `ไม่พบสินค้า "${pending.productQuery ?? ''}" ในร้านแล้ว อาจถูกลบหรือปิดการขายไป`,
        );
      }

      throw error;
    }
  }

  /** บอกจำนวนคงเหลือจริงไปด้วย ไม่งั้นผู้ใช้ต้องเดาว่าลดได้เท่าไหร่ */
  private async outOfStockMessage(pending: {
    shopProductId: string | null;
  }): Promise<string> {
    const fallback = 'สต็อกไม่พอครับ กรุณาตรวจสอบจำนวนคงเหลือ';

    if (!pending.shopProductId) return fallback;

    const current = await this.prisma.shopProduct.findUnique({
      where: { id: pending.shopProductId },
      select: {
        stockQty: true,
        product: { select: { name: true, unit: true } },
      },
    });

    if (!current) return fallback;

    return `สต็อกไม่พอครับ — ${current.product.name} เหลือ ${current.stockQty} ${current.product.unit}`;
  }

  private async cancelLatest(
    shopId: string,
    actorId: string,
    replyToken?: string,
  ): Promise<{ pendingActionId?: string }> {
    const pending = await this.findLatestPending(shopId, actorId);

    if (!pending) {
      await this.respond(
        shopId,
        actorId,
        replyToken,
        'ไม่มีรายการที่รอยืนยันอยู่',
      );

      return {};
    }

    await this.commands.cancel(shopId, pending.id, actorId);
    await this.respond(
      shopId,
      actorId,
      replyToken,
      'ยกเลิกรายการแล้ว',
      pending.id,
    );

    return { pendingActionId: pending.id };
  }

  private findLatestPending(shopId: string, actorId: string) {
    return this.prisma.pendingAction.findFirst({
      where: { shopId, actorId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async respond(
    shopId: string,
    actorId: string,
    replyToken: string | undefined,
    text: string,
    pendingActionId?: string,
  ): Promise<void> {
    await this.record(shopId, actorId, 'ASSISTANT', text, pendingActionId);

    if (replyToken) await this.reply.reply(replyToken, text);
  }

  private async replyWithError(
    replyToken: string | undefined,
    error: unknown,
    context?: { shopId: string; actorId: string },
  ): Promise<void> {
    const forbidden =
      error instanceof ForbiddenException ? forbiddenMessage(error) : null;

    const text =
      error instanceof LineUserMessageError
        ? error.message
        : (forbidden ??
          'ตีความคำสั่งไม่สำเร็จ กรุณาลองพิมพ์ใหม่ เช่น "เพิ่มโค้ก 10"');

    /**
     * สิทธิ์ไม่ถึงไม่ใช่ความผิดพลาดของระบบ — เป็นผลลัพธ์ที่ถูกต้องของ guard
     * log เป็น warn พอ ไม่ต้องมี stack trace ให้รก
     */
    if (error instanceof ForbiddenException) {
      this.logger.warn(`LINE command rejected: ${error.message}`);
    } else if (!(error instanceof LineUserMessageError)) {
      this.logger.error(
        `LINE event failed: ${String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // ข้อความ error ก็เป็นส่วนหนึ่งของบทสนทนา ถ้าไม่บันทึก ประวัติแชทจะมีข้อความ
    // ผู้ใช้ค้างอยู่โดยไม่มีคำตอบ — บันทึกได้เฉพาะเมื่อรู้ร้าน/ผู้ใช้แล้วเท่านั้น
    if (context) {
      await this.record(context.shopId, context.actorId, 'ASSISTANT', text);
    }

    if (replyToken) await this.reply.reply(replyToken, text);
  }

  private async record(
    shopId: string,
    userId: string,
    role: 'USER' | 'ASSISTANT',
    content: string,
    pendingActionId?: string,
  ): Promise<void> {
    await this.prisma.chatMessage.create({
      data: { shopId, userId, channel: 'LINE', role, content, pendingActionId },
    });
  }

  private verifySignature(
    rawBody: Buffer,
    signature: string | undefined,
  ): void {
    const secret = this.config.get<string>('LINE_CHANNEL_SECRET');
    if (!secret) {
      throw new ServiceUnavailableException('LINE webhook is not configured');
    }
    if (!signature) throw new UnauthorizedException('Missing LINE signature');
    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid LINE signature');
    }
  }
}
