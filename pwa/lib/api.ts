import { PublicMenuResponse } from '@/types/menu';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export async function fetchPublicMenu(restaurantSlug: string): Promise<PublicMenuResponse> {
  const res = await fetch(`${API_BASE_URL}/menu/public/${restaurantSlug}`, {
    // Meni se cesto mijenja (86-ing, happy hour) - ne keširati agresivno.
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Meni nije pronađen (status ${res.status})`);
  }

  return res.json();
}

export interface ResolvedTable {
  valid: true;
  table_id: string;
  qr_token: string;
  restaurant_id: string;
  restaurant_slug: string;
  table_number: string;
  zone_name: string;
}

/** Razrjesava opaki token iz QR URL-a (`/r/{slug}/t/{token}`) u stvarni table_id + restaurant_id. */
export async function resolveTableToken(token: string): Promise<ResolvedTable | { valid: false }> {
  const res = await fetch(`${API_BASE_URL}/tables/resolve/${encodeURIComponent(token)}`, { cache: 'no-store' });
  if (!res.ok) return { valid: false };
  return res.json();
}

export interface AvailableTable {
  table_id: string;
  table_number: string;
  zone_name: string;
  capacity: number;
}

/** Interactive Floor Plan Booking (modul D.1) - koji stolovi su slobodni za dati termin. */
export async function fetchAvailability(slug: string, timeIso: string, guestCount: number): Promise<AvailableTable[]> {
  const res = await fetch(
    `${API_BASE_URL}/reservations/public/${slug}/availability?time=${encodeURIComponent(timeIso)}&guest_count=${guestCount}`,
    { cache: 'no-store' },
  );
  if (!res.ok) return [];
  return res.json();
}

export interface BillItem {
  order_number: number;
  menu_item_id: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  added_by: string | null;
}

export interface BillGuestGroup {
  guest_id: string;
  items: BillItem[];
  subtotal: number;
}

export interface Bill {
  table_id: string;
  order_numbers: number[];
  total: number;
  items: BillItem[];
  by_guest: BillGuestGroup[];
}

/** Racun za sto - "Split the Bill" (modul A.5). */
export async function fetchBill(tableId: string, qrToken: string): Promise<Bill | null> {
  const res = await fetch(`${API_BASE_URL}/orders/bill/${tableId}?qr_token=${encodeURIComponent(qrToken)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return res.json();
}

export interface EarliestPickup {
  earliest_pickup_time: string;
  lead_minutes: number;
  active_orders: number;
}

/** "Pametno" najranije vrijeme preuzimanja - raste sa opterećenjem kuhinje (modul D.3). */
export async function fetchEarliestPickup(slug: string): Promise<EarliestPickup | null> {
  const res = await fetch(`${API_BASE_URL}/orders/takeaway/${slug}/earliest-pickup`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export interface TakeawayOrderPayload {
  items: Array<{ menu_item_id: string; quantity: number; item_notes?: string }>;
  pickup_time: string;
  customer_name: string;
  customer_phone: string;
  payment_method: 'cash' | 'card';
  notes?: string;
}

/** Takeaway/Pickup (modul D.3) - javna narudzba za preuzimanje, bez QR koda. */
export async function createTakeawayOrder(
  slug: string,
  payload: TakeawayOrderPayload,
): Promise<{ ok: boolean; order_id?: string; order_number?: number; payment_url?: string; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/orders/takeaway/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text || 'Narudžba nije uspjela.' };
  }
  const order = await res.json();
  // payment_url postoji samo ako je gost izabrao karticu I restoran ima
  // podesen Stripe (vidi admin "Postavke") - inace ostaje "plaćanje pri preuzimanju".
  return { ok: true, order_id: order.id, order_number: order.orderNumber, payment_url: order.payment_url };
}

export interface CreateReservationPayload {
  table_id?: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  reservation_time: string;
  guest_count: number;
  special_requests?: string;
}

export async function createReservation(slug: string, payload: CreateReservationPayload): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_BASE_URL}/reservations/public/${slug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text || 'Rezervacija nije uspjela.' };
  }
  return { ok: true };
}
