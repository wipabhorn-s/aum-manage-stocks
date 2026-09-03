import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { UsersService } from './users.service';
import type { User } from '../database/generated/prisma/client';

/** expect.any() คืน any — ห่อให้เป็น unknown เพื่อไม่ให้ชน no-unsafe-assignment */
const anyDate = (): unknown => expect.any(Date);

/** expect.objectContaining() คืน any — ห่อเป็น unknown กัน no-unsafe-assignment */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

const OWNER = '0199a0e0-0000-7000-8000-000000000001';
const STAFF = '0199a0e0-0000-7000-8000-0000000000ff';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: OWNER,
    firstName: 'พร',
    lastName: 'ทดสอบ',
    email: 'praew@example.com',
    emailVerifiedAt: new Date('2026-01-01'),
    username: 'praew',
    password: 'hashed',
    lineUserId: null,
    googleId: null,
    ownerId: null,
    role: 'SHOP_OWNER',
    twoFactorEnabled: false,
    twoFactorSecretEnc: 'secret-enc',
    status: 'ACTIVE',
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('UsersService', () => {
  let prisma: {
    user: Record<string, jest.Mock>;
    subscription: { findUnique: jest.Mock };
    refreshToken: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let bcrypt: { hash: jest.Mock; compare: jest.Mock };
  let accountContext: { assertNotReadOnly: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      subscription: { findUnique: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn(),
    };
    // createStaff() นับโควตาในทรานแซกชันเดียวกับการสร้างพนักงาน เพื่อกันการยิง
    // พร้อมกันแซงโควตา — mock จึงต้องส่ง client ตัวเดิมเข้า callback ให้
    prisma.$transaction.mockImplementation((arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: typeof prisma) => unknown)(prisma)
        : arg,
    );
    bcrypt = {
      hash: jest.fn().mockResolvedValue('hashed'),
      compare: jest.fn().mockResolvedValue(true),
    };
    accountContext = {
      assertNotReadOnly: jest.fn().mockResolvedValue(undefined),
    };

    service = new UsersService(
      prisma as never,
      bcrypt as never,
      { exchangeCodeForProfile: jest.fn() } as never,
      { exchangeCodeForProfile: jest.fn() } as never,
      { get: jest.fn(() => 'https://app.example.com') } as never,
      accountContext as never,
    );
  });

  it('sanitize ตัด password และ 2FA secret ออกเสมอ แต่บอก hasPassword', () => {
    const result = service.sanitize(makeUser());

    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('twoFactorSecretEnc');
    expect(result.hasPassword).toBe(true);
  });

  it('sanitize บอก hasPassword=false เมื่อบัญชียังไม่มีรหัสผ่าน', () => {
    expect(service.sanitize(makeUser({ password: null })).hasPassword).toBe(
      false,
    );
  });

  describe('createStaff', () => {
    const dto = {
      firstName: 'อั้ม',
      lastName: 'ทดสอบ',
      username: 'aum',
      password: 'Aa1!aaaa',
    };

    function givePlan(staffQuota: number, used: number) {
      prisma.subscription.findUnique.mockResolvedValue({
        status: 'ACTIVE',
        plan: { includedStaffQuota: staffQuota },
      });
      prisma.user.count.mockResolvedValue(used);
    }

    // SRS §123 — แพ็กเกจหมดอายุ = read-only สร้างพนักงานใหม่ไม่ได้
    it('ปฏิเสธเมื่อแพ็กเกจอยู่ในโหมด read-only', async () => {
      accountContext.assertNotReadOnly.mockRejectedValue(
        new ForbiddenException('read-only'),
      );

      await expect(service.createStaff(OWNER, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    // SRS §153 — Free Plan (staff quota = 0) สร้างบัญชีพนักงานไม่ได้เลย
    it('ปฏิเสธ Free Plan ที่ staff quota = 0', async () => {
      givePlan(0, 0);

      await expect(service.createStaff(OWNER, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('ปฏิเสธเมื่อใช้ staff quota ครบแล้ว', async () => {
      givePlan(6, 6);

      await expect(service.createStaff(OWNER, dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('สร้างพนักงานเป็น SHOP_STAFF ที่ผูกกับเจ้าของร้าน', async () => {
      givePlan(6, 2);
      prisma.user.create.mockResolvedValue(
        makeUser({ id: STAFF, role: 'SHOP_STAFF', ownerId: OWNER }),
      );

      await service.createStaff(OWNER, dto);

      expect(prisma.user.create).toHaveBeenCalledWith(
        containing({
          data: containing({
            role: 'SHOP_STAFF',
            ownerId: OWNER,
            password: 'hashed',
          }),
        }),
      );
    });
  });

  describe('changePassword (SRS §132 — ต้องยืนยันรหัสเดิม)', () => {
    it('ปฏิเสธเมื่อรหัสผ่านเดิมไม่ถูกต้อง', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.changePassword(OWNER, {
          oldPassword: 'x',
          newPassword: 'Aa1!aaaa',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('เตะ session เก่าทิ้งหลังเปลี่ยนรหัสผ่านสำเร็จ', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.changePassword(OWNER, {
        oldPassword: 'old',
        newPassword: 'Aa1!aaaa',
      });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('บอกให้ไปใช้เส้นตั้งรหัสครั้งแรกถ้าบัญชียังไม่มีรหัสผ่าน', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ password: null }));

      await expect(
        service.changePassword(OWNER, {
          oldPassword: 'x',
          newPassword: 'Aa1!aaaa',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // SRS §105 — ตั้งรหัสครั้งแรกได้เฉพาะบัญชีที่ยังไม่มีรหัสผ่าน
  it('setFirstPassword ปฏิเสธบัญชีที่มีรหัสผ่านอยู่แล้ว', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser());

    await expect(
      service.setFirstPassword(OWNER, 'Aa1!aaaa'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // SRS §91 — ต้องเหลืออย่างน้อย 1 ช่องทางเข้าสู่ระบบเสมอ
  it('unlinkLine ปฏิเสธเมื่อ LINE เป็นช่องทางเข้าระบบช่องทางสุดท้าย', async () => {
    prisma.user.findUnique.mockResolvedValue(
      makeUser({ lineUserId: 'U1', password: null, googleId: null }),
    );

    await expect(service.unlinkLine(OWNER)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('unlinkLine ผ่านเมื่อยังมีรหัสผ่านเหลืออยู่', async () => {
    prisma.user.findUnique.mockResolvedValue(makeUser({ lineUserId: 'U1' }));

    await service.unlinkLine(OWNER);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: OWNER },
      data: { lineUserId: null },
    });
  });

  describe('ขอบเขตพนักงานของเจ้าของร้าน', () => {
    it('ตอบ 404 เมื่อพนักงานไม่ใช่ของเจ้าของร้านคนนี้', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(service.getStaff(OWNER, STAFF)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('ค้นหาพนักงานโดยผูกกับ ownerId และไม่รวมที่ถูกลบแล้ว', async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeUser({ id: STAFF, role: 'SHOP_STAFF', ownerId: OWNER }),
      );

      await service.getStaff(OWNER, STAFF);

      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          id: STAFF,
          ownerId: OWNER,
          role: 'SHOP_STAFF',
          deletedAt: null,
        },
      });
    });

    it('deleteStaff เป็น soft delete และเพิกถอน session ในทรานแซกชันเดียว', async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeUser({ id: STAFF, role: 'SHOP_STAFF', ownerId: OWNER }),
      );

      await service.deleteStaff(OWNER, STAFF);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: STAFF },
        // ต้องล้าง lineUserId/googleId ด้วย ไม่ใช่ตั้งแค่ deletedAt — ดูคอมเมนต์
        // ใน deleteStaff() ว่าทำไมการเก็บค้างไว้ถึงอันตราย
        data: { deletedAt: anyDate(), lineUserId: null, googleId: null },
      });
    });

    // แถวที่ตายแล้วต้องไม่จองตัวตน LINE ของคนเป็นๆ ไว้ ไม่งั้นอดีตพนักงานที่
    // ล็อกอินด้วย LINE จะชน unique constraint แล้วได้ error 500 แทนบัญชีใหม่
    it('deleteStaff คืนตัวตน LINE/Google ให้เจ้าตัวไปใช้สมัครใหม่ได้', async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeUser({
          id: STAFF,
          role: 'SHOP_STAFF',
          ownerId: OWNER,
          lineUserId: 'U_line_staff',
        }),
      );

      await service.deleteStaff(OWNER, STAFF);

      const [[updateArgs]] = prisma.user.update.mock.calls as [
        [{ data: { lineUserId: string | null; googleId: string | null } }],
      ];
      expect(updateArgs.data.lineUserId).toBeNull();
      expect(updateArgs.data.googleId).toBeNull();
    });

    it('resetStaffPassword ไม่ต้องรู้รหัสเดิม แต่เตะ session พนักงานทิ้ง', async () => {
      prisma.user.findFirst.mockResolvedValue(
        makeUser({ id: STAFF, role: 'SHOP_STAFF', ownerId: OWNER }),
      );

      await service.resetStaffPassword(OWNER, STAFF, 'Aa1!aaaa');

      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });
  });

  it('markLoggedIn บันทึกเวลาเข้าใช้งานล่าสุด', async () => {
    await service.markLoggedIn(OWNER);

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: OWNER },
      data: { lastLoginAt: anyDate() },
    });
  });
});
