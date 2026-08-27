'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, LogOut, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { clearSession, getStaffUser, getToken } from '@/lib/auth';
import { fetchShopOrders, ShopOrder, updateShopOrderStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';

const STATUS_OPTIONS: ShopOrder['status'][] = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];

const STATUS_VARIANT: Record<ShopOrder['status'], 'secondary' | 'success' | 'destructive'> = {
  pending: 'secondary',
  paid: 'success',
  shipped: 'success',
  delivered: 'success',
  cancelled: 'destructive',
};

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('bs-BA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ShopOrdersAdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);

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

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  function reload(t: string) {
    fetchShopOrders(t).then(setOrders);
  }

  async function onStatusChange(id: string, status: ShopOrder['status']) {
    if (!token) return;
    try {
      await updateShopOrderStatus(token, id, status);
      reload(token);
      toast.success('Status ažuriran.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška.');
    }
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-4 w-4" />
          </div>
          <span className="font-bold">Platforma — Webshop narudžbe</span>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" /> Odjava
        </Button>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <Link href="/platform" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Nazad na Platformu
        </Link>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kupac</TableHead>
                <TableHead className="hidden sm:table-cell">Kad</TableHead>
                <TableHead>Stavke</TableHead>
                <TableHead>Ukupno</TableHead>
                <TableHead>Plaćanje</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <div className="font-medium">{order.customerName}</div>
                    <div className="text-xs text-muted-foreground">{order.customerEmail}</div>
                    <div className="text-xs text-muted-foreground">{order.shippingAddress}</div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">{formatDateTime(order.createdAt)}</TableCell>
                  <TableCell className="text-xs">
                    {order.items.map((i) => (
                      <div key={i.id}>
                        {i.quantity}× {i.productName}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell className="font-medium">{formatPrice(order.totalCents, order.currency)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="w-fit">
                      {order.paymentMethod === 'card' ? 'Kartica' : 'Pouzeće'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={STATUS_VARIANT[order.status]} className="w-fit">
                        {order.status}
                      </Badge>
                      <select
                        value={order.status}
                        onChange={(e) => onStatusChange(order.id, e.target.value as ShopOrder['status'])}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nema narudžbi.
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
