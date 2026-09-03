import { Prisma } from '../database/generated/prisma/client';
import { StockLotsService } from './stock-lots.service';

/**
 * tx จำลองที่เก็บล็อตไว้ในหน่วยความจำ — พอจะตรวจลำดับการตัดและตัวเลขทุนได้
 * โดยไม่ต้องต่อ Postgres จริง ตรงกับที่ทั้ง repo เทสต์ด้วย mock ล้วน
 */
function makeTx(options: {
  lots?: { id: string; unitCost: number; qtyRemaining: number }[];
  product?: { stockQty: number; costPrice: number } | null;
}) {
  const lots = (options.lots ?? []).map((lot, index) => ({
    id: lot.id,
    shopProductId: 'sp-1',
    unitCost: new Prisma.Decimal(lot.unitCost),
    qtyReceived: lot.qtyRemaining,
    qtyRemaining: lot.qtyRemaining,
    receivedAt: new Date(2026, 0, index + 1),
  }));
  const created: Record<string, unknown>[] = [];

  const tx = {
    stockLot: {
      count: jest.fn(() => Promise.resolve(lots.length)),
      findMany: jest.fn(() =>
        Promise.resolve(
          lots
            .filter((lot) => lot.qtyRemaining > 0)
            .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()),
        ),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: { qtyRemaining: { decrement: number } };
        }) => {
          const lot = lots.find((row) => row.id === where.id)!;
          lot.qtyRemaining -= data.qtyRemaining.decrement;
          return Promise.resolve(lot);
        },
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        lots.push({
          id: `new-${created.length}`,
          shopProductId: 'sp-1',
          unitCost: data.unitCost as Prisma.Decimal,
          qtyReceived: data.qtyReceived as number,
          qtyRemaining: data.qtyRemaining as number,
          receivedAt: new Date(2026, 11, created.length),
        });
        return Promise.resolve(data);
      }),
    },
    shopProduct: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          options.product === null
            ? null
            : {
                stockQty: options.product?.stockQty ?? 0,
                costPrice: new Prisma.Decimal(options.product?.costPrice ?? 0),
              },
        ),
      ),
    },
  };

  return { tx, lots, created };
}

