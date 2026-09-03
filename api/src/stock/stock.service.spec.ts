import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { PrismaService } from '../database/prisma.service';
import type { StockAuthorizationPort } from './ports/stock-authorization.port';
import type { StockInventoryPort } from './ports/stock-inventory.port';
import { LowStockNotifier } from '../notifications/low-stock.notifier';
import { Prisma } from '../database/generated/prisma/client';
import { StockLotsService } from './stock-lots.service';
import { StockService } from './stock.service';

describe('StockService', () => {
  it('authorizes, updates inventory, and records movement in one transaction', async () => {
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const authorizeMock = jest.fn().mockResolvedValue(undefined);
    const authorization = {
      assertCanAdjustStock: authorizeMock,
      assertCanUseChatbot: jest.fn(),
    } as StockAuthorizationPort;
    const adjustMock = jest
      .fn()
      .mockResolvedValue({ quantityBefore: 10, quantityAfter: 15 });
    const inventory = {
      adjustStock: adjustMock,
    } as unknown as StockInventoryPort;
    const createMovementMock = jest
      .fn()
      .mockResolvedValue({ id: 'movement-id' });
    const movements = {
      create: createMovementMock,
    } as unknown as StockMovementsService;
    const lowStock = {
      notifyIfCrossed: jest.fn().mockResolvedValue(undefined),
    } as unknown as LowStockNotifier;
    const lots = {
      receive: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(0) }),
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        picked: [],
        quantityWithoutLot: 0,
      }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockLotsService;
    const service = new StockService(
      prisma,
      movements,
      inventory,
      authorization,
      lowStock,
      lots,
    );

    await expect(
      service.adjust({
        shopId: 'shop-id',
        shopProductId: 'product-id',
        actorId: 'actor-id',
        operation: 'INCREASE',
        quantity: 5,
        source: 'WEB',
      }),
    ).resolves.toMatchObject({ stock: { quantityAfter: 15 } });

    expect(authorizeMock).toHaveBeenCalledWith(tx, {
      shopId: 'shop-id',
      actorId: 'actor-id',
    });
    expect(adjustMock).toHaveBeenCalledWith(tx, {
      shopId: 'shop-id',
      shopProductId: 'product-id',
      quantityDelta: 5,
    });
    expect(createMovementMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        quantityBefore: 10,
        quantityAfter: 15,
        quantityDelta: 5,
      }),
    );
  });

  it('does not update inventory when authorization fails', async () => {
    const denied = new Error('denied');
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const authorizeMock = jest.fn().mockRejectedValue(denied);
    const authorization = {
      assertCanAdjustStock: authorizeMock,
      assertCanUseChatbot: jest.fn(),
    } as StockAuthorizationPort;
    const adjustMock = jest.fn();
    const inventory = {
      adjustStock: adjustMock,
    } as unknown as StockInventoryPort;
    const createMovementMock = jest.fn();
    const movements = {
      create: createMovementMock,
    } as unknown as StockMovementsService;
    const lowStock = {
      notifyIfCrossed: jest.fn().mockResolvedValue(undefined),
    } as unknown as LowStockNotifier;
    const lots = {
      receive: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(0) }),
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        picked: [],
        quantityWithoutLot: 0,
      }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockLotsService;
    const service = new StockService(
      prisma,
      movements,
      inventory,
      authorization,
      lowStock,
      lots,
    );

    await expect(
      service.adjust({
        shopId: 'shop-id',
        shopProductId: 'product-id',
        actorId: 'actor-id',
        operation: 'DECREASE',
        quantity: 2,
        source: 'WEB',
      }),
    ).rejects.toBe(denied);
    expect(adjustMock).not.toHaveBeenCalled();
    expect(createMovementMock).not.toHaveBeenCalled();
  });

  it('uses chatbot authorization instead of manual permission for pending actions', async () => {
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const assertCanAdjustStock = jest.fn();
    const assertCanUseChatbot = jest.fn().mockResolvedValue(undefined);
    const authorization = {
      assertCanAdjustStock,
      assertCanUseChatbot,
    } as StockAuthorizationPort;
    const inventory = {
      adjustStock: jest
        .fn()
        .mockResolvedValue({ quantityBefore: 10, quantityAfter: 11 }),
    } as unknown as StockInventoryPort;
    const createMovementMock = jest
      .fn()
      .mockResolvedValue({ id: 'movement-id' });
    const movements = {
      create: createMovementMock,
    } as unknown as StockMovementsService;
    const lowStock = {
      notifyIfCrossed: jest.fn().mockResolvedValue(undefined),
    } as unknown as LowStockNotifier;
    const lots = {
      receive: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(0) }),
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        picked: [],
        quantityWithoutLot: 0,
      }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockLotsService;
    const service = new StockService(
      prisma,
      movements,
      inventory,
      authorization,
      lowStock,
      lots,
    );

    await service.adjustInTransaction(tx as never, {
      shopId: 'shop-id',
      shopProductId: 'product-id',
      actorId: 'actor-id',
      operation: 'INCREASE',
      quantity: 1,
      source: 'WEB',
      pendingAction: { id: 'pending-id' } as never,
    });

    expect(assertCanUseChatbot).toHaveBeenCalledWith(tx, {
      shopId: 'shop-id',
      actorId: 'actor-id',
    });
    expect(assertCanAdjustStock).not.toHaveBeenCalled();
    expect(createMovementMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        pendingActionId: 'pending-id',
        referenceType: 'PENDING_ACTION',
      }),
    );
  });
});

