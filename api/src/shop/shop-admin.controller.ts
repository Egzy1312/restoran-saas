import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ShopService } from './shop.service';
import { UploadsService, MAX_IMAGE_SIZE_BYTES } from '../uploads/uploads.service';
import { CreateShopProductDto } from './dto/create-shop-product.dto';
import { UpdateShopProductDto } from './dto/update-shop-product.dto';
import { UpdateShopOrderStatusDto } from './dto/update-shop-order-status.dto';

/** Upravljanje webshop proizvodima/narudžbama - SAMO SUPER_ADMIN (platforma je prodavac hardvera, ne pojedini restoran). */
@UseGuards(RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('platform/shop')
export class ShopAdminController {
  constructor(
    private readonly shopService: ShopService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE_BYTES } }))
  uploadImage(@UploadedFile() file?: Express.Multer.File) {
    return this.uploadsService.saveImage(file, 'shop-products');
  }

  @Get('products')
  listProducts() {
    return this.shopService.listAllProducts();
  }

  @Post('products')
  createProduct(@Body() dto: CreateShopProductDto) {
    return this.shopService.createProduct(dto);
  }

  @Patch('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateShopProductDto) {
    return this.shopService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.shopService.deleteProduct(id);
  }

  @Get('orders')
  listOrders() {
    return this.shopService.listOrders();
  }

  @Patch('orders/:id/status')
  updateOrderStatus(@Param('id') id: string, @Body() dto: UpdateShopOrderStatusDto) {
    return this.shopService.updateOrderStatus(id, dto.status);
  }
}
