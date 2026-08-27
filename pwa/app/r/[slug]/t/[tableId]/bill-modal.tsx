'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bill, fetchBill } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type SplitMode = 'equal' | 'by-item';

function formatMoney(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`;
}

/**
 * "Split the Bill" (specifikacija, modul A.5) - dvije opcije:
 *   - Podjela na jednake dijelove (ukupan iznos / broj osoba)
 *   - Podjela po stavkama (svako plaća tačno ono što je dodao u korpu -
 *     koristi `added_by` snimljen po stavci narudžbe)
 */
export default function BillModal({
  tableId,
  qrToken,
  guestId,
  currency,
  onClose,
}: {
  tableId: string;
  qrToken: string;
  guestId: string;
  currency: string;
  onClose: () => void;
}) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<SplitMode>('equal');
  const [guestCount, setGuestCount] = useState(2);

  useEffect(() => {
    fetchBill(tableId, qrToken)
      .then(setBill)
      .finally(() => setLoading(false));
  }, [tableId, qrToken]);

  const guestLabels = useMemo(() => {
    if (!bill) return new Map<string, string>();
    const labels = new Map<string, string>();
    let counter = 1;
    for (const group of bill.by_guest) {
      if (group.guest_id === guestId) {
        labels.set(group.guest_id, 'Ti');
      } else if (group.guest_id === 'unknown') {
        labels.set(group.guest_id, 'Konobar (ručni unos)');
      } else {
        counter += 1;
        labels.set(group.guest_id, `Gost ${counter}`);
      }
    }
    return labels;
  }, [bill, guestId]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Račun</DialogTitle>
        </DialogHeader>

        {loading && <p className="py-6 text-center text-sm text-muted-foreground">Učitavanje…</p>}

        {!loading && (!bill || bill.items.length === 0) && (
          <p className="py-6 text-center text-sm text-muted-foreground">Još nema poslanih narudžbi za ovaj sto.</p>
        )}

        {!loading && bill && bill.items.length > 0 && (
          <>
            <Card className="bg-muted/50">
              <CardContent className="p-3">
                <div className="mb-1 flex justify-between text-sm text-muted-foreground">
                  <span>Narudžbe #{bill.order_numbers.join(', #')}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>Ukupno</span>
                  <span>{formatMoney(bill.total, currency)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex rounded-lg border p-1">
              <button
                onClick={() => setMode('equal')}
                className={cn('flex-1 rounded-md py-2 text-sm font-medium', mode === 'equal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                Jednaki dijelovi
              </button>
              <button
                onClick={() => setMode('by-item')}
                className={cn('flex-1 rounded-md py-2 text-sm font-medium', mode === 'by-item' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                Po stavkama
              </button>
            </div>

            {mode === 'equal' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="guest-count">Broj osoba</Label>
                  <Input
                    id="guest-count"
                    type="number"
                    min={1}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))}
                    className="w-20 text-right"
                  />
                </div>
                <Card className="border-2 border-primary bg-primary/5">
                  <CardContent className="p-4 text-center">
                    <p className="text-sm text-muted-foreground">Po osobi</p>
                    <p className="text-2xl font-bold text-primary">{formatMoney(bill.total / guestCount, currency)}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {mode === 'by-item' && (
              <div className="flex flex-col gap-3">
                {bill.by_guest.map((group) => (
                  <Card key={group.guest_id}>
                    <CardContent className="p-3">
                      <div className="mb-1 flex justify-between font-semibold">
                        <span>{guestLabels.get(group.guest_id) ?? 'Gost'}</span>
                        <span>{formatMoney(group.subtotal, currency)}</span>
                      </div>
                      <ul className="text-sm text-muted-foreground">
                        {group.items.map((item, i) => (
                          <li key={i} className="flex justify-between">
                            <span>
                              {item.quantity}× {item.name}
                            </span>
                            <span>{formatMoney(item.line_total, currency)}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
                <p className="text-xs text-muted-foreground">Zasnovano na tome ko je dodao koju stavku u zajedničku korpu.</p>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
