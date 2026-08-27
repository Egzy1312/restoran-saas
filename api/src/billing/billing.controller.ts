import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { BillingService } from './billing.service';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/jwt.strategy';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ShopService } from '../shop/shop.service';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
    private readonly shop: ShopService,
  ) {}

  /** Restoranov ADMIN otvara ovo da unese karticu (Lemon Squeezy hosted checkout). */
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('checkout')
  async checkout(@CurrentUser() user: AuthenticatedUser) {
    const [restaurant, staffUser] = await Promise.all([
      this.prisma.restaurant.findUnique({ where: { id: user.restaurantId } }),
      this.prisma.staffUser.findUnique({ where: { id: user.userId } }),
    ]);
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    const checkout = await this.billing.createCheckoutUrl(restaurant.id, staffUser?.email ?? '');
    if (!checkout) {
      throw new BadRequestException('Naplata trenutno nije dostupna (Lemon Squeezy nije podešen na serveru).');
    }
    return checkout;
  }

  /** Stanje pretplate za trenutni restoran - prikazuje se na admin "Naplata" ekranu. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Get('status')
  async status(@CurrentUser() user: AuthenticatedUser) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    return {
      subscription_status: restaurant.subscriptionStatus,
      trial_ends_at: restaurant.trialEndsAt,
      subscription_renews_at: restaurant.subscriptionRenewsAt,
    };
  }

  /**
   * JEDAN Lemon Squeezy webhook za cijelu platformu (isti store, jedan
   * konfigurisani URL u LS dashboardu prima SVE event tipove) - grana se po
   * event_name na pretplatu (BillingService) ili webshop narudžbu (ShopService).
   */
  @Public()
  @HttpCode(200)
  @Post('webhook')
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-signature') signature?: string) {
    if (!req.rawBody || !this.billing.verifyWebhookSignature(req.rawBody, signature)) {
      throw new BadRequestException('Nevažeći potpis webhook zahtjeva.');
    }

    const event = JSON.parse(req.rawBody.toString('utf8'));
    if (event.meta?.event_name?.startsWith('subscription_')) {
      await this.billing.handleWebhookEvent(event);
    } else if (event.meta?.event_name === 'order_created') {
      await this.shop.handleOrderWebhook(event);
    }
    return { received: true };
  }
}
