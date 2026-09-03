import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';
import type { User } from '../database/generated/prisma/client';

jest.mock('otplib', () => ({
  generateSecret: jest.fn(() => 'SECRET'),
  generateURI: jest.fn(() => 'otpauth://totp/x'),
  verify: jest.fn(),
}));
jest.mock('qrcode', () => ({
  toDataURL: jest.fn(() => Promise.resolve('data:image/png')),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const otplib = require('otplib') as { verify: jest.Mock };

const USER_ID = '0199a0e0-0000-7000-8000-000000000001';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: USER_ID,
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
    twoFactorSecretEnc: null,
    status: 'ACTIVE',
    lastLoginAt: null,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('AuthService', () => {
  let users: Record<string, jest.Mock>;
  let bcrypt: { hash: jest.Mock; compare: jest.Mock };
  let accessToken: { sign: jest.Mock };
  let refreshToken: Record<string, jest.Mock>;
  let line: { exchangeCodeForProfile: jest.Mock };
  let google: { exchangeCodeForProfile: jest.Mock };
  let challenge: { sign: jest.Mock; verify: jest.Mock };
  let recovery: Record<string, jest.Mock>;
  let mail: {
    sendPasswordResetEmail: jest.Mock;
    sendEmailVerification: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    users = {
      createUser: jest.fn(),
      findByIdentifier: jest.fn(),
      findById: jest.fn(),
      findByLineId: jest.fn(),
      createLineUser: jest.fn(),
      findByGoogleId: jest.fn(),
      findOwnerByEmail: jest.fn(),
      linkGoogleAccount: jest.fn(),
      createGoogleUser: jest.fn(),
      markLoggedIn: jest.fn(),
      sanitize: jest.fn((user: User) => ({ id: user.id })),
      setTwoFactorSecret: jest.fn(),
      enableTwoFactor: jest.fn(),
      disableTwoFactor: jest.fn(),
    };
    bcrypt = { hash: jest.fn(), compare: jest.fn().mockResolvedValue(true) };
    accessToken = { sign: jest.fn().mockResolvedValue('access') };
    refreshToken = {
      issue: jest.fn().mockResolvedValue('refresh'),
      findValid: jest.fn(),
      markUsed: jest.fn(),
      revokeFamily: jest.fn(),
      revokeByToken: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    line = { exchangeCodeForProfile: jest.fn() };
    google = { exchangeCodeForProfile: jest.fn() };
    challenge = {
      sign: jest.fn().mockResolvedValue('challenge-token'),
      verify: jest.fn(),
    };
    recovery = {
      generate: jest.fn().mockResolvedValue(['a', 'b']),
      findValid: jest.fn(),
      markUsed: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    mail = {
      sendPasswordResetEmail: jest.fn(),
      sendEmailVerification: jest.fn(),
    };

    service = new AuthService(
      users as never,
      bcrypt as never,
      accessToken as never,
      refreshToken as never,
      line as never,
      google as never,
      { issue: jest.fn(), findValid: jest.fn(), markUsed: jest.fn() } as never,
      mail as never,
      {
        encrypt: jest.fn((v: string) => v),
        decrypt: jest.fn((v: string) => v),
      } as never,
      challenge as never,
      recovery as never,
      { issue: jest.fn(), findValid: jest.fn(), markUsed: jest.fn() } as never,
      { get: jest.fn(() => 'https://app.example.com') } as never,
    );
  });

  describe('register', () => {
    it('บอกว่าส่งเมลสำเร็จเมื่อส่งผ่าน', async () => {
      users.createUser.mockResolvedValue(makeUser());

      await expect(
        service.register({
          firstName: 'พร',
          lastName: 'ทดสอบ',
          email: 'praew@example.com',
          password: 'secret',
        }),
      ).resolves.toEqual({ emailSent: true });
    });

    // เดิมกลืน error เงียบสนิท ผู้ใช้เห็นว่า "ส่งลิงก์แล้ว" ทั้งที่ไม่มีเมลออกไปเลย
    // แล้วนั่งรอจนเข้าใจว่าสมัครไม่ผ่าน — บัญชีสร้างสำเร็จ จึงห้ามโยน error ทิ้ง
    // แต่ต้องรายงานกลับไปว่าส่งไม่ออก
    it('บัญชียังถูกสร้าง แต่รายงานว่าส่งเมลไม่ออก เมื่อผู้ให้บริการเมลล้ม', async () => {
      users.createUser.mockResolvedValue(makeUser());
      mail.sendEmailVerification.mockRejectedValue(
        new Error('Brevo ตอบกลับ 401'),
      );

      await expect(
        service.register({
          firstName: 'พร',
          lastName: 'ทดสอบ',
          email: 'praew@example.com',
          password: 'secret',
        }),
      ).resolves.toEqual({ emailSent: false });
      expect(users.createUser).toHaveBeenCalled();
    });
  });

  describe('login ด้วยอีเมล/username', () => {
    it('ปฏิเสธบัญชีที่มีอีเมลแต่ยังไม่ยืนยัน', async () => {
      users.findByIdentifier.mockResolvedValue(
        makeUser({ emailVerifiedAt: null }),
      );

      await expect(
        service.login({ identifier: 'praew', password: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ปฏิเสธเมื่อรหัสผ่านไม่ตรง', async () => {
      users.findByIdentifier.mockResolvedValue(makeUser());
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.login({ identifier: 'praew', password: 'x' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('ปฏิเสธบัญชีที่ถูกระงับ', async () => {
      users.findByIdentifier.mockResolvedValue(
        makeUser({ status: 'SUSPENDED' }),
      );

      await expect(
        service.login({ identifier: 'praew', password: 'x' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('คืน challenge แทน token เมื่อเปิด 2FA ไว้', async () => {
      users.findByIdentifier.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      await expect(
        service.login({ identifier: 'praew', password: 'x' }),
      ).resolves.toEqual({
        requires2fa: true,
        challengeToken: 'challenge-token',
      });
      expect(refreshToken.issue).not.toHaveBeenCalled();
    });
  });

  // SRS §111 — เปิด 2FA แล้วต้องกรอกรหัส 6 หลักหลัง login "ทุกช่องทาง"
  // รวม LINE และ Google ด้วย เคยมีบั๊กที่สองช่องทางนี้ข้ามด่านไปเลย
  describe('2FA ต้องบังคับกับ OAuth ด้วย (SRS §111)', () => {
    it('LINE login ที่เปิด 2FA ต้องได้ challenge ไม่ใช่ token', async () => {
      line.exchangeCodeForProfile.mockResolvedValue({
        lineUserId: 'U1',
        displayName: 'praew',
      });
      users.findByLineId.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      await expect(service.loginWithLine('code')).resolves.toEqual({
        requires2fa: true,
        challengeToken: 'challenge-token',
      });
      expect(refreshToken.issue).not.toHaveBeenCalled();
      expect(accessToken.sign).not.toHaveBeenCalled();
    });

    it('Google login ที่เปิด 2FA ต้องได้ challenge ไม่ใช่ token', async () => {
      google.exchangeCodeForProfile.mockResolvedValue({
        googleId: 'G1',
        displayName: 'praew',
        email: 'praew@example.com',
      });
      users.findByGoogleId.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      await expect(service.loginWithGoogle('code')).resolves.toEqual({
        requires2fa: true,
        challengeToken: 'challenge-token',
      });
      expect(refreshToken.issue).not.toHaveBeenCalled();
    });

    it('LINE login ของบัญชีที่ถูกระงับต้องไม่ได้ token', async () => {
      line.exchangeCodeForProfile.mockResolvedValue({
        lineUserId: 'U1',
        displayName: 'praew',
      });
      users.findByLineId.mockResolvedValue(makeUser({ status: 'SUSPENDED' }));

      await expect(service.loginWithLine('code')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('LINE login ปกติ (ไม่เปิด 2FA) ยังออก token ให้ตามเดิม', async () => {
      line.exchangeCodeForProfile.mockResolvedValue({
        lineUserId: 'U1',
        displayName: 'praew',
      });
      users.findByLineId.mockResolvedValue(makeUser());

      await expect(service.loginWithLine('code')).resolves.toEqual(
        expect.objectContaining({
          accessToken: 'access',
          refreshToken: 'refresh',
        }),
      );
    });
  });

  it('บันทึก lastLoginAt ทุกครั้งที่ออก token สำเร็จ', async () => {
    users.findByIdentifier.mockResolvedValue(makeUser());

    await service.login({ identifier: 'praew', password: 'x' });

    expect(users.markLoggedIn).toHaveBeenCalledWith(USER_ID);
  });

  it('ผ่าน 2FA แล้วจึงออก token และบันทึก lastLoginAt', async () => {
    challenge.verify.mockResolvedValue({ sub: USER_ID });
    users.findById.mockResolvedValue(
      makeUser({ twoFactorEnabled: true, twoFactorSecretEnc: 'enc' }),
    );
    otplib.verify.mockResolvedValue({ valid: true });

    await expect(
      service.verifyTwoFactorLogin('challenge', '123456'),
    ).resolves.toEqual(expect.objectContaining({ accessToken: 'access' }));
    expect(users.markLoggedIn).toHaveBeenCalledWith(USER_ID);
  });

  /**
   * Google ส่งอีเมลกลับมาเฉพาะเมื่อ email_verified = true การล็อกอินผ่านจึง
   * พิสูจน์ความเป็นเจ้าของอีเมลนั้นแล้ว — ผูกเข้าบัญชีเดิมได้
   */
  describe('ผูก Google เข้ากับบัญชีที่ใช้อีเมลเดียวกัน', () => {
    beforeEach(() => {
      google.exchangeCodeForProfile.mockResolvedValue({
        googleId: 'G1',
        displayName: 'praew',
        email: 'praew@example.com',
      });
      users.findByGoogleId.mockResolvedValue(null);
    });

    it('ผูกกับบัญชีเดิมแทนการสร้างบัญชีใหม่ (ไม่งั้นชน unique index ของอีเมล)', async () => {
      const existing = makeUser({ id: 'u-1', googleId: null });
      users.findOwnerByEmail.mockResolvedValue(existing);
      users.linkGoogleAccount.mockResolvedValue(
        makeUser({ id: 'u-1', googleId: 'G1' }),
      );

      await service.loginWithGoogle('code');

      expect(users.linkGoogleAccount).toHaveBeenCalledWith('u-1', 'G1');
      expect(users.createGoogleUser).not.toHaveBeenCalled();
    });

    it('สร้างบัญชีใหม่เมื่ออีเมลนี้ยังไม่มีเจ้าของ', async () => {
      users.findOwnerByEmail.mockResolvedValue(null);
      users.createGoogleUser.mockResolvedValue(makeUser({ googleId: 'G1' }));

      await service.loginWithGoogle('code');

      expect(users.createGoogleUser).toHaveBeenCalled();
      expect(users.linkGoogleAccount).not.toHaveBeenCalled();
    });

    // Google ที่ไม่ยืนยันอีเมลจะไม่ส่ง email กลับมา (google-auth.service.ts)
    // จึงไม่มีอะไรให้จับคู่ ต้องไม่เดาจับกับบัญชีใดๆ
    it('ไม่ผูกบัญชีเมื่อ Google ไม่ส่งอีเมลกลับมา', async () => {
      google.exchangeCodeForProfile.mockResolvedValue({
        googleId: 'G1',
        displayName: 'praew',
        email: null,
      });
      users.createGoogleUser.mockResolvedValue(makeUser({ googleId: 'G1' }));

      await service.loginWithGoogle('code');

      expect(users.findOwnerByEmail).not.toHaveBeenCalled();
      expect(users.linkGoogleAccount).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('เพิกถอนทั้ง family เมื่อพบการใช้ token ซ้ำหลังพ้นช่วงผ่อนผัน', async () => {
      refreshToken.findValid.mockResolvedValue({
        id: 'r1',
        familyId: 'f1',
        revokedAt: null,
        usedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser(),
      });

      await expect(service.refresh('token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshToken.revokeFamily).toHaveBeenCalledWith('f1');
    });

    // request ขนานจากหน้าเว็บเดียวกันถือ cookie ใบเดิมมาช้ากว่าเพื่อนไม่กี่วินาที
    // ต้องต่ออายุให้ ไม่ใช่เตะออก
    it('ต่ออายุให้ตามปกติเมื่อใบเดิมเพิ่งถูกหมุนไปในช่วงผ่อนผัน', async () => {
      refreshToken.findValid.mockResolvedValue({
        id: 'r1',
        familyId: 'f1',
        revokedAt: null,
        usedAt: new Date(Date.now() - 1_000),
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser(),
      });

      await expect(service.refresh('token')).resolves.toEqual({
        accessToken: 'access',
        refreshToken: 'refresh',
      });
      expect(refreshToken.revokeFamily).not.toHaveBeenCalled();
      // ใบเดิมถูก mark ไปแล้ว ห้าม mark ซ้ำจนเวลาถูกเลื่อนออกไปเรื่อยๆ
      expect(refreshToken.markUsed).not.toHaveBeenCalled();
    });

    it('ปฏิเสธ token ที่ถูกเพิกถอนแล้วโดยไม่แตะ family', async () => {
      refreshToken.findValid.mockResolvedValue({
        id: 'r1',
        familyId: 'f1',
        revokedAt: new Date(),
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser(),
      });

      await expect(service.refresh('token')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(refreshToken.revokeFamily).not.toHaveBeenCalled();
    });

    it('เพิกถอนทั้ง family เมื่อเจ้าของ token ถูกระงับ', async () => {
      refreshToken.findValid.mockResolvedValue({
        id: 'r1',
        familyId: 'f1',
        revokedAt: null,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: makeUser({ status: 'SUSPENDED' }),
      });

      await expect(service.refresh('token')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(refreshToken.revokeFamily).toHaveBeenCalledWith('f1');
    });
  });

  // SRS §110 — recovery codes ออกให้ "ตอนเปิดใช้งาน 2FA สำเร็จ" เท่านั้น
  it('confirm2fa เปิด 2FA แล้วคืน recovery codes', async () => {
    users.findById.mockResolvedValue(
      makeUser({ twoFactorSecretEnc: 'enc', twoFactorEnabled: false }),
    );
    otplib.verify.mockResolvedValue({ valid: true });

    await expect(service.confirm2fa(USER_ID, '123456')).resolves.toEqual({
      recoveryCodes: ['a', 'b'],
    });
    expect(users.enableTwoFactor).toHaveBeenCalledWith(USER_ID);
  });

  it('confirm2fa ไม่เปิด 2FA ให้เมื่อรหัสผิด', async () => {
    users.findById.mockResolvedValue(makeUser({ twoFactorSecretEnc: 'enc' }));
    otplib.verify.mockResolvedValue({ valid: false });

    await expect(service.confirm2fa(USER_ID, '000000')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.enableTwoFactor).not.toHaveBeenCalled();
  });
  // SRS §112 — ปิด 2FA ยืนยันด้วยรหัส 6 หลักหรือ recovery code
  // password ไม่ใช่เงื่อนไขตาม SRS และบัญชี LINE/Google ล้วนๆ ก็ไม่มีให้กรอก
  describe('disable2fa', () => {
    const withTwoFactor = (overrides: Partial<User> = {}) =>
      makeUser({
        twoFactorEnabled: true,
        twoFactorSecretEnc: 'enc',
        ...overrides,
      });

    it('บัญชี LINE/Google ล้วนๆ (ไม่มี password) ปิด 2FA ได้ด้วย OTP', async () => {
      users.findById.mockResolvedValue(
        withTwoFactor({ password: null, email: null, lineUserId: 'U1' }),
      );
      otplib.verify.mockResolvedValue({ valid: true });

      await service.disable2fa(USER_ID, { otpCode: '123456' });

      expect(users.disableTwoFactor).toHaveBeenCalledWith(USER_ID);
      expect(recovery.revokeAllForUser).toHaveBeenCalledWith(USER_ID);
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('บัญชี LINE/Google ล้วนๆ ปิดด้วย recovery code ได้เช่นกัน', async () => {
      users.findById.mockResolvedValue(withTwoFactor({ password: null }));
      recovery.findValid.mockResolvedValue({ id: 'rc1' });

      await service.disable2fa(USER_ID, { recoveryCode: 'abcd-efgh' });

      expect(users.disableTwoFactor).toHaveBeenCalledWith(USER_ID);
    });

    it('บัญชีที่มี password ยังต้องกรอกให้ถูกเหมือนเดิม', async () => {
      users.findById.mockResolvedValue(withTwoFactor());
      bcrypt.compare.mockResolvedValue(false);

      await expect(
        service.disable2fa(USER_ID, { password: 'ผิด', otpCode: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.disableTwoFactor).not.toHaveBeenCalled();
    });

    it('บัญชีที่มี password แต่ไม่ส่ง password มา ต้องถูกปฏิเสธ', async () => {
      users.findById.mockResolvedValue(withTwoFactor());

      await expect(
        service.disable2fa(USER_ID, { otpCode: '123456' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.disableTwoFactor).not.toHaveBeenCalled();
    });

    it('ไม่ปิดให้เมื่อ OTP ผิด แม้ password จะถูก', async () => {
      users.findById.mockResolvedValue(withTwoFactor());
      otplib.verify.mockResolvedValue({ valid: false });

      await expect(
        service.disable2fa(USER_ID, { password: 'ถูก', otpCode: '000000' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.disableTwoFactor).not.toHaveBeenCalled();
    });

    it('ไม่ปิดให้เมื่อ recovery code ใช้ไม่ได้', async () => {
      users.findById.mockResolvedValue(withTwoFactor({ password: null }));
      recovery.findValid.mockResolvedValue(null);

      await expect(
        service.disable2fa(USER_ID, { recoveryCode: 'ไม่มีจริง' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.disableTwoFactor).not.toHaveBeenCalled();
    });

    // กันไว้เผื่อมีคนแก้ DTO ทีหลังจนไม่บังคับให้ส่งอะไรมาเลย
    it('ไม่ปิดให้เมื่อไม่ได้ส่งทั้ง OTP และ recovery code', async () => {
      users.findById.mockResolvedValue(withTwoFactor({ password: null }));

      await expect(service.disable2fa(USER_ID, {})).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(users.disableTwoFactor).not.toHaveBeenCalled();
    });
  });
});
