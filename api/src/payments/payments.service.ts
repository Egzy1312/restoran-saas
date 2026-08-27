import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';

/**
 * Online plaćanje za Takeaway/Pickup (specifikacija, modul D.3 - "izvrše
 * online plaćanje"). Stripe Secret Key je PO RESTORANU (unesen kroz admin
 * "Postavke" ekran), ne globalna .env varijabla - svaki restoran koristi
 * svoj vlastiti Stripe nalog (nije Stripe Connect).
 *
 * Ako restoran nije podesio Stripe, `createCheckoutSession` vraca null i
 * OrdersService se ponasa kao ranije ("plaćanje pri preuzimanju") - stvarno
 * online placanje je ADITIVNA mogucnost, ne zamjena za postojeci tok.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async createCheckoutSession(params: {
    restaurantId: string;
    orderId: string;
    orderNumber: number;
    totalAmount: number;
    currency: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string } | null> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: params.restaurantId } });
    if (!restaurant?.stripeSecretKey) {
      this.logger.warn(`Restoran ${params.restaurantId} nema podešen Stripe - narudžba ostaje "plaćanje pri preuzimanju".`);
      return null;
    }

    try {
      const stripe = new Stripe(this.encryption.decrypt(restaurant.stripeSecretKey));
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: params.currency.toLowerCase(),
              product_data: { name: `Narudžba #${params.orderNumber} — ${restaurant.name}` },
              unit_amount: Math.round(params.totalAmount * 100), // Stripe trazi najmanju jedinicu valute (centi/feninzi)
            },
            quantity: 1,
          },
        ],
        metadata: { order_id: params.orderId, restaurant_id: params.restaurantId },
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
      });

      return session.url ? { url: session.url } : null;
    } catch (err) {
      this.logger.error(`Kreiranje Stripe Checkout sesije nije uspjelo (restoran ${params.restaurantId}): ${(err as Error).message}`);
      return null;
    }
  }

  /** Verifikuje Stripe webhook potpis koristeci restoranov WEBHOOK secret (ne Stripe Secret Key) i vraca parsirani event. */
  async constructWebhookEvent(restaurantId: string, rawBody: Buffer, signature: string): Promise<Stripe.Event | null> {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant?.stripeSecretKey || !restaurant.stripeWebhookSecret) {
      this.logger.warn(`Webhook pozvan za restoran ${restaurantId} bez podesenog Stripe-a - ignorisano.`);
      return null;
    }

    try {
      const stripe = new Stripe(this.encryption.decrypt(restaurant.stripeSecretKey));
      return stripe.webhooks.constructEvent(rawBody, signature, this.encryption.decrypt(restaurant.stripeWebhookSecret));
    } catch (err) {
      this.logger.warn(`Nevažeći Stripe webhook potpis za restoran ${restaurantId}: ${(err as Error).message}`);
      return null;
    }
  }

  /** Poziva se kad webhook javi da je placanje uspjesno - oznacava narudzbu placenom. */
  async markOrderPaid(orderId: string) {
    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: 'paid' } });
    this.logger.log(`Narudžba ${orderId} označena kao plaćena (Stripe webhook).`);
  }
}
