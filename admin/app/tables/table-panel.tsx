'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { RestaurantTable } from '@/types/table';
import { deleteTable, updateTable } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

const GUEST_PWA_URL = process.env.NEXT_PUBLIC_GUEST_PWA_URL ?? 'http://localhost:3002';

export default function TablePanel({
  table,
  restaurantSlug,
  token,
  onClose,
  onChanged,
}: {
  table: RestaurantTable;
  restaurantSlug: string;
  token: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const guestUrl = `${GUEST_PWA_URL}/r/${restaurantSlug}/t/${table.qrCodeToken}`;

  useEffect(() => {
    QRCode.toDataURL(guestUrl, { width: 220, margin: 1 }).then(setQrDataUrl);
  }, [guestUrl]);

  async function handleZoneCapacityChange(field: 'zone_name' | 'capacity', value: string | number) {
    await updateTable(token, table.id, { [field]: value });
    onChanged();
  }

  async function handleDelete() {
    if (!confirm(`Obrisati sto ${table.tableNumber}?`)) return;
    await deleteTable(token, table.id);
    onChanged();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Sto {table.tableNumber}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={`QR kod za sto ${table.tableNumber}`} className="rounded-lg border p-1" />
          )}
          <p className="break-all text-center text-xs text-muted-foreground">{guestUrl}</p>

          <div className="grid w-full grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Zona</Label>
              <Input
                defaultValue={table.zoneName}
                onBlur={(e) => handleZoneCapacityChange('zone_name', e.target.value)}
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Kapacitet</Label>
              <Input
                type="number"
                min={1}
                defaultValue={table.capacity}
                onBlur={(e) => handleZoneCapacityChange('capacity', Number(e.target.value))}
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          <Button variant="outline" onClick={handleDelete} className="w-full text-destructive hover:text-destructive">
            Obriši sto
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