describe('StockService.transfer', () => {
  const FROM = 'shop-from';
  const TO = 'shop-to';
  const ACTOR = 'actor-1';

  function setup(destination: unknown) {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'sp-from',
        productId: 'product-1',
        product: { name: 'ไข่ไก่ เบอร์ 2' },
        shop: { name: 'สาขาหนึ่ง', ownerId: 'owner-1' },
      })
      .mockResolvedValueOnce(destination);
    const tx = { shopProduct: { findFirst } };
    const transactionMock = jest.fn((callback: (value: unknown) => unknown) =>
      callback(tx),
    );
    const prisma = {
      $transaction: transactionMock,
    } as unknown as PrismaService;
    const authorizeMock = jest.fn().mockResolvedValue(undefined);
    const authorization = {
      assertCanAdjustStock: authorizeMock,
      assertCanUseChatbot: jest.fn(),
    } as StockAuthorizationPort;
    const adjustMock = jest
      .fn()
      .mockResolvedValueOnce({ quantityBefore: 20, quantityAfter: 15 })
      .mockResolvedValueOnce({ quantityBefore: 3, quantityAfter: 8 });
    const inventory = {
      adjustStock: adjustMock,
    } as unknown as StockInventoryPort;
    const createMovementMock = jest
      .fn()
      .mockResolvedValue({ id: 'movement-id' });
    const movements = {
      create: createMovementMock,
    } as unknown as StockMovementsService;
    const notifyMock = jest.fn().mockResolvedValue(undefined);
    const lowStock = {
      notifyIfCrossed: notifyMock,
    } as unknown as LowStockNotifier;

    const lots = {
      receive: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(0) }),
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal(0),
        totalCost: new Prisma.Decimal(0),
        picked: [],
        quantityWithoutLot: 0,
      }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockLotsService;
    const service = new StockService(
      prisma,
      movements,
      inventory,
      authorization,
      lowStock,
      lots,
    );
    return {
      service,
      transactionMock,
      authorizeMock,
      adjustMock,
      createMovementMock,
      notifyMock,
      findFirst,
    };
  }

  const activeDestination = {
    id: 'sp-to',
    shop: { name: 'สาขาสอง', ownerId: 'owner-1' },
  };

  it('ลดต้นทางและเพิ่มปลายทางในทรานแซกชันเดียว', async () => {
    const { service, transactionMock, adjustMock, createMovementMock } =
      setup(activeDestination);

    const result = await service.transfer({
      fromShopId: FROM,
      toShopId: TO,
      shopProductId: 'sp-from',
      actorId: ACTOR,
      quantity: 5,
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(adjustMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ shopId: FROM, quantityDelta: -5 }),
    );
    expect(adjustMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ shopId: TO, quantityDelta: 5 }),
    );
    expect(createMovementMock).toHaveBeenCalledTimes(2);
    expect(result.from.stock.quantityAfter).toBe(15);
    expect(result.to.stock.quantityAfter).toBe(8);
  });

  it('บันทึกเจตนา "ย้าย" ไว้ในหมายเหตุของทั้งสองฝั่ง', async () => {
    const { service, createMovementMock } = setup(activeDestination);

    await service.transfer({
      fromShopId: FROM,
      toShopId: TO,
      shopProductId: 'sp-from',
      actorId: ACTOR,
      quantity: 5,
    });

    expect(createMovementMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ note: 'ย้ายไป สาขาสอง' }),
    );
    expect(createMovementMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ note: 'ย้ายมาจาก สาขาหนึ่ง' }),
    );
  });

  it('ต้องมีสิทธิ์ปรับสต็อกทั้งร้านต้นทางและปลายทาง', async () => {
    const { service, authorizeMock } = setup(activeDestination);

    await service.transfer({
      fromShopId: FROM,
      toShopId: TO,
      shopProductId: 'sp-from',
      actorId: ACTOR,
      quantity: 5,
    });

    expect(authorizeMock).toHaveBeenCalledTimes(2);
    expect(authorizeMock).toHaveBeenCalledWith(expect.anything(), {
      shopId: FROM,
      actorId: ACTOR,
    });
    expect(authorizeMock).toHaveBeenCalledWith(expect.anything(), {
      shopId: TO,
      actorId: ACTOR,
    });
  });

  it('ย้ายเข้าร้านตัวเองถูกปฏิเสธก่อนแตะฐานข้อมูล', async () => {
    const { service, transactionMock } = setup(activeDestination);

    await expect(
      service.transfer({
        fromShopId: FROM,
        toShopId: FROM,
        shopProductId: 'sp-from',
        actorId: ACTOR,
        quantity: 5,
      }),
    ).rejects.toThrow();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('ปลายทางยังไม่มีสินค้าตัวนี้ ต้องไม่ตัดสต็อกต้นทางเลย', async () => {
    const { service, adjustMock } = setup(null);

    await expect(
      service.transfer({
        fromShopId: FROM,
        toShopId: TO,
        shopProductId: 'sp-from',
        actorId: ACTOR,
        quantity: 5,
      }),
    ).rejects.toThrow();
    expect(adjustMock).not.toHaveBeenCalled();
  });

  it('ย้ายข้ามเจ้าของร้านไม่ได้', async () => {
    const { service, adjustMock } = setup({
      id: 'sp-to',
      shop: { name: 'ร้านคนอื่น', ownerId: 'owner-2' },
    });

    await expect(
      service.transfer({
        fromShopId: FROM,
        toShopId: TO,
        shopProductId: 'sp-from',
        actorId: ACTOR,
        quantity: 5,
      }),
    ).rejects.toThrow();
    expect(adjustMock).not.toHaveBeenCalled();
  });
});

