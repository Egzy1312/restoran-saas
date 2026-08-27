import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface LemonSqueezyWebhookEvent {
  meta: { event_name: string; custom_data?: Record<string, string> };
  data: {
    id: string;
    attributes: {
      status: string; // on_trial | active | past_due | cancelled | expired | paused | unpaid
      renews_at?: string | null;
      customer_id: number;
    };
  };
}

// Lemon Squeezy status -> nas interni status (Restaurant.subscriptionStatus).
const STATUS_MAP: Record<string, string> = {
  on_trial: 'trialing',
  active: 'active',
  past_due: 'past_due',
  unpaid: 'past_due',
  cancelled: 'cancelled',
  expired: 'cancelled',
  paused: 'cancelled',
};

/**
 * Pretplata restorana NA PLATFORMU (Lemon Squeezy) - za razliku od Twilio/
 * Stripe (payments.service.ts), ovo NIJE po restoranu jer restorani placaju
 * NAMA (jedna nasa prodavnica/store u Lemon Squeezy-u), ne obrnuto. Zato su
 * kredencijali GLOBALNI env (vidi .env.example), ne polja na Restaurant.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get apiKey() {
    return this.config.get<string>('LEMONSQUEEZY_API_KEY');
  }
  private get storeId() {
    return this.config.get<string>('LEMONSQUEEZY_STORE_ID');
  }
  private get variantId() {
    return this.config.get<string>('LEMONSQUEEZY_VARIANT_ID');
  }
  private get webhookSecret() {
    return this.config.get<string>('LEMONSQUEEZY_WEBHOOK_SECRET');
  }

  /** Kreira Lemon Squeezy hosted checkout URL za dati restoran (vlasnik ga otvara da unese karticu). */
  async createCheckoutUrl(restaurantId: string, ownerEmail: string): Promise<{ url: string } | null> {
    if (!this.apiKey || !this.storeId || !this.variantId) {
      this.logger.warn('Lemon Squeezy nije podešen (LEMONSQUEEZY_* env varijable) - naplata nije dostupna.');
      return null;
    }

    try {
      const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          data: {
            type: 'checkouts',
            attributes: {
              checkout_data: {
                email: ownerEmail,
                // Vraca nam se nazad u meta.custom_data na SVAKOM buducem
                // webhook eventu za ovu pretplatu (subscription_updated i sl.)
                // - tako znamo kojem restoranu pripada bez dodatnog stanja.
                custom: { restaurant_id: restaurantId },
              },
            },
            relationships: {
              store: { data: { type: 'stores', id: this.storeId } },
              variant: { data: { type: 'variants', id: this.variantId } },
            },
          },
        }),
      });

      if (!res.ok) {
        this.logger.error(`Kreiranje Lemon Squeezy checkout-a nije uspjelo: ${res.status} ${await res.text()}`);
        return null;
      }

      const json = (await res.json()) as { data?: { attributes?: { url?: string } } };
      const url = json.data?.attributes?.url;
      return url ? { url } : null;
    } catch (err) {
      this.logger.error(`Kreiranje Lemon Squeezy checkout-a nije uspjelo: ${(err as Error).message}`);
      return null;
    }
  }

  /** HMAC-SHA256 potpis (X-Signature header) nad SIROVIM tijelom zahtjeva - vidi main.ts (rawBody: true). */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!this.webhookSecret || !signatureHeader) return false;

    const digest = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const digestBuf = Buffer.from(digest, 'utf8');
    const signatureBuf = Buffer.from(signatureHeader, 'utf8');
    if (digestBuf.length !== signatureBuf.length) return false;

    return timingSafeEqual(digestBuf, signatureBuf);
  }

  async handleWebhookEvent(event: LemonSqueezyWebhookEvent) {
    const restaurantId = event.meta.custom_data?.restaurant_id;
    if (!restaurantId) {
      this.logger.warn(`Lemon Squeezy webhook (${event.meta.event_name}) bez restaurant_id u custom_data - preskačem.`);
      return;
    }

    const status = STATUS_MAP[event.data.attributes.status] ?? 'active';

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        subscriptionStatus: status,
        subscriptionRenewsAt: event.data.attributes.renews_at ? new Date(event.data.attributes.renews_at) : null,
        lemonSqueezyCustomerId: String(event.data.attributes.customer_id),
        lemonSqueezySubscriptionId: event.data.id,
      },
    });
  }
}
