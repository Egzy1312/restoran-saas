import { BadRequestException, Controller, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Stripe webhook - JEDAN URL PO RESTORANU
   * (`/api/payments/webhook/{restaurant_id}`), jer svaki restoran ima svoj
   * odvojeni Stripe nalog i webhook secret (ne Stripe Connect). Restoran ovaj
   * puni URL upisuje u svom Stripe dashboardu.
   */
  @Public()
  @HttpCode(200)
  @Post('webhook/:restaurantId')
  async webhook(
    @Param('restaurantId') restaurantId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!req.rawBody || !signature) {
      throw new BadRequestException('Nedostaje potpis ili tijelo zahtjeva.');
    }

    const event = await this.paymentsService.constructWebhookEvent(restaurantId, req.rawBody, signature);
    if (!event) {
      // Namjerno 200 (ne 400) - Stripe ponavlja slanje ako ne dobije 2xx, a
      // nevažeći potpis znaci da ionako necemo moci obraditi ovaj event ni
      // sledeci put. Detalj je vec zabiljezen u logu (vidi PaymentsService).
      return { received: false };
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { metadata?: { order_id?: string } };
      const orderId = session.metadata?.order_id;
      if (orderId) await this.paymentsService.markOrderPaid(orderId);
    }

    return { received: true };
  }
}
