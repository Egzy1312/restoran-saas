'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, LogOut } from 'lucide-react';
import { clearSession, getStaffUser, getToken } from '@/lib/auth';
import {
  activateRestaurant,
  fetchPlatformAuditLog,
  fetchPlatformRestaurants,
  fetchPlatformStats,
  PlatformAuditLogEntry,
  PlatformRestaurant,
  PlatformStats,
  suspendRestaurant,
} from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ACTION_LABEL: Record<string, string> = {
  suspend_restaurant: 'Suspendovan',
  activate_restaurant: 'Reaktiviran',
};

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'destructive'> = {
  trialing: 'secondary',
  active: 'success',
  past_due: 'destructive',
  cancelled: 'destructive',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('bs-BA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('bs-BA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function PlatformPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [restaurants, setRestaurants] = useState<PlatformRestaurant[]>([]);
  const [auditLog, setAuditLog] = useState<PlatformAuditLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    const user = getStaffUser();
    if (!t || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
      return;
    }
    setToken(t);
  }, [router]);

  function reload(t: string) {
    Promise.all([fetchPlatformStats(t), fetchPlatformRestaurants(t), fetchPlatformAuditLog(t)])
      .then(([s, r, log]) => {
        setStats(s);
        setRestaurants(r);
        setAuditLog(log);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Greška pri učitavanju.'));
  }

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  async function toggleActive(r: PlatformRestaurant) {
    if (!token) return;
    setBusyId(r.id);
    setError(null);
    try {
      if (r.is_active) await suspendRestaurant(token, r.id);
      else await activateRestaurant(token, r.id);
      reload(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Akcija nije uspjela.');
    } finally {
      setBusyId(null);
    }
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-4 w-4" />
          </div>
          <span className="font-bold">Platforma — Super Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform/shop-products">Webshop proizvodi</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform/shop-orders">Webshop narudžbe</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4" /> Odjava
          </Button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Restorani" value={stats.restaurant_count} />
            <StatCard label="Aktivne pretplate" value={stats.active_subscriptions} />
            <StatCard label="Na probnom periodu" value={stats.trialing_count} />
            <StatCard label="Narudžbe (24h)" value={stats.orders_last_24h} />
          </div>
        )}

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Restoran</TableHead>
                <TableHead>Pretplata</TableHead>
                <TableHead className="hidden sm:table-cell">Registrovan</TableHead>
                <TableHead className="hidden sm:table-cell">Narudžbe</TableHead>
                <TableHead className="hidden sm:table-cell">Osoblje</TableHead>
                <TableHead className="hidden sm:table-cell">Stolovi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {restaurants.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.slug}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.subscription_status] ?? 'secondary'}>{r.subscription_status}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDate(r.created_at)}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.order_count}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.staff_count}</TableCell>
                  <TableCell className="hidden sm:table-cell">{r.table_count}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'success' : 'destructive'}>{r.is_active ? 'Aktivan' : 'Suspendovan'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.id}
                      onClick={() => toggleActive(r)}
                      className={r.is_active ? 'text-destructive hover:text-destructive' : 'text-success hover:text-success'}
                    >
                      {r.is_active ? 'Suspenduj' : 'Reaktiviraj'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {restaurants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    Nema registrovanih restorana.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card>
          <div className="px-5 pt-5">
            <h2 className="font-semibold">Audit log</h2>
            <p className="text-sm text-muted-foreground">Suspenzije/reaktivacije - ko, šta i kada.</p>
          </div>
          <Table className="mt-2">
            <TableHeader>
              <TableRow>
                <TableHead>Kad</TableHead>
                <TableHead>Ko</TableHead>
                <TableHead>Akcija</TableHead>
                <TableHead>Restoran</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditLog.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">{formatDateTime(entry.created_at)}</TableCell>
                  <TableCell>{entry.actor_email}</TableCell>
                  <TableCell>{ACTION_LABEL[entry.action] ?? entry.action}</TableCell>
                  <TableCell>{entry.target_restaurant_name ?? '—'}</TableCell>
                </TableRow>
              ))}
              {auditLog.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nema zabilježenih akcija.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
