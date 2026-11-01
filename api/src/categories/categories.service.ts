import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../database/generated/prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AccountContextService } from '../common/access/account-context.service';
import type { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountContext: AccountContextService,
  ) {}

  /**
   * Categories belong to the shop owner rather than to a shop, so an owner
   * with several shops shares one set across all of them.
   *
   * Every write goes through assertCanManageCatalog(): staff need
   * `can_manage_product` (SRS: "พนักงานที่มีสิทธิ์จัดการสินค้า สร้าง แก้ไข และลบ
   * หมวดหมู่ได้"), and an expired paid plan makes the account read-only.
   */
  async create(userId: string, dto: CreateCategoryDto) {
    const { ownerId } = await this.assertCanWrite(userId);
    try {
      return await this.prisma.categories.create({
        data: {
          ownerId,
          name: dto.name,
          displayOrder: dto.displayOrder ?? 0,
        },
      });
    } catch (error) {
      throw this.toHttpError(error, dto.name);
    }
  }

  findAll(ownerId: string) {
    return this.prisma.categories.findMany({
      where: { ownerId },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    if (dto.name === undefined && dto.displayOrder === undefined) {
      throw new BadRequestException('At least one field must be provided');
    }

    const { ownerId } = await this.assertCanWrite(userId);

    await this.findOwnedOrFail(ownerId, id);

    try {
      return await this.prisma.categories.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.displayOrder !== undefined && {
            displayOrder: dto.displayOrder,
          }),
        },
      });
    } catch (error) {
      throw this.toHttpError(error, dto.name);
    }
  }

  async remove(userId: string, id: string) {
    const { ownerId } = await this.assertCanWrite(userId);
    await this.findOwnedOrFail(ownerId, id);
    await this.prisma.categories.delete({ where: { id } });
  }

  private async assertCanWrite(userId: string) {
    const ctx = await this.accountContext.resolve(userId);
    await this.accountContext.assertCanManageCatalog(ctx);
    return ctx;
  }
  private async findOwnedOrFail(ownerId: string, id: string) {
    const category = await this.prisma.categories.findFirst({
      where: { id, ownerId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  private toHttpError(error: unknown, name?: string): Error {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(
        name === undefined
          ? 'Category name already exists'
          : `Category "${name}" already exists`,
      );
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}