/**
 * ทุนต้องถูกบันทึกลง stock_movements ทุกทางที่สต็อกขยับ ไม่ใช่แค่ตอนขาย
 *
 * เหตุผลเดียวกับที่รวม logic ล็อตไว้ที่ service เดียว — ถ้าบันทึกทุนแค่บางทาง
 * หน้าประวัติจะมีบางแถวเป็น "—" โดยไม่มีใครอธิบายได้ว่าทำไม
 */
describe('StockService — ทุนต่อชิ้นในประวัติการเคลื่อนไหว', () => {
  function setup(lotUnitCost: string) {
    const tx = {};
    const prisma = {
      $transaction: jest.fn((callback: (value: unknown) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const authorization = {
      assertCanAdjustStock: jest.fn().mockResolvedValue(undefined),
      assertCanUseChatbot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockAuthorizationPort;
    const inventory = {
      adjustStock: jest
        .fn()
        .mockResolvedValue({ quantityBefore: 10, quantityAfter: 15 }),
    } as unknown as StockInventoryPort;
    const createMovementMock = jest
      .fn()
      .mockResolvedValue({ id: 'movement-id' });
    const movements = {
      create: createMovementMock,
    } as unknown as StockMovementsService;
    const lowStock = {
      notifyIfCrossed: jest.fn().mockResolvedValue(undefined),
    } as unknown as LowStockNotifier;
    const lots = {
      receive: jest
        .fn()
        .mockResolvedValue({ unitCost: new Prisma.Decimal(lotUnitCost) }),
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal(lotUnitCost),
        totalCost: new Prisma.Decimal(lotUnitCost),
        picked: [],
        quantityWithoutLot: 0,
      }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    } as unknown as StockLotsService;
    const service = new StockService(
      prisma,
      movements,
      inventory,
      authorization,
      lowStock,
      lots,
    );
    return { service, createMovementMock };
  }

  const base = {
    shopId: 'shop-id',
    shopProductId: 'product-id',
    actorId: 'actor-id',
    source: 'WEB' as const,
  };

  it('ของเข้าบันทึกทุนของล็อตที่เพิ่งเปิด', async () => {
    const { service, createMovementMock } = setup('14.00');

    await service.adjust({
      ...base,
      operation: 'INCREASE',
      quantity: 20,
      unitCost: 14,
    });

    expect(createMovementMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ unitCost: new Prisma.Decimal('14.00') }),
    );
  });

  it('ของออกบันทึกทุนเฉลี่ยของล็อตที่ถูกตัดจริง ไม่ใช่ทุนปัจจุบันของสินค้า', async () => {
    const { service, createMovementMock } = setup('12.67');

    await service.adjust({ ...base, operation: 'DECREASE', quantity: 15 });

    expect(createMovementMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ unitCost: new Prisma.Decimal('12.67') }),
    );
  });
});
