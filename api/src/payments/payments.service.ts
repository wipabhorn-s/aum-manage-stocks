import { EnvVariable } from '@/config/env.validation';
import { PrismaService } from '@/database/prisma.service';
import {
  PaymentPurpose,
  PaymentStatus,
} from '@/database/generated/prisma/enums';
import { PaidPlanCode } from '@/payments/dto/create-subscription-payment.dto';
import {
  daysUntilExpiry,
  isPaymentWindowOpen,
  isRenewalDue,
  paymentExpiresAt,
  resolveUpgradeCharge,
  PAYMENT_WINDOW_HOURS,
  RENEWAL_WINDOW_DAYS,
} from '@/payments/payment-pricing.util';
import { StripeService } from '@/payments/stripe.service';
import { SubscriptionsService } from '@/subscriptions/subscriptions.service';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';

const PROVIDER = 'stripe';

/**
 * เพดานของประวัติการชำระเงินที่ส่งกลับไป — ฝั่งเว็บแสดงทั้งหมดในกล่องที่เลื่อนได้
 *
 * เดิม take = 5 ซึ่งไม่ใช่การแบ่งหน้า แต่เป็นการ "ตัดทิ้ง" รายการที่เก่ากว่านั้น
 * ไปเลยโดยไม่มีทางเปิดดู ตัวเลขนี้จึงเป็นแค่กันเคสสุดโต่งไม่ให้ payload บาน
 * ไม่ใช่จำนวนที่ตั้งใจให้ผู้ใช้เห็น — ซื้อ/ต่ออายุกันปีละครั้ง 100 คือทั้งหมดจริง
 */
