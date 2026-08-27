import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../common/encryption/encryption.service';
import { UpdateRestaurantSettingsDto } from './dto/update-restaurant-settings.dto';

@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getOwn(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');

    // twilioAuthToken/stripeSecretKey se NIKAD ne vracaju nazad klijentu
    // (ni maskirano) - jednom sacuvani, admin panel samo pokazuje "postavljeno
    // da/ne" i dozvoljava upis NOVE vrijednosti, ali ne moze procitati staru.
    const { twilioAuthToken, stripeSecretKey, stripeWebhookSecret, ...safe } = restaurant;
    return {
      ...safe,
      twilioAuthTokenSet: !!twilioAuthToken,
      stripeSecretKeySet: !!stripeSecretKey,
      stripeWebhookSecretSet: !!stripeWebhookSecret,
    };
  }

  /** Za interne pozive (Notifications/Payments servisi) kojima trebaju stvarni kredencijali. */
  async getCredentials(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');
    return restaurant;
  }

  async updateSettings(restaurantId: string, dto: UpdateRestaurantSettingsDto) {
    await this.getOwn(restaurantId); // 404 ako restoran ne postoji

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        // Prazan string = "ne diraj" (isti obrazac kao Twilio/Stripe ispod) -
        // polje je uvijek pre-popunjeno u formi, prazno bi znacilo gresku, ne namjeru brisanja.
        name: dto.name || undefined,
        address: dto.address || undefined,
        latitude: dto.latitude,
        longitude: dto.longitude,
        kitchenPrinterIp: dto.kitchen_printer_ip,
        kitchenPrinterPort: dto.kitchen_printer_port,
        barPrinterIp: dto.bar_printer_ip,
        barPrinterPort: dto.bar_printer_port,
        geofenceRadiusMeters: dto.geofence_radius_meters,
        allowedIp: dto.allowed_ip,
        requireOrderApproval: dto.require_order_approval,
        twilioAccountSid: dto.twilio_account_sid,
        // Prazan string bi tiho obrisao vec sacuvani secret ako ga admin panel
        // posalje nenamjerno (npr. input ostao prazan) - zato se PATCH-uje samo
        // kad je stvarno poslana nova vrijednost (undefined = "ne diraj").
        // Enkriptovano at-rest (AES-256-GCM, vidi EncryptionService) - ovo su
        // JEDINA stvarno tajna polja (account SID i from-number nisu tajni).
        twilioAuthToken: dto.twilio_auth_token ? this.encryption.encrypt(dto.twilio_auth_token) : undefined,
        twilioFromNumber: dto.twilio_from_number,
        stripeSecretKey: dto.stripe_secret_key ? this.encryption.encrypt(dto.stripe_secret_key) : undefined,
        stripeWebhookSecret: dto.stripe_webhook_secret ? this.encryption.encrypt(dto.stripe_webhook_secret) : undefined,
      },
    });

    return this.getOwn(restaurantId);
  }
}
