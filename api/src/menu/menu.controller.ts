import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { MenuService } from './menu.service';
import { UploadsService, MAX_IMAGE_SIZE_BYTES } from '../uploads/uploads.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CreateItemDto, CreateModifierDto, UpdateItemDto } from './dto/item.dto';

@Controller('menu')
export class MenuController {
  constructor(
    private readonly menuService: MenuService,
    private readonly uploadsService: UploadsService,
  ) {}

  /** Otpremanje slike artikla sa uredjaja (zamjena za rucno lijepljenje URL-a) - vraca URL koji se onda salje kao image_url pri create/update artikla. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  uploadImage(@CurrentUser() user: AuthenticatedUser, @UploadedFile() file?: Express.Multer.File) {
    return this.uploadsService.saveImage(file, `menu-items/${user.restaurantId}`);
  }

  @Get()
  listForAdmin(@CurrentUser() user: AuthenticatedUser) {
    return this.menuService.listForAdmin(user.restaurantId);
  }

  /** Koristi gost PWA - GET /menu/public/{restaurant_slug} - bez auth-a. */
  @Public()
  @Get('public/:slug')
  getPublicMenu(@Param('slug') slug: string) {
    return this.menuService.getPublicMenu(slug);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCategoryDto) {
    return this.menuService.createCategory(user.restaurantId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch('categories/:id')
  updateCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.menuService.updateCategory(user.restaurantId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('categories/:id')
  removeCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.menuService.removeCategory(user.restaurantId, id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('items')
  createItem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateItemDto) {
    return this.menuService.createItem(user.restaurantId, dto);
  }

  /** Ova ruta pokriva i "86-ing" - kuhinja/admin salje { is_available: false }. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'KITCHEN', 'BAR')
  @Patch('items/:id')
  updateItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.menuService.updateItem(user.restaurantId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('items/:id')
  removeItem(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.menuService.removeItem(user.restaurantId, id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('items/:id/modifiers')
  addModifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: CreateModifierDto) {
    return this.menuService.addModifier(user.restaurantId, id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('modifiers/:id')
  removeModifier(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.menuService.removeModifier(user.restaurantId, id);
  }
}
