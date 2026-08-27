import { Module } from '@nestjs/common';
import { ShopController } from './shop.controller';
import { ShopAdminController } from './shop-admin.controller';
import { ShopService } from './shop.service';

@Module({
  controllers: [ShopController, ShopAdminController],
  providers: [ShopService],
  exports: [ShopService],
})
export class ShopModule {}
