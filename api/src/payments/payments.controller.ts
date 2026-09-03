import { CurrentUser } from '@/common/decorator/current-user.decorator';
import { Roles } from '@/common/decorator/roles.decorator';
import { UserRole } from '@/database/generated/prisma/enums';
import { CreateSubscriptionPaymentDto } from '@/payments/dto/create-subscription-payment.dto';
import { PaymentsService } from '@/payments/payments.service';
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** เริ่มชำระเงิน — คืน URL ของ Stripe Checkout ยังไม่เปลี่ยนแพ็กเกจตอนนี้ */
  /** เริ่มชำระเงินด้วย Card Elements — ไม่ redirect ไป Stripe Checkout */
  @Roles(UserRole.SHOP_OWNER)
  @Post('subscription-intent')
  async createSubscriptionPaymentIntent(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateSubscriptionPaymentDto,
  ) {
    return this.paymentsService.createSubscriptionPaymentIntent(
      userId,
      dto.planCode,
    );
  }

  // SRS §66/§110 — quota เปลี่ยนได้ทางเดียวคืออัปเกรดแพลน ไม่มีการซื้อร้าน/
  // สินค้า/พนักงานเพิ่มแยกต่างหาก POST /payments/shop-addon จึงถูกตัดออก
  // พร้อม EXTRA_SHOP purpose แล้ว (ดู "SRS alignment" ใน AGENTS.md)
  // ห้ามเพิ่ม endpoint ขายสิทธิ์เพิ่มกลับเข้ามา

  @Roles(UserRole.SHOP_OWNER)
  @Get('')
  async listPayments(@CurrentUser('sub') userId: string) {
    return this.paymentsService.listMyPayments(userId);
  }

  @Roles(UserRole.SHOP_OWNER)
  @Post(':id/retry-intent')
  async retryPaymentIntent(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.retryPaymentIntent(userId, id);
  }

  /** ยกเลิกใบที่ค้าง — ปลดล็อกให้ผู้ใช้เปิดรายการใหม่ได้ก่อนครบ 24 ชม. */
  @Roles(UserRole.SHOP_OWNER)
  @Post(':id/cancel')
  async cancelPayment(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.cancelPayment(userId, id);
  }

  @Roles(UserRole.SHOP_OWNER)
  @Post(':id/confirm')
  async confirmPaymentIntent(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.confirmPaymentIntent(userId, id);
  }

  @Roles(UserRole.SHOP_OWNER)
  @Get(':id')
  async getPayment(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentsService.getMyPayment(userId, id);
  }
}
