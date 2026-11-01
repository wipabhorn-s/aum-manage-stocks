import { ForbiddenException } from '@nestjs/common';
import { CategoriesService } from './categories.service';

const OWNER_ID = '0199a0e0-0000-7000-8000-000000000001';
const STAFF_ID = '0199a0e0-0000-7000-8000-000000000002';
const CATEGORY_ID = '0199a0e0-0000-7000-8000-000000000003';

describe('CategoriesService', () => {
  let prisma: { categories: Record<string, jest.Mock> };
  let accountContext: { resolve: jest.Mock; assertCanManageCatalog: jest.Mock };
  let service: CategoriesService;

  beforeEach(() => {
    prisma = {
      categories: {
        create: jest.fn().mockResolvedValue({ id: CATEGORY_ID }),
        findFirst: jest.fn().mockResolvedValue({ id: CATEGORY_ID }),
        update: jest.fn().mockResolvedValue({ id: CATEGORY_ID }),
        delete: jest.fn(),
      },
    };
    accountContext = {
      resolve: jest.fn().mockResolvedValue({
        userId: STAFF_ID,
        ownerId: OWNER_ID,
        isStaff: true,
      }),
      assertCanManageCatalog: jest.fn(),
    };
    service = new CategoriesService(prisma as never, accountContext as never);
  });

  it('สร้างหมวดหมู่ภายใต้เจ้าของร้าน แม้คนกดจะเป็นพนักงาน', async () => {
    await service.create(STAFF_ID, { name: 'เครื่องดื่ม' });

    expect(accountContext.assertCanManageCatalog).toHaveBeenCalled();
    expect(prisma.categories.create).toHaveBeenCalledWith({
      data: { ownerId: OWNER_ID, name: 'เครื่องดื่ม', displayOrder: 0 },
    });
  });

  // assertCanManageCatalog โยนทั้งกรณีพนักงานไม่มีสิทธิ์ และกรณีแพ็กเกจหมดอายุ (read-only)
  it.each([
    ['create', (s: CategoriesService) => s.create(STAFF_ID, { name: 'x' })],
    [
      'update',
      (s: CategoriesService) => s.update(STAFF_ID, CATEGORY_ID, { name: 'x' }),
    ],
    ['remove', (s: CategoriesService) => s.remove(STAFF_ID, CATEGORY_ID)],
  ])('%s ไม่แตะฐานข้อมูลเมื่อไม่มีสิทธิ์จัดการสินค้า', async (_name, call) => {
    accountContext.assertCanManageCatalog.mockRejectedValue(
      new ForbiddenException('คุณไม่มีสิทธิ์จัดการสินค้า'),
    );

    await expect(call(service)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.categories.create).not.toHaveBeenCalled();
    expect(prisma.categories.update).not.toHaveBeenCalled();
    expect(prisma.categories.delete).not.toHaveBeenCalled();
  });
});
