import { Prisma } from '../database/generated/prisma/client';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService', () => {
  const productId = '11111111-1111-4111-8111-111111111111';
  const saleId = '22222222-2222-4222-8222-222222222222';
  const itemId = '33333333-3333-4333-8333-333333333333';

  function setup(saleOverrides: Record<string, unknown> = {}) {
    const sale = {
      id: saleId,
      saleNo: 'S-TEST0001',
      status: 'COMPLETED',
      // sale_items.cost_price เป็น NOT NULL ในฐานข้อมูล แถวที่ไม่มีทุนจึงไม่มีจริง
      // ก่อนหน้านี้ fixture ไม่ใส่ ทำให้ตอนยกเลิกบิลส่ง NaN เข้า lots.receive
      // โดยไม่มีเทสต์ไหนจับได้
      items: [
        {
          id: itemId,
          shopProductId: productId,
          quantity: 2,
          costPrice: new Prisma.Decimal('9.00'),
        },
      ],
      ...saleOverrides,
    };
    const tx = {
      sale: {
        create: jest
          .fn()
          .mockResolvedValue({ ...sale, totalAmount: new Prisma.Decimal(25) }),
        findFirst: jest.fn().mockResolvedValue(sale),
        findMany: jest.fn().mockResolvedValue([sale]),
        update: jest.fn().mockResolvedValue({ ...sale, status: 'VOIDED' }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const movements = { create: jest.fn().mockResolvedValue({}) };
    const products = {
      getForSale: jest.fn().mockResolvedValue({
        shopProductId: productId,
        name: 'Coffee',
        barcode: '8850000000001',
        unitPrice: new Prisma.Decimal('12.50'),
        costPrice: new Prisma.Decimal('8.00'),
      }),
      adjustStock: jest
        .fn()
        .mockResolvedValue({ quantityBefore: 10, quantityAfter: 8 }),
      scan: jest.fn().mockResolvedValue({
        shopProductId: productId,
        name: 'Coffee',
        barcode: '8850000000001',
        unitPrice: new Prisma.Decimal('12.50'),
        costPrice: new Prisma.Decimal('8.00'),
      }),
    };
    const staff = {
      assertCanManageSales: jest.fn().mockResolvedValue(undefined),
    };
    const subscriptions = {
      assertSalesEnabled: jest.fn().mockResolvedValue(undefined),
      assertBarcodeEnabled: jest.fn().mockResolvedValue(undefined),
    };
    const lowStock = {
      notifyIfCrossed: jest.fn().mockResolvedValue(undefined),
    };
    const lots = {
      // ทุนจากล็อต 9.00 ตั้งใจให้ต่างจาก costPrice 8.00 ที่ getForSale() คืนมา
      // เพื่อพิสูจน์ว่าบิลใช้ทุนจากล็อต ไม่ใช่ทุนปัจจุบันของสินค้า
      consume: jest.fn().mockResolvedValue({
        unitCost: new Prisma.Decimal('9.00'),
        totalCost: new Prisma.Decimal('18.00'),
        picked: [],
        quantityWithoutLot: 0,
      }),
      receive: jest.fn().mockResolvedValue({ unitCost: new Prisma.Decimal(0) }),
      ensureOpeningLot: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SalesService(
      prisma as never,
      movements as never,
      products,
      staff,
      subscriptions,
      lowStock as never,
      lots as never,
    );
    return {
      service,
      tx,
      movements,
      products,
      staff,
      subscriptions,
      lowStock,
      lots,
    };
  }

  it('creates sale, decreases stock, and records movement in one transaction', async () => {
    const { service, tx, movements, products } = setup();
    await service.create('shop', 'staff', {
      items: [{ shopProductId: productId, quantity: 2 }],
    });
    expect(tx.sale.create).toHaveBeenCalled();
    const [createCall] = tx.sale.create.mock.calls as unknown as [
      [
        {
          data: {
            totalAmount: Prisma.Decimal;
            saleNo: string;
            itemCount: number;
            items: {
              create: Array<{ barcode: string; costPrice: Prisma.Decimal }>;
            };
          };
        },
      ],
    ];
    expect(createCall[0].data.totalAmount.toString()).toBe('25');
    expect(createCall[0].data.saleNo).toMatch(/^S-[A-F0-9]{20}$/);
    expect(createCall[0].data.itemCount).toBe(2);
    /**
     * costPrice เป็น 9.00 ซึ่งมาจากล็อตที่ถูกตัด ไม่ใช่ 8.00 ที่ getForSale()
     * อ่านมาจาก shop_products — เดิมเทสต์นี้ยืนยัน 8.00 และการที่มันเปลี่ยน
     * คือใจความทั้งหมดของฟีเจอร์ต้นทุนแยกล็อต
     */
    expect(createCall[0].data.items.create[0].barcode).toBe('8850000000001');
    expect(createCall[0].data.items.create[0].costPrice.toString()).toBe('9');
    expect(products.adjustStock).toHaveBeenCalledWith(tx, {
      shopId: 'shop',
      shopProductId: productId,
      quantityDelta: -2,
    });
    expect(movements.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        movementType: 'SALE',
        saleId,
        referenceId: itemId,
        // 9.00 = ทุนจากล็อต ไม่ใช่ 8.00 ที่เป็น cost_price ปัจจุบันของสินค้า
        unitCost: new Prisma.Decimal('9.00'),
      }),
    );
  });

  it('voids sale, restores stock, and records reversal movement', async () => {
    const { service, tx, movements, products } = setup();
    await service.void('shop', 'staff', saleId, 'mistake');
    expect(products.adjustStock).toHaveBeenCalledWith(tx, {
      shopId: 'shop',
      shopProductId: productId,
      quantityDelta: 2,
    });
    expect(movements.create).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        movementType: 'SALE_VOID',
        saleId,
        referenceId: itemId,
        // ของกลับเข้ามาด้วยทุนเดียวกับตอนที่มันออกไป
        unitCost: new Prisma.Decimal('9.00'),
      }),
    );
    expect(tx.sale.update).toHaveBeenCalled();
    const [updateCall] = tx.sale.update.mock.calls as unknown as [
      [{ data: { status: string } }],
    ];
    expect(updateCall[0].data.status).toBe('VOIDED');
  });

  it('rejects an already voided sale before changing stock', async () => {
    const { service, products, movements } = setup({ status: 'VOIDED' });
    await expect(
      service.void('shop', 'staff', saleId, 'again'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(products.adjustStock).not.toHaveBeenCalled();
    expect(movements.create).not.toHaveBeenCalled();
  });

  it('fails before product access when authorization is unavailable', async () => {
    const { service, staff, products } = setup();
    staff.assertCanManageSales.mockRejectedValue(new Error('unavailable'));
    await expect(
      service.create('shop', 'staff', {
        items: [{ shopProductId: productId, quantity: 1 }],
      }),
    ).rejects.toThrow('unavailable');
    expect(products.getForSale).not.toHaveBeenCalled();
  });

  it('scans only after staff and subscription checks', async () => {
    const { service, tx, staff, subscriptions, products } = setup();
    await expect(
      service.scan('shop', 'staff', '885123'),
    ).resolves.toMatchObject({ shopProductId: productId });
    expect(staff.assertCanManageSales).toHaveBeenCalledWith(tx, {
      shopId: 'shop',
      staffId: 'staff',
    });
    expect(subscriptions.assertBarcodeEnabled).toHaveBeenCalledWith(tx, 'shop');
    expect(products.scan).toHaveBeenCalledWith('shop', '885123');
  });

  it('lists sales with cursor metadata', async () => {
    const { service } = setup();
    await expect(
      service.list('shop', 'staff', { limit: 20 }),
    ).resolves.toMatchObject({ items: [{ id: saleId }], nextCursor: null });
  });

  it('returns a shop-scoped sale detail', async () => {
    const { service, tx } = setup();
    await expect(service.get('shop', 'staff', saleId)).resolves.toMatchObject({
      id: saleId,
    });
    expect(tx.sale.findFirst).toHaveBeenCalledWith({
      where: { id: saleId, shopId: 'shop' },
      include: { items: true },
    });
  });

  it('returns not found without changing stock when a sale is absent', async () => {
    const { service, tx, products, movements } = setup();
    tx.sale.findFirst.mockResolvedValue(null);
    await expect(
      service.void('shop', 'staff', saleId, 'mistake'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(products.adjustStock).not.toHaveBeenCalled();
    expect(movements.create).not.toHaveBeenCalled();
  });

  it('fails before product access when the subscription check fails', async () => {
    const { service, subscriptions, products } = setup();
    subscriptions.assertSalesEnabled.mockRejectedValue(
      new Error('unavailable'),
    );
    await expect(
      service.create('shop', 'staff', {
        items: [{ shopProductId: productId, quantity: 1 }],
      }),
    ).rejects.toThrow('unavailable');
    expect(products.getForSale).not.toHaveBeenCalled();
  });

  /**
   * แพ็กเกจล็อก "การสแกนบาร์โค้ด" ไม่ใช่ "การขาย" — Free ต้องพิมพ์รายการขายเอง
   * ได้ ไม่งั้นแดชบอร์ดพื้นฐานที่ Free มีสิทธิ์ใช้จะไม่มียอดขายให้แสดงเลย
   * และ void() ก็ใช้ assertSalesEnabled อยู่แล้ว การให้ยกเลิกบิลได้แต่เปิดบิล
   * ไม่ได้เป็นสถานะที่ขัดกันในตัวเอง
   */
  it('เปิดบิลได้โดยไม่ต้องมีสิทธิ์บาร์โค้ด — ประตูของการขายคือ assertSalesEnabled', async () => {
    const { service, subscriptions } = setup();
    subscriptions.assertBarcodeEnabled.mockRejectedValue(
      new Error('barcode locked'),
    );

    await expect(
      service.create('shop', 'staff', {
        items: [{ shopProductId: productId, quantity: 1 }],
      }),
    ).resolves.toBeDefined();

    expect(subscriptions.assertSalesEnabled).toHaveBeenCalled();
    expect(subscriptions.assertBarcodeEnabled).not.toHaveBeenCalled();
  });

  it('สแกนบาร์โค้ดยังถูกล็อกตามแพ็กเกจเหมือนเดิม', async () => {
    const { service, subscriptions, products } = setup();
    subscriptions.assertBarcodeEnabled.mockRejectedValue(
      new Error('barcode locked'),
    );

    await expect(service.scan('shop', 'staff', '8850001')).rejects.toThrow(
      'barcode locked',
    );
    expect(products.scan).not.toHaveBeenCalled();
  });

  it('บิลเก็บทุนจากล็อตที่ตัดจริง ไม่ใช่ cost_price ปัจจุบันของสินค้า', async () => {
    const { service, tx, lots } = setup();

    await service.create('shop-1', 'staff-1', {
      items: [{ shopProductId: productId, quantity: 2 }],
    });

    expect(lots.consume).toHaveBeenCalledWith(tx, {
      shopProductId: productId,
      quantity: 2,
    });
    const [createCall] = tx.sale.create.mock.calls as unknown as [
      [{ data: { items: { create: Array<{ costPrice: Prisma.Decimal }> } } }],
    ];
    expect(createCall[0].data.items.create[0].costPrice.toString()).toBe('9');
  });

  it('ตัด stock_qty ก่อนตัดล็อต เพื่อให้ด่านเช็คของไม่พอทำงานก่อน', async () => {
    const { service, products, lots } = setup();
    const order: string[] = [];
    products.adjustStock.mockImplementation(() => {
      order.push('stock');
      return Promise.resolve({ quantityBefore: 10, quantityAfter: 8 });
    });
    lots.consume.mockImplementation(() => {
      order.push('lots');
      return Promise.resolve({
        unitCost: new Prisma.Decimal('9.00'),
        totalCost: new Prisma.Decimal('18.00'),
        picked: [],
        quantityWithoutLot: 0,
      });
    });

    await service.create('shop-1', 'staff-1', {
      items: [{ shopProductId: productId, quantity: 2 }],
    });

    expect(order).toEqual(['stock', 'lots']);
  });

  it('ยกเลิกบิลแล้วคืนของเป็นล็อตใหม่ด้วยทุนที่ snapshot ไว้ในบิล', async () => {
    const { service, tx, lots } = setup({
      items: [
        {
          id: itemId,
          shopProductId: productId,
          quantity: 2,
          costPrice: new Prisma.Decimal('9.00'),
        },
      ],
    });

    await service.void('shop-1', 'staff-1', saleId, 'ลูกค้าคืนของ');

    expect(lots.receive).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        shopProductId: productId,
        quantity: 2,
        unitCost: 9,
      }),
    );
  });
});
