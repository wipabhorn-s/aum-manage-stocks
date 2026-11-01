import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '@/common/decorator/current-user.decorator';
import { OwnerId } from '@/common/decorator/owner-id.decorator';
import { Roles } from '@/common/decorator/roles.decorator';
import { UserRole } from '@/database/generated/prisma/enums';
import { CategoriesService } from './categories.service';
import {
  createCategorySchema,
  updateCategorySchema,
  type CreateCategoryDto,
  type UpdateCategoryDto,
} from './dto/category.dto';

// แอดมินไม่มีร้านจึงไม่มีหมวดหมู่ — เดิม @OwnerId() เป็นตัวกันไว้ พอฝั่งเขียน
// เปลี่ยนมาใช้ userId เพื่อเช็กสิทธิ์พนักงาน จึงต้องกันแอดมินด้วย @Roles แทน
const SHOP_ROLES = [UserRole.SHOP_OWNER, UserRole.SHOP_STAFF] as const;

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Roles(...SHOP_ROLES)
  @Post()
  create(
    @CurrentUser('sub') userId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(userId, dto);
  }

  @Get()
  findAll(@OwnerId() ownerId: string) {
    return this.categoriesService.findAll(ownerId);
  }

  @Roles(...SHOP_ROLES)
  @Patch(':id')
  update(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(userId, id, dto);
  }

  @Roles(...SHOP_ROLES)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.remove(userId, id);
  }
}
