import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import {
  PaymentPurpose,
  PaymentStatus,
} from '../database/generated/prisma/enums';

/** expect.any() คืน any — ห่อให้เป็น unknown เพื่อไม่ให้ชน no-unsafe-assignment */
const anyDate = (): unknown => expect.any(Date);

/** expect.objectContaining() คืน any — ห่อเป็น unknown กัน no-unsafe-assignment */
const containing = (shape: Record<string, unknown>): unknown =>
  expect.objectContaining(shape);

const USER = '0199a0e0-0000-7000-8000-000000000001';
const OTHER = '0199a0e0-0000-7000-8000-000000000002';
const PAYMENT = '0199a0e0-0000-7000-8000-000000000100';
const SUB = '0199a0e0-0000-7000-8000-000000000200';
const NOW = new Date('2026-08-28T00:00:00.000Z');
/** แพ็กเกจปัจจุบันยังเหลืออายุอีกครึ่งปี — ยังต่ออายุไม่ได้ */
const FUTURE = new Date('2027-02-28T00:00:00.000Z');
/** เหลือ 18 วัน — อยู่ในหน้าต่างต่ออายุ 30 วันแล้ว */
const DUE_SOON = new Date('2026-09-15T00:00:00.000Z');

const FREE = {
  id: 'p-free',
  code: 'FREE',
  nameTh: 'ฟรี',
  priceThb: 0,
  durationMonths: null,
  includedShopQuota: 1,
  isFree: true,
  isActive: true,
};
const PLUS = {
  id: 'p-plus',
  code: 'PLUS',
  nameTh: 'พลัส',
  priceThb: 2499,
  durationMonths: 12,
  includedShopQuota: 3,
  isFree: false,
  isActive: true,
};
const PRO = {
  id: 'p-pro',
  code: 'PRO',
  nameTh: 'โปร',
  priceThb: 3499,
  durationMonths: 12,
  includedShopQuota: 5,
  isFree: false,
  isActive: true,
};

function intent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pi_test_1',
    status: 'succeeded',
    amount_received: 249900,
    client_secret: 'pi_test_1_secret',
    metadata: { userId: USER, planCode: 'PLUS' },
    ...overrides,
  } as never;
}

