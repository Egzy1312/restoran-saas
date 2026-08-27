import { MenuCategory, Modifier } from '@/types/menu';
import { RestaurantTable } from '@/types/table';
import { clearSession, getRefreshToken, getToken, setTokens, StaffUser } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

// Sprecava vise istovremenih /auth/refresh poziva ako vise fetch-eva udari u 401 u isto vrijeme.
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    }
  })();
  const result = await refreshInFlight;
  refreshInFlight = null;
  return result;
}

function handleUnauthorized() {
  clearSession();
  if (typeof window !== 'undefined') window.location.href = '/login';
}

/**
 * Istekao/nevažeći JWT (401) se ranije tiho tretirao kao obična greška -
 * korisnik bi vidio prazne/pokvarene ekrane bez ikakvog objašnjenja umjesto
 * da bude vraćen na prijavu. Otkriveno kad je test token istekao (8h TTL)
 * usred sesije. Sad prvo pokusava tihi refresh preko refresh_token-a - tek
 * ako i TO ne uspije, cisti sesiju i saljem na /login. `window.location`
 * (ne `next/navigation`) jer je ovo obican .ts fajl bez pristupa router-u.
 */
async function request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const doFetch = (t: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${t}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(getToken() ?? token);
    }
    if (res.status === 401) {
      handleUnauthorized();
      throw new Error('Sesija je istekla, prijavite se ponovo.');
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Greška (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type LoginResult =
  | { access_token: string; refresh_token: string; user: StaffUser }
  | { requires_2fa: true; pre_auth_token: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    if (res.status === 401) {
      // Backend salje precizniju poruku za zakljucan nalog (uklj. koliko minuta jos treba cekati)
      // - koristimo je ako postoji, inace generican "pogresan email ili lozinka".
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? 'Pogrešan email ili lozinka.');
    }
    throw new Error('Prijava trenutno nije moguća.');
  }
  return res.json();
}

export async function verifyTwoFactor(preAuthToken: string, token: string): Promise<{ access_token: string; refresh_token: string; user: StaffUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/2fa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pre_auth_token: preAuthToken, token }),
  });
  if (!res.ok) throw new Error('Neispravan ili istekao 2FA kod.');
  return res.json();
}

export const setupTwoFactor = (token: string) => request<{ secret: string; otpauth_url: string }>(token, 'POST', '/auth/2fa/setup');

export const enableTwoFactor = (token: string, code: string) => request<{ enabled: boolean }>(token, 'POST', '/auth/2fa/enable', { token: code });

export const disableTwoFactor = (token: string, password: string) =>
  request<{ enabled: boolean }>(token, 'POST', '/auth/2fa/disable', { password });

export async function verifyEmail(verificationToken: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: verificationToken }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Link za potvrdu emaila je nevažeći ili istekao.');
  }
  return res.json();
}

/** Javna ruta (anti-enumeracija, isti obrazac kao forgotPassword) - zove se sa poznatim emailom iz aktivne sesije, ne treba JWT. */
export async function resendVerification(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Zahtjev trenutno nije moguć, pokušajte kasnije.');
  return res.json();
}

/** Self-service registracija novog restorana (tenanta) + prvog ADMIN naloga - odmah prijavljuje (isti oblik odgovora kao login). */
export async function registerRestaurant(dto: {
  restaurant_name: string;
  address: string;
  owner_full_name: string;
  email: string;
  password: string;
}): Promise<{ access_token: string; refresh_token: string; user: StaffUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 409) throw new Error('Nalog sa ovim emailom već postoji.');
    throw new Error(text || 'Registracija trenutno nije moguća.');
  }
  return res.json();
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error('Zahtjev trenutno nije moguć, pokušajte kasnije.');
  return res.json();
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || 'Link za resetovanje lozinke je nevažeći ili istekao.');
  }
  return res.json();
}

// --- Naplata (pretplata restorana na platformu - Lemon Squeezy) ---
export interface BillingStatus {
  subscription_status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  trial_ends_at: string | null;
  subscription_renews_at: string | null;
}

export const fetchBillingStatus = (token: string) => request<BillingStatus>(token, 'GET', '/billing/status');

export const createBillingCheckout = (token: string) => request<{ url: string }>(token, 'POST', '/billing/checkout');

// --- Platform admin (SUPER_ADMIN - upravljanje svim tenantima) ---
export interface PlatformRestaurant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  subscription_status: string;
  trial_ends_at: string | null;
  subscription_renews_at: string | null;
  created_at: string;
  order_count: number;
  staff_count: number;
  table_count: number;
}

export interface PlatformStats {
  restaurant_count: number;
  active_subscriptions: number;
  trialing_count: number;
  past_due_count: number;
  cancelled_count: number;
  total_orders: number;
  orders_last_24h: number;
}

