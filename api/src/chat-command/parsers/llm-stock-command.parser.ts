import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Ollama } from 'ollama';
import { z } from 'zod';
import type { EnvVariable } from '../../config/env.validation';
import { ParsedStockCommand, StockCommandParser } from './stock-command-parser';

/**
 * [อั้ม] intent เป็นตัวแยกว่าผู้ใช้จะทำอะไร — สี่อย่างนี้ปลายทางคนละเส้นทางกันหมด
 *
 * ตอนถาม (QUERY_STOCK) จะไม่มี operation กับ quantity ส่วน TRANSFER_STOCK ต้องมี
 * ร้านปลายทาง ฟิลด์ที่ไม่ได้ใช้ทุก intent จึงเป็น optional แล้วบังคับตาม intent
 * ด้วย superRefine ไม่ใช่ปล่อยให้หลุดไปพังตอนใช้งาน
 *
 * **ขาย (SELL) ไม่ใช่ ADJUST_STOCK + DECREASE** — โมเดลชอบตอบสองอย่างนี้สลับกัน
 * เพราะทั้งคู่ทำให้ของลดลง ตัวอย่างในพรอมป์ตจึงต้องมีทั้งคู่วางคู่กันให้เห็นชัด
 */
const llmResponseSchema = z
  .object({
    intent: z.enum(['ADJUST_STOCK', 'QUERY_STOCK', 'SELL', 'TRANSFER_STOCK']),
    operation: z.enum(['INCREASE', 'DECREASE']).optional(),
    productQuery: z.string().trim(),
    quantity: z.number().int().positive().optional(),
    destinationShopQuery: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.intent === 'QUERY_STOCK') return;

    const require = (field: 'operation' | 'quantity' | 'productQuery') => {
      ctx.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required when intent is ${value.intent}`,
      });
    };

    if (!value.productQuery) require('productQuery');
    if (value.quantity === undefined) require('quantity');
    if (value.intent === 'ADJUST_STOCK' && !value.operation)
      require('operation');
    // destinationShopQuery ไม่บังคับ — ไม่ระบุก็ได้ ระบบจะถามต่อพร้อมรายการร้าน
  });

const RESPONSE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['ADJUST_STOCK', 'QUERY_STOCK', 'SELL', 'TRANSFER_STOCK'],
    },
    operation: { type: 'string', enum: ['INCREASE', 'DECREASE'] },
    productQuery: { type: 'string' },
    quantity: { type: 'integer' },
    destinationShopQuery: { type: 'string' },
  },
  required: ['intent', 'productQuery'],
};

const SYSTEM_PROMPT = [
  'คุณเป็นตัวแปลงข้อความภาษาไทยเรื่องสต็อกสินค้าเป็น JSON',
  '',
  'ตอบเป็น JSON รูปแบบนี้เท่านั้น ห้ามมีข้อความอื่นและห้ามครอบด้วย markdown:',
  '{"intent":"ADJUST_STOCK","operation":"INCREASE","productQuery":"...","quantity":0}',
  '{"intent":"QUERY_STOCK","productQuery":"..."}',
  '{"intent":"SELL","productQuery":"...","quantity":0}',
  '{"intent":"TRANSFER_STOCK","productQuery":"...","quantity":0,"destinationShopQuery":"..."}',
  '',
  'ตัวอย่างสั่งปรับสต็อก (ของเพิ่มหรือหายไปเฉยๆ ไม่มีเงินเกี่ยวข้อง):',
  'ผู้ใช้: "เพิ่มโค้ก10"',
  'ตอบ: {"intent":"ADJUST_STOCK","operation":"INCREASE","productQuery":"โค้ก","quantity":10}',
  'ผู้ใช้: "เติมน้ำเปล่า 3 ขวด"',
  'ตอบ: {"intent":"ADJUST_STOCK","operation":"INCREASE","productQuery":"น้ำเปล่า","quantity":3}',
  'ผู้ใช้: "ลดขนมปัง 5"',
  'ตอบ: {"intent":"ADJUST_STOCK","operation":"DECREASE","productQuery":"ขนมปัง","quantity":5}',
  'ผู้ใช้: "ตัดโค้กทิ้ง 2 ขวดของหมดอายุ"',
  'ตอบ: {"intent":"ADJUST_STOCK","operation":"DECREASE","productQuery":"โค้ก","quantity":2}',
  '',
  'ตัวอย่างขาย (ตัดสต็อกและคิดเงิน):',
  'ผู้ใช้: "ขายโค้ก 2"',
  'ตอบ: {"intent":"SELL","productQuery":"โค้ก","quantity":2}',
  'ผู้ใช้: "ขายโค้กไป 2 กระป๋อง"',
  'ตอบ: {"intent":"SELL","productQuery":"โค้ก","quantity":2}',
  'ผู้ใช้: "ลูกค้าซื้อน้ำเปล่า 3 ขวด"',
  'ตอบ: {"intent":"SELL","productQuery":"น้ำเปล่า","quantity":3}',
  '',
  'ตัวอย่างย้ายไปร้านอื่น:',
  'ผู้ใช้: "ย้ายโค้ก 10 ไปร้าน the aum"',
  'ตอบ: {"intent":"TRANSFER_STOCK","productQuery":"โค้ก","quantity":10,"destinationShopQuery":"the aum"}',
  'ผู้ใช้: "โอนน้ำเปล่า 5 ขวดไปสาขาสอง"',
  'ตอบ: {"intent":"TRANSFER_STOCK","productQuery":"น้ำเปล่า","quantity":5,"destinationShopQuery":"สาขาสอง"}',
  'ผู้ใช้: "ย้ายโค้ก 20"',
  'ตอบ: {"intent":"TRANSFER_STOCK","productQuery":"โค้ก","quantity":20}',
  '',
  'ตัวอย่างถามยอดคงเหลือ:',
  'ผู้ใช้: "สินค้าคงเหลือ"',
  'ตอบ: {"intent":"QUERY_STOCK","productQuery":""}',
  'ผู้ใช้: "ตอนนี้มีของอะไรบ้าง"',
  'ตอบ: {"intent":"QUERY_STOCK","productQuery":""}',
  'ผู้ใช้: "โค้กเหลือเท่าไหร่"',
  'ตอบ: {"intent":"QUERY_STOCK","productQuery":"โค้ก"}',
  'ผู้ใช้: "เช็คสต็อกน้ำเปล่าหน่อย"',
  'ตอบ: {"intent":"QUERY_STOCK","productQuery":"น้ำเปล่า"}',
  '',
  'กฎ:',
  '- intent = QUERY_STOCK เมื่อผู้ใช้ "ถาม" ยอดคงเหลือ ไม่ได้สั่งให้แก้ตัวเลข',
  '- intent = SELL เมื่อมีการขาย/ลูกค้าซื้อ — ต่างจาก ADJUST_STOCK เพราะมีการคิดเงิน',
  '- intent = TRANSFER_STOCK เมื่อย้าย/โอนของไปอีกร้านหนึ่ง ต้องมี destinationShopQuery',
  '- intent = ADJUST_STOCK เมื่อเพิ่ม/เติม/ลด/ตัด/เอาออก โดยไม่มีการขายและไม่ได้ย้ายร้าน',
  '- ห้ามตอบ ADJUST_STOCK สำหรับการขายเด็ดขาด และห้ามตอบ SELL สำหรับของเสีย/ของหมดอายุ',
  '- QUERY_STOCK ห้ามใส่ operation และ quantity',
  '- QUERY_STOCK ถ้าถามรวมทั้งร้าน ให้ productQuery เป็นข้อความว่าง',
  '- operation ใช้เฉพาะ ADJUST_STOCK เท่านั้น: INCREASE เมื่อเพิ่ม/เติม/รับเข้า, DECREASE เมื่อลด/ตัด/เอาออก',
  '- quantity เป็นจำนวนเต็มบวกเสมอ ห้ามติดลบ (ทิศทางอยู่ที่ intent และ operation)',
  '- ห้ามใส่ราคาลงไป ระบบใช้ราคาขายที่ตั้งไว้ในร้านเสมอ',
  '- productQuery คือชื่อสินค้าล้วนๆ ไม่รวมจำนวน ไม่รวมหน่วยนับ ไม่รวมคำกริยา',
  '- destinationShopQuery คือชื่อร้านปลายทางล้วนๆ ไม่รวมคำว่า "ไป" หรือ "ร้าน" — ถ้าผู้ใช้ไม่ได้บอกร้านปลายทาง ให้ไม่ต้องใส่ฟิลด์นี้ ห้ามเดาเอง',
].join('\n');

@Injectable()
export class LlmStockCommandParser implements StockCommandParser {
  private client: Ollama | null = null;

  constructor(private readonly config: ConfigService<EnvVariable, true>) {}

  isEnabled(): boolean {
    return Boolean(
      this.config.get('OLLAMA_HOST', { infer: true }) &&
      this.config.get('OLLAMA_MODEL', { infer: true }),
    );
  }

  async parse(message: string): Promise<ParsedStockCommand> {
    const response = await this.getClient().chat({
      model: this.config.get('OLLAMA_MODEL', { infer: true }),
      format: RESPONSE_JSON_SCHEMA,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    });

    const parsed = llmResponseSchema.parse(
      JSON.parse(this.extractJson(response.message.content)) as unknown,
    );

    if (parsed.intent === 'QUERY_STOCK') {
      return { intent: 'QUERY_STOCK', productQuery: parsed.productQuery };
    }

    // superRefine การันตีแล้วว่าฟิลด์ที่ ! ไว้มีค่าครบตาม intent ที่ได้มา
    if (parsed.intent === 'SELL') {
      return {
        intent: 'SELL',
        productQuery: parsed.productQuery,
        quantity: parsed.quantity!,
      };
    }

    if (parsed.intent === 'TRANSFER_STOCK') {
      return {
        intent: 'TRANSFER_STOCK',
        productQuery: parsed.productQuery,
        quantity: parsed.quantity!,
        destinationShopQuery: parsed.destinationShopQuery,
      };
    }

    return {
      intent: 'ADJUST_STOCK',
      operation: parsed.operation!,
      productQuery: parsed.productQuery,
      quantity: parsed.quantity!,
    };
  }

  private getClient(): Ollama {
    if (this.client) return this.client;

    const host = this.config.get('OLLAMA_HOST', { infer: true })!;
    const apiKey = this.config.get('OLLAMA_API_KEY', { infer: true });

    this.client = new Ollama({
      host,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });

    return this.client;
  }

  private extractJson(raw: string): string {
    const trimmed = raw.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);

    return (fenced ? fenced[1] : trimmed).trim();
  }
}
