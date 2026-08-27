'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, ListChecks, PartyPopper } from 'lucide-react';
import { clearSession, getStaffUser, getToken } from '@/lib/auth';
import { fetchActiveOrders, fetchOrderById } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { playBeep } from '@/lib/alarm';
import { Order } from '@/types/order';
import { Button } from '@/components/ui/button';
import OrderCard from './order-card';
import ItemsPanel from './items-panel';

const STATION = process.env.NEXT_PUBLIC_KDS_STATION ?? '';
const ALARM_INTERVAL_MS = 8000;

export default function BoardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [banner, setBanner] = useState<string | null>(null);
  const [itemsPanelOpen, setItemsPanelOpen] = useState(false);

  const unacknowledged = useRef<Set<string>>(new Set());
  const alarmTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopAlarmIfClear = useCallback(() => {
    if (unacknowledged.current.size === 0 && alarmTimer.current) {
      clearInterval(alarmTimer.current);
      alarmTimer.current = null;
    }
  }, []);

  const startAlarm = useCallback(() => {
    playBeep();
    if (!alarmTimer.current) {
      alarmTimer.current = setInterval(() => {
        if (unacknowledged.current.size === 0) {
          stopAlarmIfClear();
          return;
        }
        playBeep();
      }, ALARM_INTERVAL_MS);
    }
  }, [stopAlarmIfClear]);

  // Auth guard + tick za boju kartica po vremenu cekanja
  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);

    const interval = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(interval);
  }, [router]);

  // Pocetno ucitavanje + WebSocket konekcija
  useEffect(() => {
    if (!token) return;

    fetchActiveOrders(token).then(setOrders);

    const socket = getSocket();
    socket.emit('join_staff_session', { token });

    const onJoinError = () => {
      clearSession();
      router.replace('/login');
    };

    const onNewOrder = async (payload: { order_id: string; order_number?: number }) => {
      const fullOrder = await fetchOrderById(token, payload.order_id);
      if (!fullOrder) return;
      setOrders((prev) => (prev.some((o) => o.id === fullOrder.id) ? prev : [fullOrder, ...prev]));
      unacknowledged.current.add(fullOrder.id);
      startAlarm();
    };

    const onStatusChanged = (payload: { order_id: string; new_status: Order['status'] }) => {
      unacknowledged.current.delete(payload.order_id);
      stopAlarmIfClear();
      setOrders((prev) => {
        if (payload.new_status === 'served' || payload.new_status === 'cancelled') {
          return prev.filter((o) => o.id !== payload.order_id);
        }
        return prev.map((o) => (o.id === payload.order_id ? { ...o, status: payload.new_status } : o));
      });
    };

    const onCallWaiter = (payload: { table_id: string; type: 'call' | 'bill' }) => {
      setBanner(payload.type === 'bill' ? '🧾 Gost traži račun' : '🔔 Gost zove konobara');
      setTimeout(() => setBanner(null), 6000);
    };

    socket.on('join_staff_session_error', onJoinError);
    socket.on('new_order_received', onNewOrder);
    socket.on('order_status_changed', onStatusChanged);
    socket.on('call_waiter', onCallWaiter);

    return () => {
      socket.off('join_staff_session_error', onJoinError);
      socket.off('new_order_received', onNewOrder);
      socket.off('order_status_changed', onStatusChanged);
      socket.off('call_waiter', onCallWaiter);
    };
  }, [token, router, startAlarm, stopAlarmIfClear]);

  function advanceStatus(orderId: string, nextStatus: string) {
    unacknowledged.current.delete(orderId);
    stopAlarmIfClear();
    getSocket().emit('update_order_status', { order_id: orderId, status: nextStatus });
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!token) return null;

  const staffUser = getStaffUser();
  const sorted = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <main className="min-h-screen p-4 sm:p-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">KDS{STATION ? ` — ${STATION === 'bar' ? 'Šank' : 'Kuhinja'}` : ''}</h1>
          <p className="text-xs text-muted-foreground">{staffUser?.full_name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setItemsPanelOpen(true)}>
            <ListChecks className="h-4 w-4" /> Artikli
          </Button>
          <Button variant="outline" onClick={logout}>
            <LogOut className="h-4 w-4" /> Odjava
          </Button>
        </div>
      </header>

      {banner && (
        <div className="mb-4 rounded-lg bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">
          {banner}
        </div>
      )}

      {sorted.length === 0 && (
        <div className="mt-20 flex flex-col items-center gap-2 text-center text-muted-foreground">
          <PartyPopper className="h-10 w-10" />
          <p className="text-lg">Nema aktivnih narudžbi.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((order) => (
          <OrderCard key={order.id} order={order} now={now} station={STATION} onAdvanceStatus={advanceStatus} />
        ))}
      </div>

      {itemsPanelOpen && <ItemsPanel token={token} onClose={() => setItemsPanelOpen(false)} />}
    </main>
  );
}
