'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Bell, Check, X, ClipboardList } from 'lucide-react';
import { clearSession, getStaffUser, getToken } from '@/lib/auth';
import { fetchActiveOrders, fetchTables } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { RestaurantTable } from '@/types/table';
import { Order } from '@/types/order';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import TableTile, { ComputedStatus } from './table-tile';
import TableDetail from './table-detail';

const CALL_ALERT_TTL_MS = 3 * 60 * 1000; // 3 min - konobar je vjerovatno vec reagovao nakon toga

function computeStatus(table: RestaurantTable, orders: Order[]): ComputedStatus {
  if (table.status === 'bill_requested') return 'bill_requested';
  if (table.status === 'reserved') return 'reserved';
  if (table.status === 'free') return 'free';

  const tableOrders = orders.filter((o) => o.tableId === table.id);
  const waitingFood = tableOrders.some((o) => o.status === 'pending_approval' || o.status === 'pending' || o.status === 'preparing');
  return waitingFood ? 'waiting_food' : 'served';
}

export default function FloorPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [callAlerts, setCallAlerts] = useState<Map<string, { type: 'call' | 'bill'; at: number }>>(new Map());
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth guard
  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  // Povremeno cisti stare alarme (gost je pozvao prije >3min, vjerovatno vec opsluzen)
  useEffect(() => {
    const interval = setInterval(() => {
      setCallAlerts((prev) => {
        const cutoff = Date.now() - CALL_ALERT_TTL_MS;
        const next = new Map([...prev].filter(([, v]) => v.at > cutoff));
        return next.size === prev.size ? prev : next;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!token) return;

    fetchTables(token).then(setTables);
    fetchActiveOrders(token).then(setOrders);

    const socket = getSocket();
    socket.emit('join_staff_session', { token });

    const onJoinError = () => {
      clearSession();
      router.replace('/login');
    };

    const onTableStatusChanged = (payload: { table_id: string; status: RestaurantTable['status'] }) => {
      setTables((prev) => prev.map((t) => (t.id === payload.table_id ? { ...t, status: payload.status } : t)));
      if (payload.status === 'free') {
        setCallAlerts((prev) => {
          if (!prev.has(payload.table_id)) return prev;
          const next = new Map(prev);
          next.delete(payload.table_id);
          return next;
        });
      }
    };

    const onNewOrderOrStatusChanged = () => {
      fetchActiveOrders(token).then(setOrders);
    };

    const onCallWaiter = (payload: { table_id: string; type: 'call' | 'bill' }) => {
      setCallAlerts((prev) => new Map(prev).set(payload.table_id, { type: payload.type, at: Date.now() }));
      const table = tables.find((t) => t.id === payload.table_id);
      setBanner(
        `${payload.type === 'bill' ? '🧾 Traži račun' : '🔔 Zove konobara'} — sto ${table?.tableNumber ?? ''}`,
      );
      if (bannerTimeout.current) clearTimeout(bannerTimeout.current);
      bannerTimeout.current = setTimeout(() => setBanner(null), 6000);
    };

    socket.on('join_staff_session_error', onJoinError);
    socket.on('table_status_changed', onTableStatusChanged);
    socket.on('new_order_received', onNewOrderOrStatusChanged);
    socket.on('order_status_changed', onNewOrderOrStatusChanged);
    socket.on('order_pending_approval', onNewOrderOrStatusChanged);
    socket.on('call_waiter', onCallWaiter);

    return () => {
      socket.off('join_staff_session_error', onJoinError);
      socket.off('table_status_changed', onTableStatusChanged);
      socket.off('new_order_received', onNewOrderOrStatusChanged);
      socket.off('order_status_changed', onNewOrderOrStatusChanged);
      socket.off('order_pending_approval', onNewOrderOrStatusChanged);
      socket.off('call_waiter', onCallWaiter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, router]);

  function openTable(tableId: string) {
    setSelectedTableId(tableId);
    setCallAlerts((prev) => {
      if (!prev.has(tableId)) return prev;
      const next = new Map(prev);
      next.delete(tableId);
      return next;
    });
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!token) return null;

  const staffUser = getStaffUser();
  const zones = Array.from(new Set(tables.map((t) => t.zoneName))).sort();
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedOrders = selectedTable ? orders.filter((o) => o.tableId === selectedTable.id) : [];
  const pendingApproval = orders.filter((o) => o.status === 'pending_approval');

  function approveOrder(orderId: string) {
    getSocket().emit('approve_order', { order_id: orderId });
  }
  function rejectOrder(orderId: string) {
    if (!confirm('Odbiti ovu narudžbu? Neće ići u kuhinju.')) return;
    getSocket().emit('reject_order', { order_id: orderId });
  }

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">Tlocrt restorana</h1>
            <p className="text-xs text-muted-foreground">{staffUser?.full_name}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" /> Odjava
        </Button>
      </header>

      {banner && (
        <div className="mb-4 rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">
          {banner}
        </div>
      )}

      {pendingApproval.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2">
            <span className="rounded-full bg-warning px-2.5 py-1 text-sm font-semibold text-warning-foreground">
              🔔 Za odobrenje ({pendingApproval.length})
            </span>
          </h2>
          <div className="flex flex-col gap-2">
            {pendingApproval.map((order) => {
              const table = tables.find((t) => t.id === order.tableId);
              return (
                <Card key={order.id} className="border-2 border-warning bg-warning/10">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div>
                      <p className="font-semibold">
                        Sto {table?.tableNumber ?? '—'} <span className="text-sm font-normal text-muted-foreground">· #{order.orderNumber}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {order.items.map((i) => `${i.quantity}× ${i.menuItem?.nameJson.bs ?? i.menuItem?.nameJson.en ?? ''}`).join(', ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => rejectOrder(order.id)}>
                        <X className="h-4 w-4 text-destructive" /> Odbij
                      </Button>
                      <Button size="sm" onClick={() => approveOrder(order.id)}>
                        <Check className="h-4 w-4" /> Odobri
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {tables.length === 0 && <p className="mt-16 text-center text-muted-foreground">Nema definisanih stolova.</p>}

      {zones.map((zone) => (
        <section key={zone} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{zone}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {tables
              .filter((t) => t.zoneName === zone)
              .map((table) => (
                <TableTile
                  key={table.id}
                  table={table}
                  status={computeStatus(table, orders)}
                  isCalling={callAlerts.has(table.id)}
                  onClick={() => openTable(table.id)}
                />
              ))}
          </div>
        </section>
      ))}

      {selectedTable && (
        <TableDetail
          table={selectedTable}
          orders={selectedOrders}
          token={token}
          onClose={() => setSelectedTableId(null)}
        />
      )}
    </main>
  );
}
