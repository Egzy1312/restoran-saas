'use client';

import { ShoppingBag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Order } from '@/types/order';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function localizedName(json: Record<string, string> | null | undefined): string {
  if (!json) return 'Artikal';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? 'Artikal';
}

const NEXT_STATUS: Record<Order['status'], { label: string; next: Order['status'] } | null> = {
  pending: { label: 'Počni pripremu', next: 'preparing' },
  preparing: { label: 'Spremno', next: 'ready' },
  ready: { label: 'Poslužen', next: 'served' },
  served: null,
  cancelled: null,
};

/** Boja kartice po vremenu cekanja - Zeleno < 5min, Zuto 5-15min, Crveno > 15min (specifikacija, modul B.1). */
function waitBucket(createdAt: string, now: number): 'green' | 'yellow' | 'red' {
  const minutes = (now - new Date(createdAt).getTime()) / 60000;
  if (minutes < 5) return 'green';
  if (minutes <= 15) return 'yellow';
  return 'red';
}

const BUCKET_STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'border-urgency-green-border bg-urgency-green',
  yellow: 'border-urgency-yellow-border bg-urgency-yellow',
  red: 'border-urgency-red-border bg-urgency-red animate-pulse',
};

export default function OrderCard({
  order,
  now,
  station,
  onAdvanceStatus,
}: {
  order: Order;
  now: number;
  station: string;
  onAdvanceStatus: (orderId: string, nextStatus: string) => void;
}) {
  const bucket = waitBucket(order.createdAt, now);
  const minutesAgo = Math.floor((now - new Date(order.createdAt).getTime()) / 60000);

  const visibleItems = station ? order.items.filter((i) => (i.menuItem?.printTarget ?? 'kitchen') === station) : order.items;
  if (visibleItems.length === 0) return null;

  const action = NEXT_STATUS[order.status];

  return (
    <Card className={cn('border-2', BUCKET_STYLES[bucket])}>
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between">
          <div>
            {order.orderType === 'takeaway' ? (
              <>
                <p className="flex items-center gap-1.5 text-lg font-bold">
                  <ShoppingBag className="h-5 w-5" /> Preuzimanje
                </p>
                <p className="text-xs text-muted-foreground">{order.customerName}</p>
              </>
            ) : (
              <>
                <p className="text-lg font-bold">Sto {order.table?.tableNumber ?? '—'}</p>
                <p className="text-xs text-muted-foreground">{order.table?.zoneName}</p>
              </>
            )}
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold">#{order.orderNumber}</p>
            {order.orderType === 'takeaway' && order.pickupTime ? (
              <p className="text-xs font-medium text-warning">
                preuzima {new Date(order.pickupTime).toLocaleTimeString('bs-BA', { hour: '2-digit', minute: '2-digit' })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{minutesAgo <= 0 ? 'upravo' : `prije ${minutesAgo} min`}</p>
            )}
          </div>
        </div>

        <ul className="flex flex-col gap-1.5">
          {visibleItems.map((item) => (
            <li key={item.id} className="text-base">
              <span className="font-semibold">{item.quantity}×</span> {localizedName(item.menuItem?.nameJson)}
              {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                <span className="ml-5 block text-sm text-muted-foreground">
                  {item.selectedModifiers.map((m) => m.name).join(', ')}
                </span>
              )}
              {item.itemNotes && <span className="ml-5 block text-sm text-warning">** {item.itemNotes}</span>}
            </li>
          ))}
        </ul>

        {order.notes && <p className="text-sm italic text-warning">Napomena: {order.notes}</p>}

        {action && (
          <Button size="lg" className="text-base" onClick={() => onAdvanceStatus(order.id, action.next)}>
            {action.label}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
