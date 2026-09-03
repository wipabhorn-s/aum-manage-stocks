import { ForbiddenException } from '@nestjs/common';
import { ChatCommandService } from './chat-command.service';

describe('ChatCommandService', () => {
  it('checks chatbot access before parsing a command', async () => {
    const denied = new ForbiddenException(
      'Subscription does not include chatbot',
    );
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
      pendingAction: { create: jest.fn() },
    };
    const parser = { parse: jest.fn() };
    const authorization = {
      assertCanUseChatbot: jest.fn().mockRejectedValue(denied),
    };
    const service = new ChatCommandService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      { notifyIfCrossed: jest.fn() } as never,
      // [อั้ม] ขาย/ย้าย — เทสต์ชุดนี้ไม่ได้แตะสองเส้นทางนั้น ใส่ตัวหลอกไว้พอ
      {} as never,
      {} as never,
      parser,
      { resolveProduct: jest.fn() } as never,
      authorization as never,
    );

    await expect(
      service.create({
        shopId: 'shop',
        actorId: 'staff',
        source: 'WEB',
        message: 'add coffee 1',
      }),
    ).rejects.toBe(denied);
    expect(authorization.assertCanUseChatbot).toHaveBeenCalledWith(tx, {
      shopId: 'shop',
      actorId: 'staff',
    });
    expect(parser.parse).not.toHaveBeenCalled();
    expect(prisma.pendingAction.create).not.toHaveBeenCalled();
  });

  it('persists and confirms multiple stock items in one transaction', async () => {
    const pendingId = '10000000-0000-4000-8000-000000000001';
    const productIds = [
      '20000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
    ];
    let persisted: Record<string, unknown> | undefined;
    const tx = {
      pendingAction: {
        findFirst: jest.fn(() => Promise.resolve(persisted)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
      pendingAction: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          persisted = { id: pendingId, status: 'PENDING', ...data };
          return Promise.resolve(persisted);
        }),
        // confirm() อ่าน intent ก่อนเข้าทรานแซกชัน เพื่อแยกเส้นทาง ขาย/ย้าย/ปรับสต็อก
        findFirst: jest.fn(() => Promise.resolve(persisted)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const parser = {
      parse: jest
        .fn()
        .mockResolvedValueOnce({
          intent: 'ADJUST_STOCK',
          operation: 'INCREASE',
          productQuery: 'coffee',
          quantity: 2,
        })
        .mockResolvedValueOnce({
          intent: 'ADJUST_STOCK',
          operation: 'DECREASE',
          productQuery: 'tea',
          quantity: 1,
        }),
    };
    const inventory = {
      resolveProduct: jest
        .fn()
        .mockResolvedValueOnce({ shopProductId: productIds[0] })
        .mockResolvedValueOnce({ shopProductId: productIds[1] }),
    };
    const stock = {
      adjustInTransaction: jest
        .fn()
        .mockResolvedValueOnce({
          movement: { shopProductId: productIds[0] },
          stock: { quantityBefore: 5, quantityAfter: 7 },
        })
        .mockResolvedValueOnce({
          movement: { shopProductId: productIds[1] },
          stock: { quantityBefore: 3, quantityAfter: 2 },
        }),
    };
    const notifyIfCrossed = jest.fn().mockResolvedValue(undefined);
    const service = new ChatCommandService(
      prisma as never,
      { get: jest.fn().mockReturnValue(15) } as never,
      stock as never,
      { notifyIfCrossed } as never,
      // [อั้ม] ขาย/ย้าย — เทสต์ชุดนี้ไม่ได้แตะสองเส้นทางนั้น ใส่ตัวหลอกไว้พอ
      {} as never,
      {} as never,
      parser,
      inventory as never,
      { assertCanUseChatbot: jest.fn().mockResolvedValue(undefined) } as never,
    );

    const created = await service.create({
      shopId: 'shop',
      actorId: 'staff',
      source: 'WEB',
      message: 'add coffee 2\nremove tea 1',
    });
    expect(created).toMatchObject({ id: pendingId });
    expect(parser.parse).toHaveBeenCalledTimes(2);

    await expect(
      service.confirm('shop', pendingId, 'staff'),
    ).resolves.toMatchObject({
      pendingActionId: pendingId,
      items: [{ stock: { quantityAfter: 7 } }, { stock: { quantityAfter: 2 } }],
    });
    expect(stock.adjustInTransaction).toHaveBeenCalledTimes(2);
    expect(stock.adjustInTransaction).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({ shopProductId: productIds[0], quantity: 2 }),
    );
    expect(stock.adjustInTransaction).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({ shopProductId: productIds[1], quantity: 1 }),
    );
    // ยิงหลัง commit ครั้งเดียวพร้อมกันทุกรายการ ไม่ใช่ทีละรายการในทรานแซกชัน
    expect(notifyIfCrossed).toHaveBeenCalledTimes(1);
    expect(notifyIfCrossed).toHaveBeenCalledWith([
      { shopProductId: productIds[0], quantityBefore: 5, quantityAfter: 7 },
      { shopProductId: productIds[1], quantityBefore: 3, quantityAfter: 2 },
    ]);
  });
});