describe('StockLotsService', () => {
  const service = new StockLotsService();

  it('ตัดล็อตเก่าก่อน และคืนทุนของล็อตนั้นตรงๆ เมื่อตัดไม่ข้ามล็อต', async () => {
    const { tx, lots } = makeTx({
      lots: [
        { id: 'old', unitCost: 12, qtyRemaining: 10 },
        { id: 'new', unitCost: 14, qtyRemaining: 20 },
      ],
    });

    const result = await service.consume(tx as never, {
      shopProductId: 'sp-1',
      quantity: 4,
    });

    expect(result.unitCost.toString()).toBe('12');
    expect(result.picked).toEqual([
      { lotId: 'old', quantity: 4, unitCost: new Prisma.Decimal(12) },
    ]);
    expect(lots.find((lot) => lot.id === 'old')!.qtyRemaining).toBe(6);
    expect(lots.find((lot) => lot.id === 'new')!.qtyRemaining).toBe(20);
  });

  it('ตัดข้ามล็อตแล้วเฉลี่ยถ่วงน้ำหนักตามจำนวนที่ตัดจากแต่ละล็อต', async () => {
    const { tx, lots } = makeTx({
      lots: [
        { id: 'old', unitCost: 12, qtyRemaining: 10 },
        { id: 'new', unitCost: 14, qtyRemaining: 20 },
      ],
    });

    // 10 ชิ้นทุน 12 + 5 ชิ้นทุน 14 = 190 บาท / 15 ชิ้น = 12.67
    const result = await service.consume(tx as never, {
      shopProductId: 'sp-1',
      quantity: 15,
    });

    expect(result.totalCost.toString()).toBe('190');
    expect(result.unitCost.toString()).toBe('12.67');
    expect(result.picked).toHaveLength(2);
    expect(lots.find((lot) => lot.id === 'old')!.qtyRemaining).toBe(0);
    expect(lots.find((lot) => lot.id === 'new')!.qtyRemaining).toBe(15);
  });

  it('ล็อตที่หมดพอดีเหลือ 0 แต่ไม่ถูกลบทิ้ง', async () => {
    const { tx, lots } = makeTx({
      lots: [{ id: 'only', unitCost: 9, qtyRemaining: 5 }],
    });

    await service.consume(tx as never, { shopProductId: 'sp-1', quantity: 5 });

    expect(lots).toHaveLength(1);
    expect(lots[0].qtyRemaining).toBe(0);
  });

  it('สินค้าที่มีของอยู่แต่ยังไม่มีล็อต สร้างล็อตตั้งต้นให้เองแล้วค่อยตัด', async () => {
    const { tx, created } = makeTx({
      lots: [],
      product: { stockQty: 8, costPrice: 11 },
    });

    const result = await service.consume(tx as never, {
      shopProductId: 'sp-1',
      quantity: 3,
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ qtyReceived: 8, qtyRemaining: 8 });
    expect(result.unitCost.toString()).toBe('11');
    expect(result.quantityWithoutLot).toBe(0);
  });

  /**
   * ทุน 0 = "ยังไม่เคยกรอกทุน" ไม่ใช่ของฟรี — เป็นนิยามเดียวกับที่แดชบอร์ด
   * ใช้นับ itemsWithoutCost ตรงนี้ต้องไม่เดาค่าแทนผู้ใช้
   */
  it('ทุนเดิมเป็น 0 ยังสร้างล็อตตั้งต้นตามปกติ ไม่เดาค่าให้', async () => {
    const { tx, created } = makeTx({
      lots: [],
      product: { stockQty: 6, costPrice: 0 },
    });

    const result = await service.consume(tx as never, {
      shopProductId: 'sp-1',
      quantity: 2,
    });

    expect(created).toHaveLength(1);
    expect(result.unitCost.toString()).toBe('0');
  });

  it('ล็อตหมดแต่ยอดคงเหลือยังมี ใช้ cost_price เป็นค่าสำรองแทนการโยน error', async () => {
    const { tx } = makeTx({
      lots: [{ id: 'only', unitCost: 10, qtyRemaining: 2 }],
      product: { stockQty: 5, costPrice: 20 },
    });

    // 2 ชิ้นจากล็อตทุน 10 + อีก 3 ชิ้นไม่มีล็อตรองรับ ใช้ cost_price 20
    const result = await service.consume(tx as never, {
      shopProductId: 'sp-1',
      quantity: 5,
    });

    expect(result.totalCost.toString()).toBe('80');
    expect(result.unitCost.toString()).toBe('16');
    expect(result.quantityWithoutLot).toBe(3);
  });

  it('รับของเข้าโดยระบุทุน เปิดล็อตด้วยทุนนั้น ไม่ไปแตะทุนของล็อตเดิม', async () => {
    const { tx, created, lots } = makeTx({
      lots: [{ id: 'old', unitCost: 12, qtyRemaining: 10 }],
    });

    await service.receive(tx as never, {
      shopProductId: 'sp-1',
      quantity: 20,
      unitCost: 14,
    });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ qtyReceived: 20, qtyRemaining: 20 });
    expect((created[0].unitCost as Prisma.Decimal).toString()).toBe('14');
    expect(lots.find((lot) => lot.id === 'old')!.unitCost.toString()).toBe(
      '12',
    );
  });

  it('รับของเข้าโดยไม่ระบุทุน ใช้ cost_price ปัจจุบันเป็นค่าตั้งต้น', async () => {
    const { tx, created } = makeTx({
      lots: [],
      product: { stockQty: 0, costPrice: 7.5 },
    });

    await service.receive(tx as never, { shopProductId: 'sp-1', quantity: 3 });

    expect((created[0].unitCost as Prisma.Decimal).toString()).toBe('7.5');
  });

  /**
   * ค่าที่ receive() คืนออกไปคือสิ่งที่ผู้เรียกเอาไปบันทึกลง stock_movements
   * ถ้าคืนผิด ประวัติจะโชว์ทุนคนละตัวกับล็อตที่เพิ่งเปิด
   */
  it('receive คืนทุนที่ระบุมาจริง', async () => {
    const { tx } = makeTx({ lots: [] });

    const result = await service.receive(tx as never, {
      shopProductId: 'sp-1',
      quantity: 20,
      unitCost: 14,
    });

    expect(result.unitCost.toString()).toBe('14');
  });

  it('receive ที่ไม่ระบุทุน คืน cost_price ที่ใช้เปิดล็อตแทน', async () => {
    const { tx } = makeTx({
      lots: [],
      product: { stockQty: 0, costPrice: 7.5 },
    });

    const result = await service.receive(tx as never, {
      shopProductId: 'sp-1',
      quantity: 3,
    });

    expect(result.unitCost.toString()).toBe('7.5');
  });

  it('สินค้าที่ไม่มีของเลย ไม่สร้างล็อตตั้งต้นให้', async () => {
    const { tx, created } = makeTx({
      lots: [],
      product: { stockQty: 0, costPrice: 11 },
    });

    await service.ensureOpeningLot(tx as never, 'sp-1');

    expect(created).toHaveLength(0);
  });
});
