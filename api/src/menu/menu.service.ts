import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateItemDto, CreateModifierDto, UpdateItemDto } from './dto/item.dto';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // --- Admin: puni meni (ukljucuje neaktivne/rasprodane stavke) ---
  listForAdmin(restaurantId: string) {
    return this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
      include: { items: { include: { modifiers: true }, orderBy: { sortOrder: 'asc' } } },
    });
  }

  /**
   * Javni meni za gost PWA - samo aktivne kategorije/artikle, i samo
   * kategorije koje su trenutno u svom vremenskom prozoru (npr. "Dnevni
   * ručak 11:00-14:00"). Kategorije bez definisanog vremena su uvijek vidljive.
   */
  async getPublicMenu(restaurantSlug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant || !restaurant.isActive) throw new NotFoundException('Restoran nije pronađen.');

    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId: restaurant.id, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isAvailable: true },
          include: { modifiers: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    const visibleCategories = categories.filter((cat) => {
      if (!cat.activeFromTime || !cat.activeToTime) return true;
      const from = cat.activeFromTime.getHours() * 60 + cat.activeFromTime.getMinutes();
      const to = cat.activeToTime.getHours() * 60 + cat.activeToTime.getMinutes();
      return nowMinutes >= from && nowMinutes <= to;
    });

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        currency: restaurant.currency,
      },
      categories: visibleCategories,
    };
  }

  // --- Kategorije ---
  createCategory(restaurantId: string, dto: CreateCategoryDto) {
    return this.prisma.menuCategory.create({
      data: {
        restaurantId,
        nameJson: dto.name_json,
        sortOrder: dto.sort_order ?? 0,
        activeFromTime: this.parseTime(dto.active_from_time),
        activeToTime: this.parseTime(dto.active_to_time),
      },
    });
  }

  async updateCategory(restaurantId: string, categoryId: string, dto: UpdateCategoryDto) {
    await this.assertCategoryOwnership(restaurantId, categoryId);
    return this.prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        nameJson: dto.name_json,
        sortOrder: dto.sort_order,
        activeFromTime: this.parseTime(dto.active_from_time),
        activeToTime: this.parseTime(dto.active_to_time),
        isActive: dto.is_active,
      },
    });
  }

  async removeCategory(restaurantId: string, categoryId: string) {
    await this.assertCategoryOwnership(restaurantId, categoryId);
    await this.prisma.menuCategory.delete({ where: { id: categoryId } });
  }

  // --- Artikli ---
  async createItem(restaurantId: string, dto: CreateItemDto) {
    await this.assertCategoryOwnership(restaurantId, dto.category_id);
    // Novi artikal ide na kraj kategorije (ne remeti postojeci drag-and-drop
    // redoslijed) - nadje najveci trenutni sortOrder u kategoriji i doda 1.
    const last = await this.prisma.menuItem.findFirst({
      where: { categoryId: dto.category_id },
      orderBy: { sortOrder: 'desc' },
    });
    return this.prisma.menuItem.create({
      data: {
        categoryId: dto.category_id,
        nameJson: dto.name_json,
        descriptionJson: dto.description_json,
        price: dto.price,
        imageUrl: dto.image_url,
        allergens: dto.allergens ?? [],
        printTarget: dto.print_target ?? 'kitchen',
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  }

  async updateItem(restaurantId: string, itemId: string, dto: UpdateItemDto) {
    await this.assertItemOwnership(restaurantId, itemId);
    return this.prisma.menuItem.update({
      where: { id: itemId },
      data: {
        nameJson: dto.name_json,
        descriptionJson: dto.description_json,
        price: dto.price,
        imageUrl: dto.image_url,
        allergens: dto.allergens,
        printTarget: dto.print_target,
        isAvailable: dto.is_available,
        sortOrder: dto.sort_order,
      },
    });
  }

  async removeItem(restaurantId: string, itemId: string) {
    await this.assertItemOwnership(restaurantId, itemId);
    await this.prisma.menuItem.delete({ where: { id: itemId } });
  }

  async addModifier(restaurantId: string, itemId: string, dto: CreateModifierDto) {
    await this.assertItemOwnership(restaurantId, itemId);
    return this.prisma.itemModifier.create({
      data: { menuItemId: itemId, nameJson: dto.name_json, price: dto.price },
    });
  }

  async removeModifier(restaurantId: string, modifierId: string) {
    const modifier = await this.prisma.itemModifier.findUnique({
      where: { id: modifierId },
      include: { menuItem: { include: { category: true } } },
    });
    if (!modifier || modifier.menuItem.category.restaurantId !== restaurantId) {
      throw new NotFoundException('Modifikator nije pronađen.');
    }
    await this.prisma.itemModifier.delete({ where: { id: modifierId } });
  }

  // --- Interno ---
  private parseTime(value?: string): Date | undefined {
    if (!value) return undefined;
    const [h, m] = value.split(':').map(Number);
    const d = new Date(Date.UTC(1970, 0, 1, h, m));
    return d;
  }

  private async assertCategoryOwnership(restaurantId: string, categoryId: string) {
    const category = await this.prisma.menuCategory.findFirst({ where: { id: categoryId, restaurantId } });
    if (!category) throw new NotFoundException('Kategorija nije pronađena.');
    return category;
  }

  private async assertItemOwnership(restaurantId: string, itemId: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id: itemId, category: { restaurantId } },
    });
    if (!item) throw new NotFoundException('Artikal nije pronađen.');
    return item;
  }
}
