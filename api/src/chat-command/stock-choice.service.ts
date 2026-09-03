import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { PrismaService } from '../database/prisma.service';
import { STOCK_COMMAND_PARSER } from './parsers/stock-command-parser';
import type { StockCommandParser } from './parsers/stock-command-parser';

/**
 * [อั้ม] ตัวเลือกสินค้าเมื่อชื่อกำกวม — ใช้ร่วมกันทุกช่องทางแชท (WEB / LINE)
 *
 * resolveProduct() ค้นแบบ "มีคำนี้อยู่ในชื่อ" พอสินค้าเยอะขึ้นคำเดียวจะชนหลายตัว
 * (เช่น "โค้ก" ชนทั้ง โค้ก 325ml และ โค้กซีโร่ 325ml) แล้วโยน ConflictException
 * ทิ้งไปเฉยๆ ผู้ใช้จึงต้องเดาเองว่าต้องพิมพ์ยังไงถึงจะเจาะจงพอ
 *
 * แทนที่จะเดา เก็บเป็น PendingAction ที่ shopProductId ยังว่าง พร้อมรายชื่อ
 * ตัวเลือกใน payload แล้วให้ผู้ใช้เลือก — schema อนุญาตให้ว่างได้ และ
 * ChatCommandService.confirm() ก็กันไว้อยู่แล้วว่าห้ามยืนยันถ้ายังไม่ได้เลือก
 *
 * เก็บลงฐานข้อมูลไม่ใช่ memory เพราะผู้ใช้อาจตอบกลับมาอีกหลายนาที หรือคนละ
 * process กัน (โดยเฉพาะ LINE ที่มาเป็น webhook แยกครั้ง)
 */

const CANDIDATE_FETCH_LIMIT = 100;

/** LINE ส่งข้อความได้ครั้งละ 5,000 ตัวอักษร เผื่อไว้หน่อยกันข้อความยาวจนยิงไม่ออก */
const TEXT_LIMIT = 4800;

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

export type StockCandidate = z.infer<typeof candidateSchema>;

export interface ChoicePending {
  productQuery: string;
  operation: 'INCREASE' | 'DECREASE';
  quantity: number;
  payload: unknown;
}

@Injectable()
export class StockChoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(STOCK_COMMAND_PARSER)
    private readonly parser: StockCommandParser,
  ) {}

  /**
   * เงื่อนไขการค้นต้องตรงกับ PrismaStockInventoryAdapter.resolveProduct()
   * ไม่งั้นรายการที่โชว์จะไม่ตรงกับที่ระบบหาเจอจริง
   */
  async findCandidates(
    shopId: string,
    productQuery: string,
  ): Promise<{ candidates: StockCandidate[]; totalMatches: number }> {
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

  /**
   * ต้อง parse ซ้ำ เพราะ ChatCommandService.create() โยน error ทิ้งก่อนคืนผล
   * การตีความ — เกิดเฉพาะตอนชื่อกำกวมซึ่งไม่บ่อย จึงยอมเรียก LLM รอบที่สอง
   *
   * คืน null เมื่อค้นไม่เจอสักตัว ให้ผู้เรียกไปตอบว่า "ไม่พบสินค้า" ตามสำนวน
   * ของช่องทางตัวเอง
   */
  async createChoicePending(input: {
    shopId: string;
    actorId: string;
    source: 'WEB' | 'LINE';
    message: string;
  }) {
    const parsed = await this.parser.parse(input.message);

    // คำถามยอดคงเหลือไม่ต้องเลือกอะไร — ตอบไปเลยทุกตัวที่ตรง (StockQueryService)
    if (parsed.intent === 'QUERY_STOCK') return null;

    /**
     * คำสั่งย้ายก็เข้าเส้นทางนี้ได้ — เดิมถูกกันไว้เพราะแถวที่สร้างยังไม่มีร้าน
     * ปลายทางแล้วไปพังตอนยืนยัน ตอนนี้ "รอเลือกร้านปลายทาง" เป็นสถานะที่ระบบ
     * รู้จักแล้ว ผู้ใช้จึงเลือกสินค้าก่อน แล้วค่อยเลือกร้านปลายทางต่อได้
     */

    const { candidates, totalMatches } = await this.findCandidates(
      input.shopId,
      parsed.productQuery,
    );

    if (candidates.length === 0) return null;

    const ttl = this.config.get<number>('PENDING_ACTION_TTL_MINUTES', 15);

    return this.prisma.pendingAction.create({
      data: {
        shopId: input.shopId,
        actorId: input.actorId,
        source: input.source,
        originalMessage: input.message,
        intent: parsed.intent,
        shopProductId: null,
        productQuery: parsed.productQuery,
        // ขายไม่มี operation มาจาก parser แต่ทำให้ของลดลงจริง
        operation:
          parsed.intent === 'ADJUST_STOCK' ? parsed.operation : 'DECREASE',
        quantity: parsed.quantity,
        expiresAt: new Date(Date.now() + ttl * 60_000),
        payload: { ...parsed, candidates, totalMatches },
      } as never,
    });
  }

  readChoicePayload(payload: unknown): {
    candidates: StockCandidate[];
    totalMatches: number;
  } {
    const parsed = choicePayloadSchema.safeParse(payload);

    if (!parsed.success) return { candidates: [], totalMatches: 0 };

    return {
      candidates: parsed.data.candidates,
      totalMatches: parsed.data.totalMatches ?? parsed.data.candidates.length,
    };
  }

  /**
   * ข้อความรายการตัวเลือกสำหรับช่องทางที่เป็นข้อความล้วน (LINE)
   * ฝั่งเว็บใช้ candidates ไปวาดปุ่มเองไม่ต้องใช้เมธอดนี้
   */
  renderChoices(pending: ChoicePending): string {
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
          `แสดง ${shown.length} จากทั้งหมด ${totalMatches} รายการ ถ้าไม่เจอที่ต้องการ ให้พิมพ์ชื่อให้เจาะจงขึ้น หรือใช้บาร์โค้ด`,
        );
      }

      lines.push('หรือพิมพ์ "ยกเลิก" เพื่อยกเลิก');

      return lines.join('\n');
    };

    const shown = [...items];

    while (shown.length > 1 && compose(shown).length > TEXT_LIMIT) {
      shown.pop();
    }

    return compose(shown);
  }
}
