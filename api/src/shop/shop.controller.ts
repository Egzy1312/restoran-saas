import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ShopService } from './shop.service';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';

@Controller('shop')
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  @Public()
  @Get('products')
  listProducts() {
    return this.shopService.listProducts();
  }

  @Public()
  @Get('products/:slug')
  getProduct(@Param('slug') slug: string) {
    return this.shopService.getProduct(slug);
  }

  /** Javna narudžba hardvera - ne zahtijeva prijavu (kupac unosi podatke za dostavu rucno). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('orders')
  createOrder(@Body() dto: CreateShopOrderDto) {
    return this.shopService.createOrder(dto);
  }
}
