import { Module } from '@nestjs/common';

import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

@Module({
  imports: [SubscriptionsModule, NotificationsModule],
  controllers: [ShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}
