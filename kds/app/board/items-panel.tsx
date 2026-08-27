'use client';

import { useEffect, useState } from 'react';
import { AdminMenuCategory, fetchAdminMenu } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function localizedName(json: Record<string, string> | null | undefined): string {
  if (!json) return '';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}

/**
 * "86-ing" panel (specifikacija, modul B.3) - kuhar/sank jednim dodirom
 * oznacava artikal rasprodanim. Promjena ide preko `toggle_item_availability`
 * WS eventa (websocket-gateway -> api -> broadcast svim ekranima i gostima).
 */
export default function ItemsPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [categories, setCategories] = useState<AdminMenuCategory[]>([]);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchAdminMenu(token).then(setCategories);

    const socket = getSocket();
    const onChanged = (payload: { menu_item_id: string; is_available: boolean }) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(payload.menu_item_id);
        return next;
      });
      setCategories((prev) =>
        prev.map((cat) => ({
          ...cat,
          items: cat.items.map((item) =>
            item.id === payload.menu_item_id ? { ...item, isAvailable: payload.is_available } : item,
          ),
        })),
      );
    };
    const onError = (payload: { menu_item_id: string }) => {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(payload.menu_item_id);
        return next;
      });
    };

    socket.on('menu_item_availability_changed', onChanged);
    socket.on('toggle_item_availability_error', onError);
    return () => {
      socket.off('menu_item_availability_changed', onChanged);
      socket.off('toggle_item_availability_error', onError);
    };
  }, [token]);

  function toggle(itemId: string, current: boolean) {
    setPending((prev) => new Set(prev).add(itemId));
    getSocket().emit('toggle_item_availability', { menu_item_id: itemId, is_available: !current });
  }

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex flex-col overflow-y-auto">
        <h2 className="text-lg font-bold">Artikli (86-ing)</h2>

        {categories.map((cat) => (
          <div key={cat.id}>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{localizedName(cat.nameJson)}</h3>
            <div className="flex flex-col gap-2">
              {cat.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggle(item.id, item.isAvailable)}
                  disabled={pending.has(item.id)}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-opacity',
                    item.isAvailable ? 'bg-secondary' : 'border border-destructive/50 bg-destructive/15',
                    pending.has(item.id) && 'opacity-50',
                  )}
                >
                  <span className={item.isAvailable ? '' : 'text-muted-foreground line-through'}>
                    {localizedName(item.nameJson)}
                  </span>
                  <Badge variant={item.isAvailable ? 'success' : 'destructive'}>
                    {item.isAvailable ? 'Dostupno' : 'Rasprodano'}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        ))}
      </SheetContent>
    </Sheet>
  );
}
