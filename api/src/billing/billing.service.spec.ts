import { createHmac } from 'crypto';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  let prisma: { restaurant: { update: jest.Mock; findUnique: jest.Mock }; platformAuditLog: { create: jest.Mock } };
  let config: { get: jest.Mock };
  let service: BillingService;
  const webhookSecret = 'test-webhook-secret';

  beforeEach(() => {
    prisma = {
      restaurant: {
        update: jest.fn(),
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', name: 'Konoba', isActive: true }),
      },
      platformAuditLog: { create: jest.fn() },
    };
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

    it('preskace ako restoran vise ne postoji u bazi (npr. obrisan)', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);

      await service.handleWebhookEvent({
        meta: { event_name: 'subscription_updated', custom_data: { restaurant_id: 'obrisan-restoran' } },
        data: { id: 'ls-sub-1', attributes: { status: 'active', renews_at: null, customer_id: 1 } },
      });

      expect(prisma.restaurant.update).not.toHaveBeenCalled();
    });

    describe('automatska suspenzija kad pretplata otkaze/istekne', () => {
      it('suspenduje (isActive: false) aktivan restoran kad status postane "cancelled"', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', name: 'Konoba', isActive: true });

        await service.handleWebhookEvent({
          meta: { event_name: 'subscription_cancelled', custom_data: { restaurant_id: 'rest-1' } },
          data: { id: 'ls-sub-1', attributes: { status: 'cancelled', renews_at: null, customer_id: 1 } },
        });

        expect(prisma.restaurant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
        );
        expect(prisma.platformAuditLog.create).toHaveBeenCalledWith({
          data: {
            actorId: 'system',
            actorEmail: 'billing-webhook@system',
            action: 'suspend_restaurant_auto',
            targetRestaurantId: 'rest-1',
            targetRestaurantName: 'Konoba',
          },
        });
      });

      it('suspenduje i na "past_due" (neuspjela naplata), ne samo puno otkazivanje', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', name: 'Konoba', isActive: true });

        await service.handleWebhookEvent({
          meta: { event_name: 'subscription_payment_failed', custom_data: { restaurant_id: 'rest-1' } },
          data: { id: 'ls-sub-1', attributes: { status: 'past_due', renews_at: null, customer_id: 1 } },
        });

        expect(prisma.restaurant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }),
        );
      });

      it('NE dira isActive (niti pise audit log) ako je restoran VEC suspendovan - izbjegava spam duplih zapisa', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', name: 'Konoba', isActive: false });

        await service.handleWebhookEvent({
          meta: { event_name: 'subscription_updated', custom_data: { restaurant_id: 'rest-1' } },
          data: { id: 'ls-sub-1', attributes: { status: 'past_due', renews_at: null, customer_id: 1 } },
        });

        expect(prisma.restaurant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.not.objectContaining({ isActive: expect.anything() }) }),
        );
        expect(prisma.platformAuditLog.create).not.toHaveBeenCalled();
      });

      it('NE reaktivira automatski kad placanje uspije ponovo - reaktivacija ostaje svjesna SUPER_ADMIN akcija (moze biti suspendovan iz drugog razloga)', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', name: 'Konoba', isActive: false });

        await service.handleWebhookEvent({
          meta: { event_name: 'subscription_updated', custom_data: { restaurant_id: 'rest-1' } },
          data: { id: 'ls-sub-1', attributes: { status: 'active', renews_at: null, customer_id: 1 } },
        });

        expect(prisma.restaurant.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.not.objectContaining({ isActive: expect.anything() }) }),
        );
      });
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
