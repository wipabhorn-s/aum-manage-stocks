import { ConflictException } from '@nestjs/common';

import { ChatCommandService } from './chat-command.service';

const PENDING_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const DEST_SHOP_ID = '33333333-3333-4333-8333-333333333333';

type Overrides = Partial<{
  intent: 'SELL' | 'TRANSFER_STOCK';
  claimed: number;
  destinationShopId: string | null;
}>;

function build(overrides: Overrides = {}) {
  const pending = {
    id: PENDING_ID,
    shopId: 'shop',
    actorId: 'staff',
    intent: overrides.intent ?? 'SELL',
    status: 'PENDING',
    shopProductId: PRODUCT_ID,
    productQuery: 'โค้ก',
    operation: 'DECREASE',
    quantity: 2,
    originalMessage: 'ขายโค้ก 2',
    parsedItems: null,
    destinationShopId:
      overrides.destinationShopId === undefined
        ? DEST_SHOP_ID
        : overrides.destinationShopId,
    expiresAt: new Date(Date.now() + 600_000),
  };

  const updateMany = jest
    .fn()
    .mockResolvedValue({ count: overrides.claimed ?? 1 });

  const prisma = {
    // assertChatbotAccess ห่อการเช็คสิทธิ์ไว้ในทรานแซกชัน
    $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})),
    pendingAction: {
      findFirst: jest.fn().mockResolvedValue(pending),
      updateMany,
    },
  };

  const sales = { create: jest.fn().mockResolvedValue({ id: 'sale-1' }) };
  const stock = {
    transfer: jest.fn().mockResolvedValue({
      from: {
        movement: { shopProductId: PRODUCT_ID },
        stock: { quantityBefore: 10, quantityAfter: 8 },
      },
      to: {},
    }),
  };
  const authorization = {
    assertCanUseChatbot: jest.fn().mockResolvedValue(undefined),
  };

  const service = new ChatCommandService(
    prisma as never,
    { get: jest.fn().mockReturnValue(15) } as never,
    stock as never,
    { notifyIfCrossed: jest.fn() } as never,
    sales as never,
    {} as never,
    {} as never,
    {} as never,
    authorization as never,
  );

  return { service, prisma, sales, stock, updateMany };
}

describe('ยืนยันคำสั่งขาย / ย้าย', () => {
  it('ขาย — เรียก SalesService ด้วยรายการที่ค้างไว้', async () => {
    const { service, sales } = build({ intent: 'SELL' });

    const result = await service.confirm('shop', PENDING_ID, 'staff');

    expect(sales.create).toHaveBeenCalledTimes(1);
    expect(sales.create).toHaveBeenCalledWith(
      'shop',
      'staff',
      expect.objectContaining({
        items: [{ shopProductId: PRODUCT_ID, quantity: 2 }],
      }),
    );
    expect(result).toMatchObject({
      intent: 'SELL',
      pendingActionId: PENDING_ID,
    });
  });

  it('ย้าย — เรียก StockService.transfer ไปร้านปลายทางที่บันทึกไว้', async () => {
    const { service, stock } = build({ intent: 'TRANSFER_STOCK' });

    await service.confirm('shop', PENDING_ID, 'staff');

    expect(stock.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        fromShopId: 'shop',
        toShopId: DEST_SHOP_ID,
        shopProductId: PRODUCT_ID,
        quantity: 2,
      }),
    );
  });

  /**
   * เทสต์ที่แพงที่สุดของฟีเจอร์นี้ — ถ้าการจองไม่ทำงาน กดยืนยันซ้ำจะออกบิลสองใบ
   * และตัดสต็อกสองรอบ ซึ่งตามแก้ทีหลังแทบไม่ได้เพราะเงินเข้าไปในรายงานแล้ว
   */
  it('มีคนยืนยันไปก่อนแล้ว — ต้องไม่ขายซ้ำ', async () => {
    const { service, sales } = build({ intent: 'SELL', claimed: 0 });

    await expect(
      service.confirm('shop', PENDING_ID, 'staff'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(sales.create).not.toHaveBeenCalled();
  });

  it('ขายไม่สำเร็จ — ต้องคืนสถานะเป็น PENDING ให้กดใหม่ได้', async () => {
    const { service, sales, updateMany } = build({ intent: 'SELL' });
    const boom = new Error('สต็อกไม่พอ');
    sales.create.mockRejectedValueOnce(boom);

    await expect(service.confirm('shop', PENDING_ID, 'staff')).rejects.toBe(
      boom,
    );

    expect(updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING' }) as unknown,
      }),
    );
  });
});
