import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import { UserRole } from '../database/generated/prisma/enums';
import { ShopsService } from './shops.service';

const OWNER = '0199a0e0-0000-7000-8000-000000000001';
const STAFF = '0199a0e0-0000-7000-8000-0000000000ff';
const SHOP_ID = '0199a0e0-0000-7000-8000-0000000000aa';

const anyDate = (): unknown => expect.any(Date);

function createPrismaMock() {
  return {
    shop: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('ShopsService pause/resume', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let subscriptionsService: {
    getSubscriptionWithPlanOrThrow: jest.Mock;
  };
  let service: ShopsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    subscriptionsService = {
      getSubscriptionWithPlanOrThrow: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        expiresAt: null,
      }),
    };
    service = new ShopsService(
      prisma as unknown as PrismaService,
      subscriptionsService as never,
      { emit: jest.fn() } as never,
    );
  });

  it('เจ้าของพักร้าน ACTIVE ได้โดยเก็บเวลาลง pausedAt', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: SHOP_ID,
      status: 'ACTIVE',
      pausedAt: null,
    });

    await service.pause(OWNER, UserRole.SHOP_OWNER, SHOP_ID);

    expect(prisma.shop.update).toHaveBeenCalledWith({
      where: { id: SHOP_ID },
      data: { pausedAt: anyDate() },
    });
  });

  it('พนักงานไม่มีสิทธิ์พักหรือเปิดร้าน', async () => {
    await expect(
      service.pause(STAFF, UserRole.SHOP_STAFF, SHOP_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.shop.findFirst).not.toHaveBeenCalled();
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it('ร้านที่ Admin ระงับอยู่ เจ้าของเปลี่ยนสถานะไม่ได้', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: SHOP_ID,
      status: 'SUSPENDED',
      pausedAt: null,
    });

    await expect(
      service.pause(OWNER, UserRole.SHOP_OWNER, SHOP_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.shop.update).not.toHaveBeenCalled();
  });

  it('เจ้าของเปิดร้านที่พักไว้กลับมาได้ด้วยการล้าง pausedAt', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: SHOP_ID,
      status: 'ACTIVE',
      pausedAt: new Date('2026-08-27T00:00:00.000Z'),
    });

    await service.resume(OWNER, UserRole.SHOP_OWNER, SHOP_ID);

    expect(prisma.shop.update).toHaveBeenCalledWith({
      where: { id: SHOP_ID },
      data: { pausedAt: null },
    });
  });

  it('พักร้านซ้ำหรือเปิดร้านที่ไม่ได้พักแล้วไม่ได้', async () => {
    prisma.shop.findFirst.mockResolvedValue({
      id: SHOP_ID,
      status: 'ACTIVE',
      pausedAt: new Date(),
    });
    await expect(
      service.pause(OWNER, UserRole.SHOP_OWNER, SHOP_ID),
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.shop.findFirst.mockResolvedValue({
      id: SHOP_ID,
      status: 'ACTIVE',
      pausedAt: null,
    });
    await expect(
      service.resume(OWNER, UserRole.SHOP_OWNER, SHOP_ID),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
