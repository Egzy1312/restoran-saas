import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateShopOrderDto } from './dto/create-shop-order.dto';
import { CreateShopProductDto } from './dto/create-shop-product.dto';
import { UpdateShopProductDto } from './dto/update-shop-product.dto';

interface LemonSqueezyOrderWebhookEvent {
  meta: { event_name: string; custom_data?: Record<string, string> };
  data: { id: string };
}

/**
 * Webshop - platforma prodaje fizicki hardver (termalni printeri i sl.)
 * restoranima, odvojeno od hrane koju gost narucuje kod restorana (Order/
 * OrderItem). Placanje preko Lemon Squeezy, GLOBALNI kredencijali (isti
 * razlog kao billing/billing.service.ts - restorani placaju NAMA).
 */
@Injectable()
export class ShopService {
  private readonly logger = new Logger(ShopService.name);

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
  private get shopVariantId() {
    return this.config.get<string>('LEMONSQUEEZY_SHOP_VARIANT_ID');
  }

  // --- Javno (storefront) ---

  listProducts() {
    return this.prisma.shopProduct.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  }

  async getProduct(slug: string) {
    const product = await this.prisma.shopProduct.findUnique({ where: { slug } });
    if (!product || !product.isActive) throw new NotFoundException('Proizvod nije pronađen.');
    return product;
  }

