import { Order } from '@/types/order';
import { clearSession, getRefreshToken, getToken, setTokens, StaffUser } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api';

export async function login(email: string, password: string): Promise<{ access_token: string; refresh_token: string; user: StaffUser }> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error(res.status === 401 ? 'Pogrešan email ili lozinka.' : 'Prijava trenutno nije moguća.');
  }
  return res.json();
}

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

/**
 * Istekao/nevažeći JWT (401) se ranije tiho tretirao kao "nema podataka" -
 * KDS bi ostao na praznoj tabli bez ikakvog objašnjenja umjesto da vrati
 * korisnika na prijavu. Sad prvo pokušava tiho obnoviti access token preko
 * refresh_token-a (bez prekidanja rada korisnika) - tek ako i TO ne uspije,
 * čisti sesiju i šalje na /login. Socket.io strana se i dalje sama vraca na
 * login preko `join_staff_session_error` (vidi board/page.tsx) ako refresh
 * tamo ne pomogne, ali WS ne prolazi kroz ovaj refresh mehanizam - poznato ograničenje.
 */
async function authorizedFetch(token: string, path: string, init?: RequestInit): Promise<Response> {
  const doFetch = (t: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${t}`, ...(init?.headers ?? {}) },
      cache: 'no-store',
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await doFetch(getToken() ?? token);
    }
    if (res.status === 401) {
      clearSession();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
  }

  return res;
}

/** Pocetno stanje table-a - narudzbe koje jos nisu arhivirane (posluzene/otkazane se ne prikazuju na KDS-u). */
export async function fetchActiveOrders(token: string): Promise<Order[]> {
  const statuses = ['pending', 'preparing', 'ready'];
  const results = await Promise.all(
    statuses.map((status) =>
      authorizedFetch(token, `/orders?status=${status}`).then((res) => (res.ok ? (res.json() as Promise<Order[]>) : [])),
    ),
  );
  return results.flat();
}

/** Dovlaci punu narudzbu nakon `new_order_received` push obavijesti (koja nosi samo korpu, ne i menuItem relacije). */
export async function fetchOrderById(token: string, orderId: string): Promise<Order | null> {
  const res = await authorizedFetch(token, `/orders/${orderId}`);
  return res.ok ? res.json() : null;
}

export interface AdminMenuCategory {
  id: string;
  nameJson: Record<string, string>;
  items: Array<{
    id: string;
    nameJson: Record<string, string>;
    isAvailable: boolean;
    printTarget: string;
  }>;
}

/** Koristi "Artikli" panel (86-ing) - puni meni uklj. nedostupne stavke. */
export async function fetchAdminMenu(token: string): Promise<AdminMenuCategory[]> {
  const res = await authorizedFetch(token, '/menu');
  return res.ok ? res.json() : [];
}