export interface PlatformAuditLogEntry {
  id: string;
  actor_email: string;
  action: string;
  target_restaurant_id: string | null;
  target_restaurant_name: string | null;
  created_at: string;
}

export const fetchPlatformRestaurants = (token: string) => request<PlatformRestaurant[]>(token, 'GET', '/platform/restaurants');

export const fetchPlatformAuditLog = (token: string) => request<PlatformAuditLogEntry[]>(token, 'GET', '/platform/audit-log');

export const fetchPlatformStats = (token: string) => request<PlatformStats>(token, 'GET', '/platform/stats');

export const suspendRestaurant = (token: string, id: string) =>
  request<PlatformRestaurant>(token, 'PATCH', `/platform/restaurants/${id}/suspend`);

export const activateRestaurant = (token: string, id: string) =>
  request<PlatformRestaurant>(token, 'PATCH', `/platform/restaurants/${id}/activate`);

// --- Meni ---
export const fetchMenu = (token: string) => request<MenuCategory[]>(token, 'GET', '/menu');

export const createCategory = (token: string, dto: { name_json: Record<string, string>; sort_order?: number }) =>
  request(token, 'POST', '/menu/categories', dto);

export const updateCategory = (token: string, id: string, dto: Record<string, unknown>) =>
  request(token, 'PATCH', `/menu/categories/${id}`, dto);

export const deleteCategory = (token: string, id: string) => request(token, 'DELETE', `/menu/categories/${id}`);

export const createItem = (token: string, dto: Record<string, unknown>) => request(token, 'POST', '/menu/items', dto);

export const updateItem = (token: string, id: string, dto: Record<string, unknown>) =>
  request(token, 'PATCH', `/menu/items/${id}`, dto);

export const deleteItem = (token: string, id: string) => request(token, 'DELETE', `/menu/items/${id}`);

export const addModifier = (token: string, itemId: string, dto: { name_json: Record<string, string>; price: number }) =>
  request<Modifier>(token, 'POST', `/menu/items/${itemId}/modifiers`, dto);

export const deleteModifier = (token: string, id: string) => request(token, 'DELETE', `/menu/modifiers/${id}`);

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  address: string;
  currency: string;
  latitude: string | null;
  longitude: string | null;
  kitchenPrinterIp: string | null;
  kitchenPrinterPort: number | null;
  barPrinterIp: string | null;
  barPrinterPort: number | null;
  geofenceRadiusMeters: number | null;
  allowedIp: string | null;
  requireOrderApproval: boolean;
  twilioAccountSid: string | null;
  twilioFromNumber: string | null;
  twilioAuthTokenSet: boolean;
  stripeSecretKeySet: boolean;
  stripeWebhookSecretSet: boolean;
}

export const fetchRestaurant = (token: string) => request<Restaurant>(token, 'GET', '/restaurants/me');

export interface UpdateRestaurantSettingsPayload {
  name?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  kitchen_printer_ip?: string;
  kitchen_printer_port?: number;
  bar_printer_ip?: string;
  bar_printer_port?: number;
  geofence_radius_meters?: number;
  allowed_ip?: string;
  require_order_approval?: boolean;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from_number?: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
}

export const updateRestaurantSettings = (token: string, dto: UpdateRestaurantSettingsPayload) =>
  request<Restaurant>(token, 'PATCH', '/restaurants/me', dto);

// --- Stolovi ---
export const fetchTables = (token: string) => request<RestaurantTable[]>(token, 'GET', '/tables');

export const createTable = (
  token: string,
  dto: { table_number: string; zone_name?: string; capacity?: number },
) => request<RestaurantTable>(token, 'POST', '/tables', dto);

export const updateTable = (token: string, id: string, dto: Record<string, unknown>) =>
  request<RestaurantTable>(token, 'PATCH', `/tables/${id}`, dto);

export const deleteTable = (token: string, id: string) => request(token, 'DELETE', `/tables/${id}`);

// --- Rezervacije ---
export interface Reservation {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  reservationTime: string;
  guestCount: number;
  status: 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  specialRequests?: string | null;
  table: { tableNumber: string; zoneName: string } | null;
}

export const fetchReservations = (token: string) => request<Reservation[]>(token, 'GET', '/reservations');

export const updateReservationStatus = (token: string, id: string, status: string) =>
  request(token, 'PATCH', `/reservations/${id}/status`, { status });

// --- Osoblje (staff_users) ---
export interface StaffAccount {
  id: string;
  email: string;
  fullName: string;
  role: 'ADMIN' | 'MANAGER' | 'WAITER' | 'KITCHEN' | 'BAR';
  isActive: boolean;
  createdAt: string;
}

export const fetchStaff = (token: string) => request<StaffAccount[]>(token, 'GET', '/staff');

export const createStaffUser = (
  token: string,
  dto: { email: string; password: string; full_name: string; role: StaffAccount['role'] },
) => request<StaffAccount>(token, 'POST', '/staff', dto);

