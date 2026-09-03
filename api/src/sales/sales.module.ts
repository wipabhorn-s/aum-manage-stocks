import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationsModule } from '../notifications/notifications.module';
import { StockModule } from '../stock/stock.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { SALES_PRODUCT_PORT } from './ports/sales-product.port';
import {
  SALES_STAFF_PORT,
  SALES_SUBSCRIPTION_PORT,
} from './ports/sales-access.port';
import {
  MockSalesProductAdapter,
  MockSalesStaffAdapter,
  MockSalesSubscriptionAdapter,
} from './ports/mock-adapters';
import {
  PrismaSalesProductAdapter,
  PrismaSalesStaffAdapter,
  PrismaSalesSubscriptionAdapter,
} from './ports/prisma-sales-adapters';

const isSalesMockMode = (config: ConfigService) =>
  config.get<string>('SALES_MOCK_MODE')?.trim().toLowerCase() === 'true';

@Module({
  imports: [StockModule, NotificationsModule],
  controllers: [SalesController],
  providers: [
    SalesService,
    MockSalesProductAdapter,
    MockSalesStaffAdapter,
    MockSalesSubscriptionAdapter,
    PrismaSalesProductAdapter,
    PrismaSalesStaffAdapter,
    PrismaSalesSubscriptionAdapter,
    {
      provide: SALES_PRODUCT_PORT,
      inject: [
        ConfigService,
        MockSalesProductAdapter,
        PrismaSalesProductAdapter,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockSalesProductAdapter,
        actual: PrismaSalesProductAdapter,
      ) => (isSalesMockMode(config) ? mock : actual),
    },
    {
      provide: SALES_STAFF_PORT,
      inject: [ConfigService, MockSalesStaffAdapter, PrismaSalesStaffAdapter],
      useFactory: (
        config: ConfigService,
        mock: MockSalesStaffAdapter,
        actual: PrismaSalesStaffAdapter,
      ) => (isSalesMockMode(config) ? mock : actual),
    },
    {
      provide: SALES_SUBSCRIPTION_PORT,
      inject: [
        ConfigService,
        MockSalesSubscriptionAdapter,
        PrismaSalesSubscriptionAdapter,
      ],
      useFactory: (
        config: ConfigService,
        mock: MockSalesSubscriptionAdapter,
        actual: PrismaSalesSubscriptionAdapter,
      ) => (isSalesMockMode(config) ? mock : actual),
    },
  ],
  // [อั้ม] แชทบอทเรียกใช้ตรรกะการขายตัวเดียวกับหน้าขาย จะได้ไม่มีสองความจริง
  exports: [SalesService],
})
export class SalesModule {}
