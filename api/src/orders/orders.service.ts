import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PrintDispatchGateway } from './print-dispatch.gateway';
import { PaymentsService } from '../payments/payments.service';
import { CreateOrderDto } from './dto/create-order.dto';

function localizedName(json: unknown): string {
  const rec = json as Record<string, string> | null | undefined;
  if (!rec) return 'Artikal';
  return rec.bs ?? rec.en ?? Object.values(rec).find(Boolean) ?? 'Artikal';
}

// Heuristika za "pametno" najranije vrijeme preuzimanja (vidi OrdersService.getEarliestPickupTime).
const PICKUP_BASE_LEAD_MINUTES = 15; // minimalno vrijeme pripreme, i kad je kuhinja prazna
const PICKUP_MINUTES_PER_ACTIVE_ORDER = 4; // koliko svaka narudzba u redu "kosta" dodatnog cekanja
const PICKUP_MAX_LEAD_MINUTES = 90; // gornja granica - iznad ovoga bolje reci gostu da pozove, ne ponuditi apsurdno dugo vrijeme

/**
 * `create()`/`approveOrder()` moraju vratiti nesto sto klijent (uklj. JAVNU
 * `POST /orders/takeaway/:slug` rutu, bez autentikacije) stvarno dobija u
 * odgovoru - zato SAMO ova polja, nikad `restaurant: true` (puni objekat bi
 * procurio enkriptovane Twilio/Stripe tajne i geofencing/IP podatke javno
 * dostupnom pozivaocu). PrintDispatchGateway.dispatchOrder() ionako koristi
 * samo ova ista polja (vidi PrintableRestaurant tamo).
 */
