import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SalesModule } from '../sales/sales.module';
import { StockModule } from '../stock/stock.module';
import { ChatCommandController } from './chat-command.controller';
import { ChatCommandService } from './chat-command.service';
import { DeterministicStockCommandParser } from './parsers/deterministic-stock-command.parser';
import { FallbackStockCommandParser } from './parsers/fallback-stock-command.parser';
import { LlmStockCommandParser } from './parsers/llm-stock-command.parser';
import { STOCK_COMMAND_PARSER } from './parsers/stock-command-parser';
import { StockChoiceService } from './stock-choice.service';
import { ShopDestinationService } from './shop-destination.service';
import { StockQueryService } from './stock-query.service';

@Module({
  imports: [StockModule, NotificationsModule, SalesModule],
  controllers: [ChatCommandController],
  providers: [
    ChatCommandService,
    // [อั้ม] feature/chatbot-resource — เสียบ LLM parser เข้า port เดิม
    // FallbackStockCommandParser ลอง LLM ก่อน ถ้าล้ม/ไม่ได้ตั้ง env จะตกไปใช้
    // DeterministicStockCommandParser เสมอ พฤติกรรมเดิมจึงไม่ regress
    DeterministicStockCommandParser,
    LlmStockCommandParser,
    {
      provide: STOCK_COMMAND_PARSER,
      useClass: FallbackStockCommandParser,
    },
    // [อั้ม] ตัวเลือกสินค้าตอนชื่อกำกวม ใช้ร่วมกันทั้ง WEB และ LINE
    StockChoiceService,
    // [อั้ม] ตอบคำถามยอดคงเหลือ ใช้ร่วมกันทั้ง WEB และ LINE
    StockQueryService,
    // [อั้ม] หาร้านปลายทางของคำสั่งย้าย จากชื่อที่ผู้ใช้พิมพ์
    ShopDestinationService,
  ],
  // [อั้ม] LINE ต้อง parse ซ้ำเองตอนชื่อสินค้ากำกวม เพื่อรู้จำนวน/ทิศทาง
  // ที่ผู้ใช้สั่ง แล้วเก็บเป็นรายการรอเลือก — export เพิ่มบรรทัดเดียว ไม่แตะของเดิม
  exports: [
    ChatCommandService,
    STOCK_COMMAND_PARSER,
    StockChoiceService,
    StockQueryService,
    // [อั้ม] LINE ใช้ตัวเดียวกันวาดเมนูร้านปลายทาง
    ShopDestinationService,
  ],
})
export class ChatCommandModule {}