const HISTORY_LIMIT = 100;
/** Stripe คิดเงินเป็นหน่วยย่อยที่สุด — บาทต้องคูณ 100 เป็นสตางค์ */
const SATANG_PER_BAHT = 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly configService: ConfigService<EnvVariable, true>,
  ) {}

  /** สร้าง PaymentIntent สำหรับฟอร์มบัตรบนเว็บ โดยไม่ใช้หน้า Stripe Checkout */
  async createSubscriptionPaymentIntent(
    userId: string,
    planCode: PaidPlanCode,
    reusePaymentId?: string,
  ) {
    const subscription =
      await this.subscriptionsService.getSubscriptionWithPlanOrThrow(userId);
    const targetPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { code: planCode },
    });
    if (!targetPlan || !targetPlan.isActive) {
      throw new NotFoundException('ไม่พบแพ็กเกจนี้');
    }
    if (targetPlan.isFree || targetPlan.durationMonths === null) {
      throw new BadRequestException('แพ็กเกจนี้ไม่ต้องชำระเงิน');
    }
    if (
      targetPlan.id !== subscription.planId &&
      targetPlan.includedShopQuota <= subscription.plan.includedShopQuota
    ) {
      throw new ConflictException(
        'ไม่สามารถลดระดับแพ็กเกจได้ (SRS ไม่มีเส้นทางลดแพ็กเกจ)',
      );
    }

    const purpose =
      targetPlan.id === subscription.planId
        ? PaymentPurpose.RENEWAL
        : PaymentPurpose.NEW_SUBSCRIPTION;

    // ต่ออายุก่อนกำหนดไม่ได้ — applyRenewal() ต่อท้ายวันเดิมให้ก็จริง แต่เงิน
    // ที่จ่ายล่วงหน้าหลายเดือนคืนไม่ได้ เพราะระบบไม่มีเส้นทางคืนเงินอัตโนมัติ
    if (purpose === PaymentPurpose.RENEWAL) {
      const daysLeft = daysUntilExpiry(subscription.expiresAt);
      if (!isRenewalDue(subscription.expiresAt)) {
        throw new ConflictException({
          message:
            daysLeft === null
              ? 'แพ็กเกจนี้ไม่มีวันหมดอายุ จึงไม่ต้องต่ออายุ'
              : `ยังไม่ถึงกำหนดต่ออายุ — ต่ออายุได้เมื่อเหลือไม่เกิน ${RENEWAL_WINDOW_DAYS} วัน (ตอนนี้เหลือ ${daysLeft} วัน)`,
          code: 'RENEWAL_NOT_DUE',
          daysLeft,
        });
      }
    }

    // ห้ามเปิดใบใหม่ทับใบที่ยังค้าง — ไม่งั้นประวัติจะงอกหลายแถวต่อการซื้อ
    // หนึ่งครั้ง และผู้ใช้ที่ถือ client secret ของใบเก่าอยู่ยังจ่ายใบนั้นได้
    // ผู้ใช้ต้องจ่ายให้จบ หรือกดยกเลิก (POST /payments/:id/cancel) ก่อน
    // reusePaymentId = การกด "ชำระอีกครั้ง" ของใบเดิม จึงได้รับยกเว้น
    if (!reusePaymentId) {
      const open = await this.findOpenPayment(userId);
      if (open) {
        throw new ConflictException({
          message:
            'คุณมีรายการชำระเงินที่ยังไม่เสร็จอยู่ กรุณาชำระให้เสร็จหรือกดยกเลิกรายการนั้นก่อน',
          code: 'PAYMENT_ALREADY_PENDING',
          paymentId: open.id,
        });
      }
    }

    // อัปเกรดจากแพ็กเกจที่ยังไม่หมดอายุ = เก็บเฉพาะส่วนต่าง แล้วคงวันหมดอายุเดิม
    const charge = resolveUpgradeCharge({
      targetPlan: {
        id: targetPlan.id,
        code: targetPlan.code,
        priceThb: Number(targetPlan.priceThb),
        isFree: targetPlan.isFree,
      },
      current: {
        planId: subscription.planId,
        status: subscription.status,
        expiresAt: subscription.expiresAt,
        plan: {
          id: subscription.plan.id,
          code: subscription.plan.code,
          priceThb: Number(subscription.plan.priceThb),
          isFree: subscription.plan.isFree,
        },
      },
    });

    // ปิดใบเก่าที่ค้างก่อนออกใบใหม่ (ดูคอมเมนต์ของเมธอด)
    await this.cancelPendingIntents(userId, reusePaymentId);

    // keepExpiry ต้องเดินทางไปกับ intent ไม่ใช่คำนวณซ้ำตอน fulfill — ระหว่างที่
    // ใบยังเปิดค้าง (สูงสุด 24 ชม.) แพ็กเกจเดิมอาจหมดอายุพอดี ถ้าคำนวณใหม่ตอน
    // นั้นจะกลายเป็นจ่ายส่วนต่างแต่ได้รอบใหม่เต็มปี
    const intent = await this.stripeService.createCardPaymentIntent(
      charge.amountThb,
      {
        userId,
        planCode,
        purpose,
        keepExpiry: charge.keepExpiry ? 'true' : 'false',
      },
    );
    if (!intent.client_secret) {
      throw new BadRequestException('Stripe ไม่ได้ส่ง client secret กลับมา');
    }

    const payment = reusePaymentId
      ? await this.prisma.payment.update({
          where: { id: reusePaymentId },
          data: {
            subscriptionId: subscription.id,
            purpose,
            amountThb: charge.amountThb,
            status: PaymentStatus.PENDING,
            provider: PROVIDER,
            providerRef: intent.id,
            paidAt: null,
            // createdAt ไม่ถูกแตะโดยตั้งใจ — หน้าต่าง 24 ชม. นับจากใบแรก
          },
        })
      : await this.prisma.payment.create({
          data: {
            userId,
            subscriptionId: subscription.id,
            purpose,
            amountThb: charge.amountThb,
            status: PaymentStatus.PENDING,
            provider: PROVIDER,
            providerRef: intent.id,
          },
        });

    return {
      paymentId: payment.id,
      clientSecret: intent.client_secret,
      // หน้าเว็บต้องแสดงยอดจริงที่ถูกเรียกเก็บ ไม่ใช่ราคาป้ายของแพ็กเกจ
      amountThb: charge.amountThb,
      fullPriceThb: Number(targetPlan.priceThb),
      prorated: charge.keepExpiry,
      expiresAt: paymentExpiresAt(payment.createdAt).toISOString(),
    };
  }

  async listMyPayments(userId: string) {
    // cron เดินรายชั่วโมง ผู้ใช้ที่เปิดหน้านี้ก่อนรอบถัดไปต้องไม่เห็นปุ่ม
    // "ชำระอีกครั้ง" ของใบที่หมดอายุไปแล้ว
    await this.expireStalePaymentsForUser(userId);

    const payments = await this.prisma.payment.findMany({
      // ใบที่ผู้ใช้กดยกเลิกเองไม่ใช่ประวัติการซื้อ มันคือรายการที่ตั้งใจไม่ให้
      // เกิดขึ้น และไม่เหลืออะไรให้ทำต่อ — ตัดที่คิวรี ไม่ใช่ไปกรองฝั่งเว็บ
      // จะได้ไม่กินโควตาของ take ไปเปล่าๆ
      //
      // FAILED ยังอยู่ — ใบที่หมดเวลา 24 ชม. ถูกพลิกเป็น FAILED (expirePayment)
      // ไม่ได้หายไปไหน ผู้ใช้ต้องเห็นว่าความพยายามครั้งนั้นจบยังไง
      where: { userId, status: { not: PaymentStatus.CANCELLED } },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
      include: { subscription: { include: { plan: true } } },
    });

    // ตาข่ายรองของ POST /payments/:id/confirm — ระบบนี้ไม่ใช้ webhook ถ้าผู้ใช้
    // ปิดหน้าเว็บหลังบัตรผ่านแต่ก่อนกดยืนยัน จะไม่มีอะไรมาปิดยอดให้เลย
    // รอบถัดไปที่เปิดประวัติจึงต้องไล่ถาม Stripe เองว่าใบที่ยัง PENDING จ่ายแล้วไหม
    const pendingIntents = payments.filter(
      (payment) =>
        payment.status === PaymentStatus.PENDING &&
        payment.providerRef.startsWith('pi_'),
    );
    await Promise.all(
      pendingIntents.map(async (payment) => {
        try {
          const intent = await this.stripeService.retrievePaymentIntent(
            payment.providerRef,
          );
          if (intent.status === 'succeeded') {
            await this.fulfillPaymentIntent(intent);
          }
        } catch {
          // รายการเก่าหรือ Stripe ชั่วคราวไม่พร้อม ไม่ควรทำให้ประวัติหาย
        }
      }),
    );

    const rows = pendingIntents.some(
      (payment) => payment.status === PaymentStatus.PENDING,
    )
      ? await this.prisma.payment.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { subscription: { include: { plan: true } } },
        })
      : payments;

    // หน้าเว็บไม่ควรคำนวณหน้าต่าง 24 ชม. เอง ไม่งั้นนาฬิกาเครื่องผู้ใช้ที่เพี้ยน
    // จะทำให้ปุ่มโผล่/หายไม่ตรงกับที่ api ยอมรับจริง
    const now = new Date();
    return rows.map((row) => ({
      ...row,
      expiresAt: paymentExpiresAt(row.createdAt).toISOString(),
      retryable:
        (row.status === PaymentStatus.PENDING ||
          row.status === PaymentStatus.FAILED) &&
        isPaymentWindowOpen(row.createdAt, now),
      // ยกเลิกได้เฉพาะใบที่ยังค้างจริงๆ — ใบที่ FAILED ไปแล้วไม่บล็อกการซื้อ
      // รอบใหม่อยู่แล้ว จึงไม่ต้องมีปุ่มให้กด
      cancellable:
        row.status === PaymentStatus.PENDING &&
        isPaymentWindowOpen(row.createdAt, now),
    }));
  }

  /**
   * ใบที่ยัง "เปิดค้าง" อยู่ของผู้ใช้คนนี้ — มีได้มากสุดหนึ่งใบ
   *
   * ต้องกรองด้วยหน้าต่าง 24 ชม. ด้วย ไม่ใช่ดูแค่ status: ระหว่างรอบ cron
   * ใบที่หมดอายุแล้วยังเป็น PENDING อยู่ในฐานข้อมูล ถ้านับใบพวกนั้นด้วยผู้ใช้
   * จะซื้อใหม่ไม่ได้เลยจนกว่า cron จะเดิน
   */
  private async findOpenPayment(userId: string) {
    const cutoff = new Date(Date.now() - PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
    return this.prisma.payment.findFirst({
      where: {
        userId,
        status: PaymentStatus.PENDING,
        provider: PROVIDER,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * ผู้ใช้กดยกเลิกใบที่ค้างเอง — ทางเดียวที่จะเปิดใบใหม่ได้ก่อนครบ 24 ชม.
   *
   * ลำดับเดียวกับ expirePayment(): ยกเลิกฝั่ง Stripe ให้สำเร็จก่อนค่อยพลิก
   * สถานะ ถ้าพลิกก่อนแล้วยกเลิกไม่ได้ ผู้ใช้ที่ยังถือ client secret อยู่จะจ่าย
   * ผ่าน แล้ว fulfillPaymentIntent() จะเมินเพราะแถวไม่ใช่ PENDING แล้ว
   * = ตัดเงินแล้วไม่ได้แพ็กเกจ และไม่มี webhook มาบอกเราด้วย
   */
  async cancelPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    if (payment.status === PaymentStatus.PAID) {
      throw new BadRequestException('รายการนี้ชำระเงินแล้ว ยกเลิกไม่ได้');
    }
    if (payment.status !== PaymentStatus.PENDING) {
      // ยกเลิกใบที่ปิดไปแล้วถือว่าสำเร็จ ผู้ใช้ได้ผลลัพธ์ที่ต้องการอยู่ดี
      return { message: 'รายการนี้ถูกปิดไปแล้ว' };
    }

    await this.stripeService.cancelPaymentIntent(payment.providerRef);
    await this.prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.CANCELLED },
    });
    return { message: 'ยกเลิกรายการชำระเงินแล้ว' };
  }

  /** เหมือน expireStalePayments() แต่จำกัดเฉพาะของผู้ใช้คนเดียว */
  private async expireStalePaymentsForUser(userId: string) {
    const cutoff = new Date(Date.now() - PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.payment.findMany({
      where: {
        userId,
        status: PaymentStatus.PENDING,
        provider: PROVIDER,
        createdAt: { lt: cutoff },
      },
      select: { providerRef: true },
    });
    for (const payment of stale) {
      await this.expirePayment(payment.providerRef);
    }
  }

  async retryPaymentIntent(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.FAILED
    ) {
      throw new BadRequestException('รายการนี้ไม่สามารถชำระซ้ำได้');
    }

    // ยึด "อายุของใบ" เป็นเกณฑ์ ไม่ใช่สถานะ — ไม่มี webhook คอยพลิกใบที่บัตร
    // ถูกปฏิเสธเป็น FAILED ให้ ใบที่จ่ายไม่ผ่านจึงค้าง PENDING จนกว่า cron
    // จะเก็บกวาด และผู้ใช้ต้องลองบัตรใบใหม่ได้ตลอดช่วงที่ใบยังไม่หมดอายุ
    if (!isPaymentWindowOpen(payment.createdAt)) {
      await this.expirePayment(payment.providerRef);
      throw new BadRequestException(
        `ใบชำระเงินนี้หมดอายุแล้ว (เปิดไว้ได้ ${PAYMENT_WINDOW_HOURS} ชั่วโมง) กรุณาเริ่มรายการใหม่จากหน้าอัปเกรดแพ็กเกจ`,
      );
    }

    let planCode: string | null = null;
    try {
      const intent = await this.stripeService.retrievePaymentIntent(
        payment.providerRef,
      );
      planCode = intent.metadata?.planCode ?? null;
    } catch {
      // รองรับรายการเก่าที่สร้างจาก Checkout Session
      try {
        const session =
          await this.stripeService.stripe.checkout.sessions.retrieve(
            payment.providerRef,
          );
        planCode = session.metadata?.planCode ?? null;
      } catch {
        // ถ้าเป็นรายการจาก Stripe account/mode เก่า ให้ใช้ยอดเงินใน ledger
        // หาแพ็กเกจแทน เพื่อให้ผู้ใช้เปิด PaymentIntent ใบใหม่ได้
        planCode = await this.inferPlanCodeFromAmount(
          payment.userId,
          Number(payment.amountThb),
        );
      }
    }
    if (planCode !== 'PLUS' && planCode !== 'PRO') {
      throw new BadRequestException('ไม่พบแพ็กเกจของรายการชำระเงินนี้');
    }
    return this.createSubscriptionPaymentIntent(userId, planCode, payment.id);
  }

  /** ยืนยันแบบ Learnora: ตรวจ PaymentIntent กับ Stripe แล้วอัปเดต DB ทันที */
  async confirmPaymentIntent(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
    });
    if (!payment) throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    if (payment.status === PaymentStatus.PAID) {
      return { message: 'รายการนี้ชำระเงินแล้ว' };
    }
    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(
        'รายการนี้ไม่อยู่ระหว่างรอยืนยันการชำระเงิน',
      );
    }

    const intent = await this.stripeService.retrievePaymentIntent(
      payment.providerRef,
    );
    const expectedAmount = Math.round(
      Number(payment.amountThb) * SATANG_PER_BAHT,
    );
    if (
      intent.metadata?.userId !== userId ||
      intent.metadata?.planCode === undefined
    ) {
      throw new BadRequestException('ข้อมูลการชำระเงินไม่ตรงกับบัญชีนี้');
    }
    if (intent.status !== 'succeeded') {
      throw new BadRequestException('Stripe ยังยืนยันการชำระเงินไม่สำเร็จ');
    }
    if (intent.amount_received !== expectedAmount) {
      throw new BadRequestException('ยอดชำระเงินไม่ตรงกับแพ็กเกจ');
    }

    await this.fulfillPaymentIntent(intent);
    return { message: 'ชำระเงินสำเร็จ' };
  }

  async getMyPayment(userId: string, paymentId: string) {
    // กรองด้วย userId ตั้งแต่ query กัน IDOR — ของคนอื่นต้องเป็น 404 ไม่ใช่ 403
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      include: { subscription: { include: { plan: true } } },
    });
    if (!payment) {
      throw new NotFoundException('ไม่พบรายการชำระเงินนี้');
    }
    return payment;
  }

  /**
   * บันทึกผลว่าจ่ายสำเร็จแล้วเปลี่ยนแพ็กเกจให้ — จุดรวมของทุกเส้นทางที่ยืนยันเงิน
   *
   * ระบบนี้ไม่ใช้ Stripe webhook เส้นทางที่เรียกเมธอดนี้มีสองทางเท่านั้น:
   *   1. POST /payments/:id/confirm — ทางหลัก ฟอร์มบัตรเรียกทันทีหลัง
   *      stripe.confirmCardPayment() ผ่าน
   *   2. listMyPayments() — ตาข่ายรอง เผื่อผู้ใช้ปิดเบราว์เซอร์ก่อนกดยืนยัน
   *      รอบหน้าที่เปิดหน้าประวัติจะไล่ถาม Stripe แล้วปิดยอดให้เอง
   *
   * ทั้งสองทางเรียกซ้ำได้เสมอ จึงต้อง idempotent — ยึด providerRef เป็นตัวกันซ้ำ
   * และจองแถวด้วย updateMany ที่เงื่อนไข status = PENDING ถ้าจ่ายสำเร็จไปแล้ว
   * ให้จบเงียบๆ ไม่ใช่โยน error
   */
  private async fulfillPaymentIntent(intent: Stripe.PaymentIntent) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef: intent.id },
    });
    if (!payment || payment.status !== PaymentStatus.PENDING) return;

    const planCode = intent.metadata?.planCode;
    if (!planCode || (planCode !== 'PLUS' && planCode !== 'PRO')) {
      this.logger.error(
        `payment intent ${intent.id} ไม่มี planCode ที่ถูกต้อง`,
      );
      return;
    }

    let applied: boolean;
    try {
      applied = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: PaymentStatus.PENDING },
          data: { status: PaymentStatus.PAID, paidAt: new Date() },
        });
        if (claimed.count === 0) return false;

        if (payment.purpose === PaymentPurpose.RENEWAL) {
          await this.subscriptionsService.applyRenewal(payment.userId, tx);
        } else {
          await this.subscriptionsService.applyUpgrade(
            payment.userId,
            planCode,
            tx,
            // จ่ายมาแค่ส่วนต่าง จึงห้ามแถมรอบใหม่เต็มระยะเวลาให้
            { keepExpiry: intent.metadata?.keepExpiry === 'true' },
          );
        }
        return true;
      });
    } catch (error) {
      await this.recordUnfulfillablePayment(payment.id, planCode, error);
      return;
    }

    if (applied) {
      this.logger.log(
        `ชำระเงินสำเร็จ payment=${payment.id} user=${payment.userId} plan=${planCode}`,
      );
    }
  }

  /**
   * เงินถูกตัดไปแล้วแต่เปลี่ยนแพ็กเกจให้ไม่ได้ — เกิดได้เมื่อสถานะของบัญชี
   * เปลี่ยนไประหว่างที่ลิงก์จ่ายเงินยังค้างอยู่ เช่นเปิดลิงก์ PLUS ทิ้งไว้
   * แล้วอัปเป็น PRO ก่อน พอกลับมาจ่ายลิงก์ PLUS ทีหลัง applyUpgrade() จะ
   * throw เพราะ SRS ไม่มีเส้นทางลดแพ็กเกจ
   *
   * เคสนี้ retry อีกกี่ครั้งก็ไม่มีวันผ่าน ถ้าปล่อยให้ throw ออกไปจะได้ 500
   * แล้ว Stripe จะยิงซ้ำนาน 3 วัน ส่วนแถว payment ก็ค้าง PENDING เหมือนไม่เคย
   * จ่าย — เท่ากับเงินหายโดยไม่มีหลักฐานให้ตามคืน
   *
   * จึงบันทึกเป็น PAID (เพราะจ่ายจริง) + log ระดับ error ให้แอดมินคืนเงินเอง
   * แล้วตอบ 200 กลับไปเพื่อให้ Stripe หยุด retry
   *
   * แต่ถ้าเป็นความผิดพลาดชั่วคราว (DB ล่ม/timeout) ต้องโยนต่อ เพื่อให้ Stripe
   * retry ตามปกติ — แยกด้วย HttpException ซึ่งเป็น business rule ของเราเอง
   */
  private async recordUnfulfillablePayment(
    paymentId: string,
    planCode: string,
    error: unknown,
  ) {
    if (!(error instanceof HttpException)) {
      throw error;
    }

    await this.prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });

    this.logger.error(
      `payment=${paymentId} จ่ายเงินสำเร็จแล้วแต่เปลี่ยนเป็นแพ็กเกจ ${planCode} ไม่ได้ ` +
        `(${error.message}) — ต้องคืนเงินให้ผู้ใช้ด้วยมือผ่าน Stripe Dashboard`,
    );
  }

  /**
   * ยกเลิก PaymentIntent เก่าที่ผู้ใช้คนเดิมยังไม่ได้จ่าย ก่อนออกใบใหม่ให้
   *
   * ถ้าไม่ยกเลิก คนที่กดซื้อ PLUS แล้วเปลี่ยนใจไปซื้อ PRO จะเหลือ intent ของ
   * PLUS ค้างอยู่ ทั้งใน Stripe และเป็นแถว PENDING ในประวัติ — แถวนั้นยังจ่าย
   * ได้จริงถ้ามี client secret เก่าอยู่ในมือ แล้วจะกลายเป็นการลดแพ็กเกจซึ่ง
   * SRS ไม่รองรับ
   *
   * best-effort — ถ้ายกเลิกฝั่ง Stripe ไม่สำเร็จ (เช่นถูกยกเลิกไปแล้ว) ก็ยัง
   * ปิดแถวฝั่งเราให้เรียบร้อย ไม่บล็อกการซื้อรอบใหม่
   */
  private async cancelPendingIntents(userId: string, exceptPaymentId?: string) {
    const pending = await this.prisma.payment.findMany({
      where: {
        userId,
        status: PaymentStatus.PENDING,
        provider: PROVIDER,
        ...(exceptPaymentId ? { id: { not: exceptPaymentId } } : {}),
      },
      select: { providerRef: true },
    });

    for (const item of pending) {
      try {
        await this.stripeService.cancelPaymentIntent(item.providerRef);
      } catch (error) {
        this.logger.warn(
          `ยกเลิก payment intent ${item.providerRef} ไม่สำเร็จ: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      await this.markFailed(item.providerRef, PaymentStatus.FAILED);
    }
  }

  /**
   * เดาแพ็กเกจจากยอดเงิน ใช้เฉพาะรายการเก่าที่อ่าน metadata จาก Stripe ไม่ได้
   *
   * ต้องรองรับสองแบบ: ยอดเต็มของแพ็กเกจ และยอดส่วนต่างจากแพ็กเกจปัจจุบัน
   * (ตั้งแต่เปลี่ยนมาเก็บเฉพาะส่วนต่าง ยอดใน ledger ไม่ตรงกับราคาป้ายอีกต่อไป)
   */
  private async inferPlanCodeFromAmount(
    userId: string,
    amountThb: number,
  ): Promise<string | null> {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { isActive: true, isFree: false },
      select: { code: true, priceThb: true },
    });

    const byFullPrice = plans.find(
      (plan) => Number(plan.priceThb) === amountThb,
    );
    if (byFullPrice) return byFullPrice.code;

    const subscription = await this.prisma.subscription.findUnique({
      where: { userId },
      select: { plan: { select: { priceThb: true } } },
    });
    if (!subscription) return null;

    const currentPrice = Number(subscription.plan.priceThb);
    const byDifference = plans.find(
      (plan) => Number(plan.priceThb) - currentPrice === amountThb,
    );
    return byDifference?.code ?? null;
  }

  /**
   * ปิดใบที่หมดอายุ — ต้องยกเลิกฝั่ง Stripe ก่อนเสมอ
   *
   * ลำดับสำคัญ: ถ้าพลิกเป็น FAILED ก่อนแล้วยกเลิกไม่สำเร็จ ผู้ใช้ที่ยังถือ
   * client secret อยู่จะจ่ายผ่าน แล้ว fulfillPaymentIntent() จะเมินเพราะแถว
   * ไม่ได้อยู่ในสถานะ PENDING แล้ว = ตัดเงินแล้วไม่ได้แพ็กเกจ
   *
   * และเพราะไม่มี webhook จึงไม่มีอะไรมาบอกเราทีหลังว่าเงินเข้าแล้ว — ถ้ายกเลิก
   * ไม่สำเร็จเพราะจ่ายไปก่อนหน้า ต้องตรวจกับ Stripe แล้วปิดยอดให้ตรงนี้เลย
   */
  private async expirePayment(providerRef: string) {
    try {
      await this.stripeService.cancelPaymentIntent(providerRef);
    } catch (error) {
      // ยกเลิกไม่ได้เพราะจ่ายสำเร็จไปแล้วก็เป็นไปได้ — ตรวจก่อนพลิกสถานะ
      // ไม่งั้นจะทับรายการที่จ่ายจริงให้กลายเป็น FAILED
      this.logger.warn(
        `ยกเลิก payment intent ${providerRef} ไม่สำเร็จ: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      try {
        const intent =
          await this.stripeService.retrievePaymentIntent(providerRef);
        if (intent.status === 'succeeded') {
          await this.fulfillPaymentIntent(intent);
          return;
        }
      } catch {
        // อ่านจาก Stripe ไม่ได้เลย ปล่อยให้พลิกเป็น FAILED ตามกำหนด
      }
    }
    await this.markFailed(providerRef, PaymentStatus.FAILED);
  }

  /**
   * พลิกใบที่เปิดค้างเกินกำหนดเป็น FAILED — เรียกจาก cron และตอนเปิดหน้าประวัติ
   *
   * ที่ต้องทำตอนเปิดหน้าประวัติด้วยเพราะ cron ทำงานรายชั่วโมง ผู้ใช้ที่เปิดดู
   * ก่อนรอบถัดไปจะเห็นปุ่ม "ชำระอีกครั้ง" ของใบที่หมดอายุไปแล้ว กดแล้วได้ error
   */
  async expireStalePayments(): Promise<number> {
    const cutoff = new Date(Date.now() - PAYMENT_WINDOW_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.payment.findMany({
      where: {
        status: PaymentStatus.PENDING,
        provider: PROVIDER,
        createdAt: { lt: cutoff },
      },
      select: { providerRef: true },
    });

    for (const payment of stale) {
      await this.expirePayment(payment.providerRef);
    }
    return stale.length;
  }

  private async markFailed(providerRef: string, status: PaymentStatus) {
    const payment = await this.prisma.payment.findUnique({
      where: { providerRef },
    });
    if (!payment || payment.status !== PaymentStatus.PENDING) {
      return;
    }
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status },
    });
  }
}
