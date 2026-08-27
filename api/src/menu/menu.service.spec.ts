import { NotFoundException } from '@nestjs/common';
import { MenuService } from './menu.service';

describe('MenuService', () => {
  let prisma: any;
  let service: MenuService;

  beforeEach(() => {
    prisma = {
      menuCategory: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      menuItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
      itemModifier: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
    };
    service = new MenuService(prisma);
  });

  describe('createItem - redoslijed (sort_order)', () => {
    it('novi artikal dobija sortOrder = 0 kad je kategorija prazna', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue({ id: 'cat-1', restaurantId: 'rest-1' });
      prisma.menuItem.findFirst.mockResolvedValue(null); // nema postojecih artikala
      prisma.menuItem.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'item-1', ...data }));

      await service.createItem('rest-1', {
        category_id: 'cat-1',
        name_json: { bs: 'Pica' },
        price: 10,
      } as any);

      expect(prisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 0 }) }),
      );
    });

    it('novi artikal ide NA KRAJ postojece kategorije (max sortOrder + 1), ne remeti postojeci redoslijed', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue({ id: 'cat-1', restaurantId: 'rest-1' });
      prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-existing', sortOrder: 4 }); // najveci trenutni
      prisma.menuItem.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'item-2', ...data }));

      await service.createItem('rest-1', {
        category_id: 'cat-1',
        name_json: { bs: 'Salata' },
        price: 5,
      } as any);

      expect(prisma.menuItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { categoryId: 'cat-1' }, orderBy: { sortOrder: 'desc' } }),
      );
      expect(prisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sortOrder: 5 }) }),
      );
    });

    it('baca NotFoundException ako kategorija ne pripada restoranu (tenant izolacija)', async () => {
      prisma.menuCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.createItem('rest-1', { category_id: 'tudja-kategorija', name_json: { bs: 'X' }, price: 1 } as any),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.menuItem.create).not.toHaveBeenCalled();
    });
  });

  describe('updateItem - drag-and-drop reorder', () => {
    it('prosljedjuje sort_order iz DTO-a direktno u update (za drag-and-drop redoslijed)', async () => {
      prisma.menuItem.findFirst.mockResolvedValue({ id: 'item-1', category: { restaurantId: 'rest-1' } });
      prisma.menuItem.update.mockResolvedValue({ id: 'item-1', sortOrder: 2 });

      await service.updateItem('rest-1', 'item-1', { sort_order: 2 } as any);

      expect(prisma.menuItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: expect.objectContaining({ sortOrder: 2 }),
      });
    });

    it('baca NotFoundException ako artikal ne pripada restoranu', async () => {
      prisma.menuItem.findFirst.mockResolvedValue(null);
      await expect(service.updateItem('rest-1', 'tudj-artikal', { sort_order: 1 } as any)).rejects.toThrow(NotFoundException);
    });
  });
});
