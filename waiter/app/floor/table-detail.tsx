'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { RestaurantTable } from '@/types/table';
import { Order } from '@/types/order';
import { getSocket } from '@/lib/socket';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ManualOrderForm from './manual-order-form';

function localizedName(json: Record<string, string> | null | undefined): string {
  if (!json) return 'Artikal';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? 'Artikal';
}

const STATUS_LABEL: Record<Order['status'], string> = {
  pending_approval: 'Čeka odobrenje',
  pending: 'Primljeno',
  preparing: 'U pripremi',
  ready: 'Spremno',
  served: 'Posluženo',
  cancelled: 'Otkazano',
};

const STATUS_VARIANT: Record<Order['status'], 'secondary' | 'warning' | 'success' | 'destructive'> = {
  pending_approval: 'warning',
  pending: 'secondary',
  preparing: 'warning',
  ready: 'success',
  served: 'success',
  cancelled: 'destructive',
};

export default function TableDetail({
  table,
  orders,
  token,
  onClose,
}: {
  table: RestaurantTable;
  orders: Order[];
  token: string;
  onClose: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const hasActiveOrders = orders.some((o) => o.status === 'pending' || o.status === 'preparing');

  function closeTable() {
    if (hasActiveOrders && !confirm('Sto ima neposluženih narudžbi. Ipak zatvoriti sto?')) return;
    getSocket().emit('close_table', { table_id: table.id });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sto {table.tableNumber}</DialogTitle>
          <DialogDescription>
            {table.zoneName} · {table.capacity} osoba
          </DialogDescription>
        </DialogHeader>

        {orders.length === 0 && <p className="text-sm text-muted-foreground">Nema aktivnih narudžbi za ovaj sto.</p>}

        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardContent className="p-3">
                <div className="mb-1 flex items-center justify-between text-sm font-semibold">
                  <span>Narudžba #{order.orderNumber}</span>
                  <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                </div>
                <ul className="text-sm text-muted-foreground">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      {item.quantity}× {localizedName(item.menuItem?.nameJson)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {showForm ? (
          <ManualOrderForm token={token} tableId={table.id} onSent={() => setShowForm(false)} />
        ) : (
          <Button variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Nova narudžba
          </Button>
        )}

        <Button variant="secondary" onClick={closeTable}>
          Zatvori sto (naplaćeno)
        </Button>
      </DialogContent>
    </Dialog>
  );
}