  /**
   * Kreira narudžbu hardvera. Cijene se UVIJEK preuzimaju iz baze (nikad iz
   * klijentovog payloada) - isti princip kao OrdersService.create() za hranu.
   * Restaurant_id se namjerno NE trazi u DTO-u (javna forma, ne zahtijeva
   * prijavu) - kupac unosi sve podatke rucno u formi za dostavu.
   */
  async createOrder(dto: CreateShopOrderDto, restaurantId?: string) {
    const productIds = dto.items.map((i) => i.product_id);
    const products = await this.prisma.shopProduct.findMany({ where: { id: { in: productIds }, isActive: true } });
    const productMap = new Map(products.map((p) => [p.id, p]));

    let totalCents = 0;
    const itemsData = dto.items.map((input) => {
      const product = productMap.get(input.product_id);
      if (!product) throw new BadRequestException(`Proizvod ${input.product_id} ne postoji ili nije dostupan.`);
      if (product.stockQty < input.quantity) {
        throw new BadRequestException(`Nema dovoljno zaliha za "${product.name}" (dostupno: ${product.stockQty}).`);
      }
      totalCents += product.priceCents * input.quantity;
      return {
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: input.quantity,
      };
    });

    const currency = products[0]?.currency ?? 'BAM';

    // Pouzeće (COD) je podrazumijevano i TRENUTNO JEDINO ponuđeno u /shop -
    // kurir naplaćuje gotovinu pri dostavi, nema online plaćanja niti Lemon
    // Squeezy checkout-a za ovaj slučaj. 'card' ostaje podržan u kodu (ispod)
    // za kad se poveže prava prodavnica, samo nije izložen u UI-ju.
    const paymentMethod = dto.payment_method ?? 'cod';

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shopOrder.create({
        data: {
          restaurantId,
          customerName: dto.customer_name,
          customerEmail: dto.customer_email,
          customerPhone: dto.customer_phone,
          shippingAddress: dto.shipping_address,
          totalCents,
          currency,
          paymentMethod,
          items: { create: itemsData },
        },
        include: { items: true },
      });
      // Rezervisi zalihe odmah (ne cekati placanje) - jednostavnije za MVP
      // obim (nizak volumen hardverskih narudzbi); prava produkcija bi ovo
      // radila tek na "paid" webhook da izbjegne rezervaciju za napustene checkout-e.
      for (const item of itemsData) {
        await tx.shopProduct.update({ where: { id: item.productId }, data: { stockQty: { decrement: item.quantity } } });
      }
      return created;
    });

    if (paymentMethod !== 'card') return order;

    const checkout = await this.createCheckoutUrl(order.id, totalCents, currency, dto.customer_email);
    return checkout ? { ...order, payment_url: checkout.url } : order;
  }

  private async createCheckoutUrl(shopOrderId: string, totalCents: number, currency: string, email: string): Promise<{ url: string } | null> {
    if (!this.apiKey || !this.storeId || !this.shopVariantId) {
      this.logger.warn('Lemon Squeezy nije podešen za webshop (LEMONSQUEEZY_SHOP_VARIANT_ID) - narudžba ostaje "na čekanju", kontaktirati kupca ručno.');
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
                email,
                custom: { shop_order_id: shopOrderId },
              },
              // Cijena se prepisuje na stvarni iznos narudzbe - "webshop"
              // varijanta u Lemon Squeezy dashboardu postoji samo kao
              // generican nosilac (njena podesena cijena se ne koristi).
              checkout_options: { button_color: '#f97316' },
              product_options: { enabled_variants: [this.shopVariantId] },
              custom_price: totalCents,
            },
            relationships: {
              store: { data: { type: 'stores', id: this.storeId } },
              variant: { data: { type: 'variants', id: this.shopVariantId } },
            },
          },
        }),
      });

      if (!res.ok) {
        this.logger.error(`Kreiranje Lemon Squeezy checkout-a (webshop) nije uspjelo: ${res.status} ${await res.text()}`);
        return null;
      }

      const json = (await res.json()) as { data?: { attributes?: { url?: string } } };
      const url = json.data?.attributes?.url;
      return url ? { url } : null;
    } catch (err) {
      this.logger.error(`Kreiranje Lemon Squeezy checkout-a (webshop) nije uspjelo: ${(err as Error).message}`);
      return null;
    }
  }

  /** Poziva se iz BillingController-ovog jedinstvenog Lemon Squeezy webhook endpointa kad event_name === 'order_created'. */
  async handleOrderWebhook(event: LemonSqueezyOrderWebhookEvent) {
    const shopOrderId = event.meta.custom_data?.shop_order_id;
    if (!shopOrderId) return; // nije webshop narudzba (npr. pretplata) - BillingService je vec obradio

    await this.prisma.shopOrder.update({
      where: { id: shopOrderId },
      data: { status: 'paid', lemonSqueezyOrderId: event.data.id },
    });
    this.logger.log(`Webshop narudžba ${shopOrderId} označena kao plaćena (Lemon Squeezy).`);
  }

  // --- SUPER_ADMIN (platform-admin) ---

  listAllProducts() {
    return this.prisma.shopProduct.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createProduct(dto: CreateShopProductDto) {
    const slug = await this.generateUniqueSlug(dto.name);
    return this.prisma.shopProduct.create({
      data: {
        name: dto.name,
        slug,
        description: dto.description,
        priceCents: dto.price_cents,
        imageUrl: dto.image_url,
        sku: dto.sku,
        stockQty: dto.stock_qty ?? 0,
        isActive: dto.is_active ?? true,
      },
    });
  }

  async updateProduct(id: string, dto: UpdateShopProductDto) {
    const product = await this.prisma.shopProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Proizvod nije pronađen.');

    return this.prisma.shopProduct.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        priceCents: dto.price_cents,
        imageUrl: dto.image_url,
        sku: dto.sku,
        stockQty: dto.stock_qty,
        isActive: dto.is_active,
      },
    });
  }

  async deleteProduct(id: string) {
    const product = await this.prisma.shopProduct.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Proizvod nije pronađen.');
    await this.prisma.shopProduct.delete({ where: { id } });
  }

  listOrders() {
    return this.prisma.shopOrder.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
  }

  async updateOrderStatus(id: string, status: string) {
    const order = await this.prisma.shopOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Narudžba nije pronađena.');
    return this.prisma.shopOrder.update({ where: { id }, data: { status } });
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = name.toLowerCase().replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'proizvod';
    let slug = base;
    let suffix = 2;
    while (await this.prisma.shopProduct.findUnique({ where: { slug } })) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }
    return slug;
  }
}