export const updateStaffUser = (
  token: string,
  id: string,
  dto: { full_name?: string; role?: StaffAccount['role']; is_active?: boolean; password?: string },
) => request<StaffAccount>(token, 'PATCH', `/staff/${id}`, dto);

export const deleteStaffUser = (token: string, id: string) => request(token, 'DELETE', `/staff/${id}`);

// --- Analitika ---
export interface Summary {
  order_count: number;
  total_revenue: number;
  avg_order_value: number;
}
export interface TopItem {
  menu_item_id: string;
  name: string;
  quantity: number;
  revenue: number;
}
export interface AvgPrepTime {
  avg_minutes: number;
  sample_size: number;
}
export interface TableRevenue {
  table_id: string;
  table_number: string;
  zone_name: string;
  revenue: number;
  order_count: number;
}

export const fetchSummary = (token: string, days: number) =>
  request<Summary>(token, 'GET', `/analytics/summary?days=${days}`);
export const fetchTopItems = (token: string, days: number) =>
  request<TopItem[]>(token, 'GET', `/analytics/top-items?days=${days}&limit=10`);
export const fetchAvgPrepTime = (token: string, days: number) =>
  request<AvgPrepTime>(token, 'GET', `/analytics/avg-prep-time?days=${days}`);
export const fetchTableRevenue = (token: string, days: number) =>
  request<TableRevenue[]>(token, 'GET', `/analytics/table-revenue?days=${days}&limit=10`);

/** Preuzima CSV izvjestaj - Authorization header se ne moze poslati preko obicnog <a href> linka, zato fetch + blob download. */
/** Generičan preuzimalac fajla (CSV/XLSX/PDF svejedno) - Authorization header se ne moze poslati preko obicnog <a href> linka, zato fetch + blob download. */
export async function downloadCsv(token: string, path: string, filename: string) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Preuzimanje nije uspjelo.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- Webshop (hardver - termalni printeri) ---
export interface ShopProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  priceCents: number;
  currency: string;
  imageUrl: string | null;
  sku: string | null;
  stockQty: number;
  isActive: boolean;
  createdAt: string;
}

export interface ShopOrderItem {
  id: string;
  productId: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
}

export interface ShopOrder {
  id: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  shippingAddress: string;
  totalCents: number;
  currency: string;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  paymentMethod: 'cod' | 'card';
  createdAt: string;
  items: ShopOrderItem[];
  payment_url?: string;
}

export async function fetchShopProducts(): Promise<ShopProduct[]> {
  const res = await fetch(`${API_BASE_URL}/shop/products`);
  if (!res.ok) throw new Error('Greška pri učitavanju proizvoda.');
  return res.json();
}

export interface CreateShopOrderPayload {
  items: { product_id: string; quantity: number }[];
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  shipping_address: string;
  payment_method?: 'cod' | 'card';
}

export async function createShopOrder(dto: CreateShopOrderPayload): Promise<ShopOrder> {
  const res = await fetch(`${API_BASE_URL}/shop/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? (JSON.parse(text).message ?? 'Narudžba nije uspjela.') : 'Narudžba nije uspjela.');
  }
  return res.json();
}

// --- Webshop admin (SUPER_ADMIN) ---
export const fetchAllShopProducts = (token: string) => request<ShopProduct[]>(token, 'GET', '/platform/shop/products');

export interface UpsertShopProductPayload {
  name?: string;
  description?: string;
  price_cents?: number;
  image_url?: string;
  sku?: string;
  stock_qty?: number;
  is_active?: boolean;
}

export const createShopProduct = (token: string, dto: UpsertShopProductPayload) =>
  request<ShopProduct>(token, 'POST', '/platform/shop/products', dto);

export const updateShopProduct = (token: string, id: string, dto: UpsertShopProductPayload) =>
  request<ShopProduct>(token, 'PATCH', `/platform/shop/products/${id}`, dto);

export const deleteShopProduct = (token: string, id: string) => request(token, 'DELETE', `/platform/shop/products/${id}`);

export const fetchShopOrders = (token: string) => request<ShopOrder[]>(token, 'GET', '/platform/shop/orders');

export const updateShopOrderStatus = (token: string, id: string, status: ShopOrder['status']) =>
  request<ShopOrder>(token, 'PATCH', `/platform/shop/orders/${id}/status`, { status });

// --- Otpremanje slika (meni artikli, webshop proizvodi) ---
async function uploadImage(token: string, path: string, file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text ? (JSON.parse(text).message ?? 'Otpremanje slike nije uspjelo.') : 'Otpremanje slike nije uspjelo.');
  }
  return res.json();
}

export const uploadMenuItemImage = (token: string, file: File) => uploadImage(token, '/menu/upload-image', file);

export const uploadShopProductImage = (token: string, file: File) => uploadImage(token, '/platform/shop/upload-image', file);
