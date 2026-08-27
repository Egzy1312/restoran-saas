'use client';

import { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { fetchMenu } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { AdminMenuCategory } from '@/types/menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';

function localizedName(json: Record<string, string> | null | undefined): string {
  if (!json) return '';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}

/** Rucni unos narudzbe od strane konobara (modul C.2) - za goste koji ne koriste QR kod. */
export default function ManualOrderForm({
  token,
  tableId,
  onSent,
}: {
  token: string;
  tableId: string;
  onSent: () => void;
}) {
  const [categories, setCategories] = useState<AdminMenuCategory[]>([]);
  const [draft, setDraft] = useState<Map<string, number>>(new Map());
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMenu(token).then(setCategories);
  }, [token]);

  function changeQty(itemId: string, delta: number) {
    setDraft((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId) ?? 0;
      const updated = Math.max(0, current + delta);
      if (updated === 0) next.delete(itemId);
      else next.set(itemId, updated);
      return next;
    });
  }

  function submit() {
    if (draft.size === 0) return;
    setSending(true);
    setError(null);

    const socket = getSocket();
    const items = Array.from(draft.entries()).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));

    let failed = false;
    const onError = (payload: { table_id: string; message?: string }) => {
      if (payload.table_id !== tableId) return;
      failed = true;
      setError(payload.message ?? 'Narudžba nije uspjela.');
      setSending(false);
    };
    socket.once('place_manual_order_error', onError);

    socket.emit('place_manual_order', { table_id: tableId, items, notes: notes || undefined });

    // Nema eksplicitnog ACK-a za uspjeh (isti new_order_received koji dobija i KDS) -
    // pretpostavljamo uspjeh ako se error ne desi u kratkom vremenskom prozoru.
    setTimeout(() => {
      socket.off('place_manual_order_error', onError);
      if (failed) return;
      setSending(false);
      setDraft(new Map());
      setNotes('');
      onSent();
    }, 800);
  }

  return (
    <div className="mt-3 pt-3">
      <Separator className="mb-3" />
      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Nova narudžba</h3>

      <div className="flex max-h-56 flex-col gap-3 overflow-y-auto pr-1">
        {categories.map((cat) => (
          <div key={cat.id}>
            <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{localizedName(cat.nameJson)}</p>
            <div className="flex flex-col gap-1.5">
              {cat.items
                .filter((item) => item.isAvailable)
                .map((item) => {
                  const qty = draft.get(item.id) ?? 0;
                  return (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span>{localizedName(item.nameJson)}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => changeQty(item.id, -1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-4 text-center">{qty}</span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7 rounded-full"
                          onClick={() => changeQty(item.id, 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Napomena (opciono)"
        className="mt-3"
      />

      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}

      <Button onClick={submit} disabled={draft.size === 0 || sending} className="mt-2 w-full">
        {sending ? 'Slanje…' : 'Pošalji narudžbu'}
      </Button>
    </div>
  );
}
