import { createHmac } from 'crypto';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let prisma: { restaurant: { update: jest.Mock } };
  let config: { get: jest.Mock };
  let service: BillingService;
  const webhookSecret = 'test-webhook-secret';

  beforeEach(() => {
    prisma = { restaurant: { update: jest.fn() } };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          LEMONSQUEEZY_API_KEY: 'ls-api-key',
          LEMONSQUEEZY_STORE_ID: '123',
          LEMONSQUEEZY_VARIANT_ID: '456',
          LEMONSQUEEZY_WEBHOOK_SECRET: webhookSecret,
        };
        return values[key];
      }),
    };
    service = new BillingService(prisma as any, config as any);
  });

  describe('verifyWebhookSignature', () => {
    it('vraca true za ispravan HMAC-SHA256 potpis', () => {
      const body = Buffer.from(JSON.stringify({ hello: 'world' }));
      const validSignature = createHmac('sha256', webhookSecret).update(body).digest('hex');

      expect(service.verifyWebhookSignature(body, validSignature)).toBe(true);
    });

    it('vraca false za neispravan potpis', () => {
      const body = Buffer.from(JSON.stringify({ hello: 'world' }));

      expect(service.verifyWebhookSignature(body, 'ocigledno-pogresan-potpis-ali-iste-duzine-kao-hex64-znakova00')).toBe(false);
    });

    it('vraca false ako signature header nedostaje', () => {
      const body = Buffer.from('{}');
      expect(service.verifyWebhookSignature(body, undefined)).toBe(false);
    });

    it('vraca false ako webhook secret nije podesen na serveru', () => {
      config.get.mockReturnValue(undefined);
      const body = Buffer.from('{}');
      const signature = createHmac('sha256', webhookSecret).update(body).digest('hex');

      expect(service.verifyWebhookSignature(body, signature)).toBe(false);
    });
  });

  describe('handleWebhookEvent', () => {
    it('azurira restaurant sa mapiranim statusom (on_trial -> trialing) i LS podacima', async () => {
      await service.handleWebhookEvent({
        meta: { event_name: 'subscription_created', custom_data: { restaurant_id: 'rest-1' } },
        data: { id: 'ls-sub-1', attributes: { status: 'on_trial', renews_at: '2026-09-01T00:00:00Z', customer_id: 999 } },
      });

      expect(prisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        data: {
          subscriptionStatus: 'trialing',
          subscriptionRenewsAt: new Date('2026-09-01T00:00:00Z'),
          lemonSqueezyCustomerId: '999',
          lemonSqueezySubscriptionId: 'ls-sub-1',
        },
      });
    });

    it('mapira "active" -> "active" i "cancelled" -> "cancelled"', async () => {
      await service.handleWebhookEvent({
        meta: { event_name: 'subscription_updated', custom_data: { restaurant_id: 'rest-1' } },
        data: { id: 'ls-sub-1', attributes: { status: 'active', renews_at: null, customer_id: 999 } },
      });
      expect(prisma.restaurant.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: 'active' }) }));

      await service.handleWebhookEvent({
        meta: { event_name: 'subscription_cancelled', custom_data: { restaurant_id: 'rest-1' } },
        data: { id: 'ls-sub-1', attributes: { status: 'cancelled', renews_at: null, customer_id: 999 } },
      });
      expect(prisma.restaurant.update).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ subscriptionStatus: 'cancelled' }) }),
      );
    });

    it('preskace (ne azurira nista) ako custom_data.restaurant_id nedostaje', async () => {
      await service.handleWebhookEvent({
        meta: { event_name: 'subscription_created' },
        data: { id: 'ls-sub-1', attributes: { status: 'active', renews_at: null, customer_id: 1 } },
      });

      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });
  });

  describe('createCheckoutUrl', () => {
    it('vraca null bez poziva mreze ako Lemon Squeezy nije podesen', async () => {
      config.get.mockReturnValue(undefined);
      const result = await service.createCheckoutUrl('rest-1', 'vlasnik@test.ba');
      expect(result).toBeNull();
    });
  });
});