describe('PaymentsService', () => {
  let prisma: {
    payment: Record<string, jest.Mock>;
    subscriptionPlan: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let stripe: {
    createCardPaymentIntent: jest.Mock;
    retrievePaymentIntent: jest.Mock;
    cancelPaymentIntent: jest.Mock;
  };
  let subscriptions: {
    getSubscriptionWithPlanOrThrow: jest.Mock;
    applyUpgrade: jest.Mock;
    applyRenewal: jest.Mock;
  };
  let service: PaymentsService;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      payment: {
        // createdAt ต้องมีจริง — listMyPayments()/createSubscriptionPaymentIntent()
        // ใช้คำนวณหน้าต่าง 24 ชม. ของใบชำระเงิน
        create: jest.fn().mockResolvedValue({ id: PAYMENT, createdAt: NOW }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      subscriptionPlan: { findUnique: jest.fn() },
      // ทรานแซกชันแบบ interactive — เรียก callback ด้วย tx จำลอง
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    stripe = {
      createCardPaymentIntent: jest.fn().mockResolvedValue(intent()),
      retrievePaymentIntent: jest.fn().mockResolvedValue(intent()),
      cancelPaymentIntent: jest.fn().mockResolvedValue({}),
    };
    subscriptions = {
      getSubscriptionWithPlanOrThrow: jest.fn(),
      applyUpgrade: jest.fn(),
      applyRenewal: jest.fn(),
    };

    service = new PaymentsService(
      prisma as never,
      stripe as never,
      subscriptions as never,
      { get: jest.fn(() => 'https://app.example.com/') } as never,
    );
    errorLog = silenceLogger(service);
  });

  /** เงียบ log ระหว่างเทสต์ แต่ยังตรวจได้ว่า error ถูกเรียก */
  function silenceLogger(target: PaymentsService): jest.SpyInstance {
    const logger = target['logger'];
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    return jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  }

  describe('createSubscriptionPaymentIntent', () => {
    function onPlan(
      plan: typeof FREE | typeof PLUS | typeof PRO,
      overrides: { status?: string; expiresAt?: Date | null } = {},
    ) {
      subscriptions.getSubscriptionWithPlanOrThrow.mockResolvedValue({
        id: SUB,
        planId: plan.id,
        plan,
        status: overrides.status ?? 'ACTIVE',
        expiresAt:
          overrides.expiresAt === undefined
            ? plan.isFree
              ? null
              : FUTURE
            : overrides.expiresAt,
      });
    }

    it('ตอบ 404 เมื่อไม่มีแพ็กเกจนี้ในระบบ', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('บล็อกการต่ออายุที่ยังไม่ถึงกำหนด (เหลือเกิน 30 วัน)', async () => {
      onPlan(PLUS); // FUTURE = เหลืออีกครึ่งปี
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.createCardPaymentIntent).not.toHaveBeenCalled();
    });

    // ใบค้างหนึ่งใบต่อผู้ใช้หนึ่งคน — กันประวัติงอกหลายแถวต่อการซื้อครั้งเดียว
    it('บล็อกการเปิดใบใหม่เมื่อยังมีใบค้างอยู่', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);
      prisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT,
        status: PaymentStatus.PENDING,
        createdAt: NOW,
      });

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    // SRS §66/§110 — ไม่มีเส้นทางลดแพ็กเกจ
    it('บล็อกการซื้อแพ็กเกจที่ quota ต่ำกว่าแพ็กเกจปัจจุบัน', async () => {
      onPlan(PRO);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(stripe.createCardPaymentIntent).not.toHaveBeenCalled();
    });

    it('ซื้อแพ็กเกจเดิม = ต่ออายุ (purpose RENEWAL)', async () => {
      onPlan(PLUS, { expiresAt: DUE_SOON });
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await service.createSubscriptionPaymentIntent(USER, 'PLUS');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        containing({
          data: containing({
            purpose: PaymentPurpose.RENEWAL,
            status: PaymentStatus.PENDING,
            providerRef: 'pi_test_1',
          }),
        }),
      );
    });

    it('ซื้อแพ็กเกจที่สูงกว่า = อัปเกรด (purpose NEW_SUBSCRIPTION)', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PRO);

      await service.createSubscriptionPaymentIntent(USER, 'PRO');

      expect(prisma.payment.create).toHaveBeenCalledWith(
        containing({
          data: containing({ purpose: PaymentPurpose.NEW_SUBSCRIPTION }),
        }),
      );
    });

    it('ยังไม่เปลี่ยนแพ็กเกจให้ตอนเปิดรายการชำระเงิน', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await service.createSubscriptionPaymentIntent(USER, 'PLUS');

      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
      expect(subscriptions.applyRenewal).not.toHaveBeenCalled();
    });

    it('ส่งราคาเป็นบาทให้ StripeService แปลงเป็นสตางค์', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await service.createSubscriptionPaymentIntent(USER, 'PLUS');

      expect(stripe.createCardPaymentIntent).toHaveBeenCalledWith(2499, {
        userId: USER,
        planCode: 'PLUS',
        purpose: PaymentPurpose.NEW_SUBSCRIPTION,
        keepExpiry: 'false',
      });
    });

    it('คืน client secret ให้ฟอร์มบัตรใช้ต่อ', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).resolves.toEqual({
        paymentId: PAYMENT,
        clientSecret: 'pi_test_1_secret',
        amountThb: 2499,
        fullPriceThb: 2499,
        prorated: false,
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      });
    });

    /**
     * ทีมเลือกรูปแบบ "จ่ายส่วนต่าง วันหมดอายุคงเดิม" สำหรับการอัปเกรดระหว่าง
     * แพ็กเกจที่เสียเงินด้วยกัน — ราคาที่เก็บกับวันหมดอายุต้องไปด้วยกันเสมอ
     * จึงส่ง keepExpiry ไปกับ intent แทนการให้ applyUpgrade() คำนวณเองภายหลัง
     */
    it('PLUS -> PRO ที่ยังไม่หมดอายุ = เก็บเฉพาะส่วนต่าง และคงวันหมดอายุเดิม', async () => {
      onPlan(PLUS);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PRO);

      const result = await service.createSubscriptionPaymentIntent(USER, 'PRO');

      expect(stripe.createCardPaymentIntent).toHaveBeenCalledWith(1000, {
        userId: USER,
        planCode: 'PRO',
        purpose: PaymentPurpose.NEW_SUBSCRIPTION,
        keepExpiry: 'true',
      });
      expect(result).toEqual(
        containing({ amountThb: 1000, fullPriceThb: 3499, prorated: true }),
      );
      expect(prisma.payment.create).toHaveBeenCalledWith(
        containing({ data: containing({ amountThb: 1000 }) }),
      );
    });

    it('FREE -> PRO = จ่ายเต็ม เพราะไม่เคยจ่ายอะไรมาก่อน', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PRO);

      await service.createSubscriptionPaymentIntent(USER, 'PRO');

      expect(stripe.createCardPaymentIntent).toHaveBeenCalledWith(
        3499,
        containing({ keepExpiry: 'false' }),
      );
    });

    it('PLUS ที่หมดอายุแล้ว -> PRO = จ่ายเต็ม เพราะไม่เหลือสิทธิ์ให้หัก', async () => {
      onPlan(PLUS, { expiresAt: new Date('2026-01-01T00:00:00.000Z') });
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PRO);

      await service.createSubscriptionPaymentIntent(USER, 'PRO');

      expect(stripe.createCardPaymentIntent).toHaveBeenCalledWith(
        3499,
        containing({ keepExpiry: 'false' }),
      );
    });

    it('ต่ออายุแพ็กเกจเดิม = จ่ายเต็ม ไม่ใช่ส่วนต่าง', async () => {
      onPlan(PLUS, { expiresAt: DUE_SOON });
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);

      await service.createSubscriptionPaymentIntent(USER, 'PLUS');

      expect(stripe.createCardPaymentIntent).toHaveBeenCalledWith(
        2499,
        containing({ keepExpiry: 'false', purpose: PaymentPurpose.RENEWAL }),
      );
    });

    // ใบเก่าที่ค้างคือต้นเหตุของเคส "จ่ายใบ PLUS เก่าหลังอัปเป็น PRO ไปแล้ว"
    it('ยกเลิกใบที่ค้างอยู่ก่อนเปิดใบใหม่', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);
      prisma.payment.findMany.mockResolvedValue([
        { id: 'old', providerRef: 'pi_old' },
      ]);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'old',
        status: PaymentStatus.PENDING,
      });

      await service.createSubscriptionPaymentIntent(USER, 'PLUS');

      expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_old');
      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'old' },
        data: { status: PaymentStatus.FAILED },
      });
    });

    it('ปิดแถวฝั่งเราต่อได้แม้ Stripe ยกเลิกใบเก่าไม่สำเร็จ', async () => {
      onPlan(FREE);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(PLUS);
      prisma.payment.findMany.mockResolvedValue([
        { id: 'old', providerRef: 'pi_old' },
      ]);
      prisma.payment.findUnique.mockResolvedValue({
        id: 'old',
        status: PaymentStatus.PENDING,
      });
      stripe.cancelPaymentIntent.mockRejectedValue(
        new Error('already canceled'),
      );

      await expect(
        service.createSubscriptionPaymentIntent(USER, 'PLUS'),
      ).resolves.toEqual(
        expect.objectContaining({ clientSecret: 'pi_test_1_secret' }),
      );
      expect(prisma.payment.update).toHaveBeenCalled();
    });
  });

  describe('cancelPayment', () => {
    it('ยกเลิกฝั่ง Stripe ก่อน แล้วค่อยพลิกแถวเป็น CANCELLED', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT,
        userId: USER,
        status: PaymentStatus.PENDING,
        providerRef: 'pi_test_1',
        createdAt: NOW,
      });

      await service.cancelPayment(USER, PAYMENT);

      expect(stripe.cancelPaymentIntent).toHaveBeenCalledWith('pi_test_1');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        containing({
          where: containing({ id: PAYMENT, status: PaymentStatus.PENDING }),
          data: { status: PaymentStatus.CANCELLED },
        }),
      );
    });

    it('ยกเลิกใบที่จ่ายแล้วไม่ได้', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT,
        userId: USER,
        status: PaymentStatus.PAID,
        providerRef: 'pi_test_1',
        createdAt: NOW,
      });

      await expect(service.cancelPayment(USER, PAYMENT)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripe.cancelPaymentIntent).not.toHaveBeenCalled();
    });

    // กรองด้วย userId ตั้งแต่ query — ของคนอื่นต้องเป็น 404 ไม่ใช่ 403
    it('ตอบ 404 เมื่อใบไม่ใช่ของผู้ใช้คนนี้', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.cancelPayment(OTHER, PAYMENT),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('confirmPaymentIntent', () => {
    function pendingRow(overrides: Record<string, unknown> = {}) {
      return {
        id: PAYMENT,
        userId: USER,
        status: PaymentStatus.PENDING,
        purpose: PaymentPurpose.NEW_SUBSCRIPTION,
        amountThb: 2499,
        providerRef: 'pi_test_1',
        ...overrides,
      };
    }

    it('ปฏิเสธเมื่อ intent เป็นของบัญชีอื่น', async () => {
      prisma.payment.findFirst.mockResolvedValue(pendingRow());
      stripe.retrievePaymentIntent.mockResolvedValue(
        intent({ metadata: { userId: OTHER, planCode: 'PLUS' } }),
      );

      await expect(
        service.confirmPaymentIntent(USER, PAYMENT),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
    });

    it('ปฏิเสธเมื่อ Stripe ยังไม่ยืนยันว่าจ่ายสำเร็จ', async () => {
      prisma.payment.findFirst.mockResolvedValue(pendingRow());
      stripe.retrievePaymentIntent.mockResolvedValue(
        intent({ status: 'requires_payment_method' }),
      );

      await expect(
        service.confirmPaymentIntent(USER, PAYMENT),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // กันคนจ่ายน้อยกว่าราคาแพ็กเกจแล้วอ้างว่าจ่ายครบ
    it('ปฏิเสธเมื่อยอดที่จ่ายไม่ตรงกับราคาแพ็กเกจ', async () => {
      prisma.payment.findFirst.mockResolvedValue(pendingRow());
      stripe.retrievePaymentIntent.mockResolvedValue(
        intent({ amount_received: 100 }),
      );

      await expect(
        service.confirmPaymentIntent(USER, PAYMENT),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('ผ่านครบทุกด่านแล้วจึงอัปเกรดให้', async () => {
      prisma.payment.findFirst.mockResolvedValue(pendingRow());
      prisma.payment.findUnique.mockResolvedValue(pendingRow());

      await expect(
        service.confirmPaymentIntent(USER, PAYMENT),
      ).resolves.toEqual({ message: 'ชำระเงินสำเร็จ' });
      expect(subscriptions.applyUpgrade).toHaveBeenCalledWith(
        USER,
        'PLUS',
        prisma,
        // metadata ของ intent ในเทสต์นี้ไม่มี keepExpiry = จ่ายเต็ม จึงต้องได้
        // รอบใหม่เต็มระยะเวลา ไม่ใช่คงวันหมดอายุเดิม
        { keepExpiry: false },
      );
    });

    it('รายการที่ปิดยอดไปแล้วตอบกลับเฉยๆ ไม่อัปเกรดซ้ำ', async () => {
      prisma.payment.findFirst.mockResolvedValue(
        pendingRow({ status: PaymentStatus.PAID }),
      );

      await service.confirmPaymentIntent(USER, PAYMENT);

      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
    });
  });

  /**
   * ระบบนี้ไม่ใช้ Stripe webhook — เส้นทางจริงที่ปิดยอดคือ
   * POST /payments/:id/confirm ซึ่งฟอร์มบัตรเรียกทันทีหลัง
   * stripe.confirmCardPayment() ผ่าน
   */
  describe('ยืนยันการชำระเงิน — POST /payments/:id/confirm', () => {
    function pending(overrides: Record<string, unknown> = {}) {
      return {
        id: PAYMENT,
        userId: USER,
        // ต้องตรงกับ amount_received ของ intent() (249900 สตางค์)
        amountThb: 2499,
        providerRef: 'pi_test_1',
        status: PaymentStatus.PENDING,
        purpose: PaymentPurpose.NEW_SUBSCRIPTION,
        ...overrides,
      };
    }

    /** confirm อ่านแถวด้วย findFirst ส่วน fulfill อ่านซ้ำด้วย findUnique */
    function givenPayment(row: unknown) {
      prisma.payment.findFirst.mockResolvedValue(row);
      prisma.payment.findUnique.mockResolvedValue(row);
    }

    async function fulfill(object = intent()) {
      stripe.retrievePaymentIntent.mockResolvedValue(object);
      return service.confirmPaymentIntent(USER, PAYMENT);
    }

    it('เปลี่ยนแพ็กเกจและปิดยอดในทรานแซกชันเดียว', async () => {
      givenPayment(pending());

      await fulfill();

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: PAYMENT, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, paidAt: anyDate() },
      });
      expect(subscriptions.applyUpgrade).toHaveBeenCalledWith(
        USER,
        'PLUS',
        prisma,
        // metadata ของ intent ในเทสต์นี้ไม่มี keepExpiry = จ่ายเต็ม จึงต้องได้
        // รอบใหม่เต็มระยะเวลา ไม่ใช่คงวันหมดอายุเดิม
        { keepExpiry: false },
      );
    });

    it('purpose RENEWAL เรียกต่ออายุ ไม่ใช่อัปเกรด', async () => {
      givenPayment(pending({ purpose: PaymentPurpose.RENEWAL }));

      await fulfill();

      expect(subscriptions.applyRenewal).toHaveBeenCalled();
      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
    });

    // ผู้ใช้กด confirm ซ้ำ หรือ listMyPayments() ตามเก็บไปแล้ว
    it('ยืนยันซ้ำหลังปิดยอดไปแล้ว ต้องไม่ต่ออายุซ้ำ', async () => {
      givenPayment(pending({ status: PaymentStatus.PAID }));

      await expect(fulfill()).resolves.toEqual({
        message: 'รายการนี้ชำระเงินแล้ว',
      });
      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
    });

    // confirm กับ listMyPayments() ที่วิ่งพร้อมกันจะอ่านเจอ PENDING ทั้งคู่
    // ตัวที่จองแถวไม่ทันจะได้ count = 0 แล้วต้องถอยออกโดยไม่ต่ออายุให้อีกรอบ
    it('กันการปิดยอดซ้ำที่วิ่งพร้อมกันด้วยการจองแถวใน tx', async () => {
      givenPayment(pending());
      prisma.payment.updateMany.mockResolvedValue({ count: 0 });

      await fulfill();

      expect(subscriptions.applyUpgrade).not.toHaveBeenCalled();
    });

    it('ตอบ 404 เมื่อไม่พบรายการชำระเงินนี้', async () => {
      givenPayment(null);

      await expect(fulfill()).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    // เงินถูกตัดแล้วแต่เปลี่ยนแพ็กเกจไม่ได้ (เช่นจ่ายใบ PLUS เก่าหลังอัปเป็น
    // PRO ไปแล้ว) ลองใหม่อีกกี่ครั้งก็ไม่ผ่าน — ต้องบันทึกไว้ว่าจ่ายแล้ว
    // ไม่ใช่ปล่อยให้ค้าง PENDING เหมือนไม่เคยจ่าย
    it('บันทึกเป็น PAID เมื่อจ่ายแล้วแต่เปลี่ยนแพ็กเกจไม่ได้', async () => {
      givenPayment(pending());
      subscriptions.applyUpgrade.mockRejectedValue(
        new ConflictException('ลดแพ็กเกจไม่ได้'),
      );

      await expect(fulfill()).resolves.toEqual({ message: 'ชำระเงินสำเร็จ' });

      expect(prisma.payment.updateMany).toHaveBeenLastCalledWith({
        where: { id: PAYMENT, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.PAID, paidAt: anyDate() },
      });
      expect(errorLog).toHaveBeenCalled();
    });

    // ตรงข้ามกัน: DB ล่ม/timeout เป็นความผิดพลาดชั่วคราว ต้องปล่อยให้ throw
    // ผู้ใช้จะได้กด "ชำระอีกครั้ง" แล้วปิดยอดสำเร็จในรอบถัดไป
    it('โยน error ต่อเมื่อเป็นความผิดพลาดชั่วคราว', async () => {
      givenPayment(pending());
      subscriptions.applyUpgrade.mockRejectedValue(new Error('DB timeout'));

      await expect(fulfill()).rejects.toThrow('DB timeout');
    });
  });

  describe('การอ่านประวัติการชำระเงิน', () => {
    it('ตอบ 404 (ไม่ใช่ 403) เมื่อเป็นรายการของคนอื่น เพื่อกัน IDOR', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.getMyPayment(OTHER, PAYMENT)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        containing({ where: { id: PAYMENT, userId: OTHER } }),
      );
    });

    it('listMyPayments กรองด้วย userId เสมอ', async () => {
      await service.listMyPayments(USER);

      expect(prisma.payment.findMany).toHaveBeenCalledWith(
        containing({
          where: containing({ userId: USER }),
        }),
      );
    });

    it('listMyPayments ไม่เอาใบที่ถูกยกเลิกมาตั้งแต่ตอนคิวรี', async () => {
      await service.listMyPayments(USER);

      const [args] = prisma.payment.findMany.mock.calls.at(-1) as [
        { where: { status?: { not?: string } } },
      ];
      expect(args.where.status?.not).toBe('CANCELLED');
    });

    /**
     * เดิม take = 5 ซึ่งไม่ใช่การแบ่งหน้า แต่ตัดรายการที่เก่ากว่านั้นทิ้งไปเลย
     * โดยไม่มีทางเปิดดู — ฝั่งเว็บแสดงทั้งหมดในกล่องที่เลื่อนได้แทน
     */
    it('listMyPayments คืนประวัติทั้งหมด ไม่ได้ตัดเหลือ 5 รายการล่าสุด', async () => {
      await service.listMyPayments(USER);

      const [args] = prisma.payment.findMany.mock.calls.at(-1) as [
        { take?: number },
      ];
      expect(args.take).toBeGreaterThanOrEqual(100);
    });
  });
});