const SAFE_RESTAURANT_SELECT = {
  id: true,
  name: true,
  kitchenPrinterIp: true,
  kitchenPrinterPort: true,
  barPrinterIp: true,
  barPrinterPort: true,
} as const;

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly printDispatch: PrintDispatchGateway,
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  list(restaurantId: string, status?: string) {
    return this.prisma.order.findMany({
      where: { restaurantId, ...(status ? { status } : {}) },
      include: { items: { include: { menuItem: true } }, table: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId },
      include: { items: { include: { menuItem: true } }, table: true },
    });
    if (!order) throw new NotFoundException('Narudžba nije pronađena.');
    return order;
  }

  /**
   * Račun za sto - "Split the Bill" (modul A.5). Javno dostupno gostu uz
   * validan qr_token (isti obrazac kao ostale gost-facing rute). Obuhvata
   * narudžbe od početka današnjeg dana za taj sto (bez posebne
   * "sjedenja/sesije" tabele, ovo je pragmatična granica - novi gosti za
   * istim stolom sutra ne vide jučerašnji račun).
   */
  async getBillForTable(tableId: string, qrToken: string) {
    const table = await this.prisma.restaurantTable.findUnique({ where: { id: tableId } });
    if (!table || table.qrCodeToken !== qrToken) {
      throw new NotFoundException('Sto nije pronađen ili je QR kod nevažeći.');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const orders = await this.prisma.order.findMany({
      where: { tableId, status: { not: 'cancelled' }, createdAt: { gte: startOfToday } },
      include: { items: { include: { menuItem: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const flatItems = orders.flatMap((order) =>
      order.items.map((item) => {
        const modifiers = (item.selectedModifiers as Array<{ price?: number }> | null) ?? [];
        const modifiersTotal = modifiers.reduce((sum, m) => sum + Number(m.price ?? 0), 0);
        const lineTotal = (Number(item.unitPrice) + modifiersTotal) * item.quantity;
        return {
          order_number: order.orderNumber,
          menu_item_id: item.menuItemId,
          name: localizedName(item.menuItem?.nameJson),
          quantity: item.quantity,
          unit_price: Number(item.unitPrice),
          line_total: Math.round(lineTotal * 100) / 100,
          added_by: item.addedBy,
        };
      }),
    );

    const total = flatItems.reduce((sum, i) => sum + i.line_total, 0);

    const byGuest = new Map<string, { guest_id: string; items: typeof flatItems; subtotal: number }>();
    for (const item of flatItems) {
      const key = item.added_by ?? 'unknown';
      const entry = byGuest.get(key) ?? { guest_id: key, items: [], subtotal: 0 };
      entry.items.push(item);
      entry.subtotal += item.line_total;
      byGuest.set(key, entry);
    }

    return {
      table_id: tableId,
      order_numbers: orders.map((o) => o.orderNumber),
      total: Math.round(total * 100) / 100,
      items: flatItems,
      by_guest: Array.from(byGuest.values()).map((g) => ({ ...g, subtotal: Math.round(g.subtotal * 100) / 100 })),
    };
  }

  /**
   * "Pametno" najranije vrijeme preuzimanja - raste sa brojem trenutno
   * aktivnih narudzbi (dine-in i takeaway zajedno, jer dijele istu kuhinju).
   * Namjerno jednostavna heuristika (baza + N aktivnih * minuta_po_narudzbi,
   * ograniceno na razuman raspon) umjesto pravog queueing modela - dovoljno
   * "pametno" da se produzi kad je gori i skrati kad je mirno, bez potrebe
   * za posebnom infrastrukturom za planiranje kapaciteta.
   */
  async getEarliestPickupTime(restaurantId: string) {
    const activeOrders = await this.prisma.order.count({
      where: { restaurantId, status: { in: ['pending', 'preparing'] } },
    });

    const leadMinutes = Math.min(
      PICKUP_MAX_LEAD_MINUTES,
      PICKUP_BASE_LEAD_MINUTES + activeOrders * PICKUP_MINUTES_PER_ACTIVE_ORDER,
    );

    return {
      earliest_pickup_time: new Date(Date.now() + leadMinutes * 60 * 1000).toISOString(),
      lead_minutes: leadMinutes,
      active_orders: activeOrders,
    };
  }

  /** Javna verzija iznad - koristi je gost PWA prije nego sto uopste popuni formu, po slug-u iz URL-a. */
  async getEarliestPickupTimeForSlug(restaurantSlug: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant) throw new NotFoundException('Restoran nije pronađen.');
    return this.getEarliestPickupTime(restaurant.id);
  }

  /**
   * Javna narudzba za preuzimanje (Takeaway/Pickup, modul D.3) - gost naruca
   * od kuce, bez QR koda/stola. Identifikuje restoran po slug-u (isti
   * obrazac kao javne rute za meni/rezervacije).
   */
  async createTakeaway(restaurantSlug: string, dto: CreateOrderDto) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
    if (!restaurant || !restaurant.isActive) throw new NotFoundException('Restoran nije pronađen.');

    if (!dto.pickup_time) throw new BadRequestException('Vrijeme preuzimanja je obavezno.');
    if (!dto.customer_name || !dto.customer_phone) {
      throw new BadRequestException('Ime i telefon su obavezni za narudžbu za preuzimanje.');
    }
    const pickupTime = new Date(dto.pickup_time);
    if (pickupTime.getTime() < Date.now()) {
      throw new BadRequestException('Vrijeme preuzimanja mora biti u budućnosti.');
    }

    // Ponovo izracunato u trenutku slanja (ne vjerovati vrijednosti koju je
    // klijent mozda ucitao par minuta ranije, prije nego se red produzio) -
    // sa malo popusta (10 min) da se izbjegne odbijanje zbog sitnih oscilacija.
    const { earliest_pickup_time: earliestIso } = await this.getEarliestPickupTime(restaurant.id);
    const graceMs = 10 * 60 * 1000;
    if (pickupTime.getTime() < new Date(earliestIso).getTime() - graceMs) {
      throw new BadRequestException(
        `Kuhinja je trenutno opterećena, najraniji termin preuzimanja je ${new Date(earliestIso).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })}.`,
      );
    }

    const order = await this.create(restaurant.id, { ...dto, table_id: undefined, order_type: 'takeaway' });

    // Online plaćanje (modul D.3) - samo ako je gost izabrao karticu I
    // restoran ima podešen Stripe (vidi admin "Postavke"); inače ostaje
    // "plaćanje pri preuzimanju" kao i do sad, bez ikakve promjene ponašanja.
    if (dto.payment_method === 'card') {
      const pwaBaseUrl = this.config.get<string>('PWA_BASE_URL', 'http://localhost:3002');
      const checkoutSession = await this.payments.createCheckoutSession({
        restaurantId: restaurant.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: Number(order.totalAmount),
        currency: restaurant.currency,
        successUrl: `${pwaBaseUrl}/takeaway/${restaurantSlug}?payment=success&order_id=${order.id}`,
        cancelUrl: `${pwaBaseUrl}/takeaway/${restaurantSlug}?payment=cancelled&order_id=${order.id}`,
      });
      if (checkoutSession) {
        return { ...order, payment_url: checkoutSession.url };
      }
    }

    return order;
  }

  async updateStatus(restaurantId: string, orderId: string, status: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId } });
    if (!order) throw new NotFoundException('Narudžba nije pronađena.');

    return this.prisma.order.update({ where: { id: orderId }, data: { status } });
  }

  /**
   * Kreira narudzbu iz korpe (bilo preko gost PWA -> websocket-gateway
   * `place_order` -> ovaj endpoint preko HTTP-a, ili rucnim unosom konobara).
   * Cijene i modifikatori se uvijek preuzimaju iz baze u trenutku narudzbe
   * (nikad iz klijentovog payloada) da gost ne moze mijenjati cijenu u browseru.
   *
   * `options.isGuestOrder` - postavlja SAMO interna ruta (gost preko QR koda,
   * modul C.3) - ako restoran ima ukljucen `requireOrderApproval`, ovakva
   * narudzba pocinje kao 'pending_approval' i NE ide odmah u stampu; konobar
   * je mora odobriti (vidi approveOrder ispod). Rucni unos konobara i
   * takeaway namjerno NIKAD ne prolaze kroz ovu provjeru (konobar je vec
   * "odobrio" unoseci je sam, a spec vezuje ovaj rezim iskljucivo za "narudzbu
   * napravljenu preko QR koda").
   */
  async create(restaurantId: string, dto: CreateOrderDto, options: { isGuestOrder?: boolean } = {}) {
    if (dto.table_id) {
      const table = await this.prisma.restaurantTable.findFirst({
        where: { id: dto.table_id, restaurantId },
      });
      if (!table) throw new BadRequestException('Sto ne pripada ovom restoranu.');
    }

    const menuItemIds = dto.items.map((i) => i.menu_item_id);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, category: { restaurantId } },
      include: { modifiers: true },
    });
    const menuItemMap = new Map(menuItems.map((mi) => [mi.id, mi]));

    let totalAmount = 0;
    const orderItemsData = dto.items.map((input) => {
      const menuItem = menuItemMap.get(input.menu_item_id);
      if (!menuItem) {
        throw new BadRequestException(`Artikal ${input.menu_item_id} ne postoji ili nije dostupan.`);
      }
      if (!menuItem.isAvailable) {
        throw new BadRequestException(`Artikal "${JSON.stringify(menuItem.nameJson)}" trenutno nije dostupan (rasprodano).`);
      }

      const modifierIds = new Set((input.selected_modifiers ?? []).map((m) => m.id));
      const resolvedModifiers = menuItem.modifiers.filter((m) => modifierIds.has(m.id));
      const modifiersTotal = resolvedModifiers.reduce((sum, m) => sum + Number(m.price), 0);
      const unitPrice = Number(menuItem.price);

      totalAmount += (unitPrice + modifiersTotal) * input.quantity;

      return {
        menuItemId: menuItem.id,
        quantity: input.quantity,
        unitPrice,
        itemNotes: input.item_notes,
        addedBy: input.added_by,
        selectedModifiers: resolvedModifiers.map((m) => ({
          id: m.id,
          name: (m.nameJson as Record<string, string>)?.bs ?? (m.nameJson as Record<string, string>)?.en,
          price: Number(m.price),
        })),
      };
    });

    let initialStatus = 'pending';
    if (options.isGuestOrder) {
      const restaurantSettings = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { requireOrderApproval: true },
      });
      if (restaurantSettings?.requireOrderApproval) initialStatus = 'pending_approval';
    }

    const order = await this.prisma.order.create({
      data: {
        restaurantId,
        tableId: dto.table_id,
        orderType: dto.order_type ?? 'dine_in',
        status: initialStatus,
        paymentMethod: dto.payment_method ?? 'cash',
        notes: dto.notes,
        totalAmount,
        pickupTime: dto.pickup_time ? new Date(dto.pickup_time) : undefined,
        customerName: dto.customer_name,
        customerPhone: dto.customer_phone,
        items: { create: orderItemsData },
      },
      include: { items: { include: { menuItem: true } }, table: true, restaurant: { select: SAFE_RESTAURANT_SELECT } },
    });

    // Sto prelazi u "zauzet" prvom narudzbom - konobarski tlocrt ga tako vidi
    // bez cekanja da neko rucno oznaci sto. Ne dira 'bill_requested' (gost je
    // vec zatrazio racun) ni vec 'occupied'. Ovo se desava bez obzira na
    // odobravanje - gost JESTE za stolom, samo narudzba jos nije u kuhinji.
    if (order.tableId && (order.table?.status === 'free' || order.table?.status === 'reserved')) {
      await this.prisma.restaurantTable.update({ where: { id: order.tableId }, data: { status: 'occupied' } });
    }

    // Ako ceka odobrenje konobara, print se odlaze do approveOrder() - inace
    // bi kuhinja pocela pripremati nesto sto konobar jos nije ni vidio.
    if (initialStatus !== 'pending_approval') {
      // Fire-and-forget prema print agentu - ne blokira odgovor gostu ako je
      // agent trenutno offline (print-gateway ima sopstveni retry/queue).
      this.printDispatch.dispatchOrder(order, order.items, order.restaurant, order.table);
    }

    return order;
  }

  /** Konobar odobrava QR narudzbu koja je cekala (modul C.3) - tek sad ide u stampu/kuhinju. */
  async approveOrder(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, restaurantId, status: 'pending_approval' },
      include: { items: { include: { menuItem: true } }, table: true, restaurant: { select: SAFE_RESTAURANT_SELECT } },
    });
    if (!order) throw new NotFoundException('Narudžba za odobrenje nije pronađena (možda je već obrađena).');

    const updated = await this.prisma.order.update({ where: { id: orderId }, data: { status: 'pending' } });
    this.printDispatch.dispatchOrder({ ...order, status: 'pending' }, order.items, order.restaurant, order.table);
    return updated;
  }

  /** Konobar odbija QR narudzbu (npr. artikal vise nije dostupan) - ne ide u kuhinju. */
  async rejectOrder(restaurantId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, restaurantId, status: 'pending_approval' } });
    if (!order) throw new NotFoundException('Narudžba za odobrenje nije pronađena (možda je već obrađena).');

    return this.prisma.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
  }
}
