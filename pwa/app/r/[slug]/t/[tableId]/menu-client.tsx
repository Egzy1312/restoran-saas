'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Bell, Receipt, Minus, Plus, ShoppingBag, UtensilsCrossed } from 'lucide-react';
import { fetchPublicMenu, resolveTableToken, ResolvedTable } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { getGuestId } from '@/lib/guest-id';
import { localize, useLocale } from '@/lib/locale';
import { getGeoLocation } from '@/lib/geo';
import { CartState } from '@/types/cart';
import { MenuItem, PublicMenuResponse } from '@/types/menu';
import BillModal from './bill-modal';
import LanguageSwitcher from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

function formatMoney(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`;
}

function categoryAnchor(id: string) {
  return `category-${id}`;
}

const EMPTY_CART: CartState = { items: [], total: 0 };

export default function MenuClient({ slug, tableToken }: { slug: string; tableToken: string }) {
  const [table, setTable] = useState<ResolvedTable | null>(null);
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [status, setStatus] = useState<'loading' | 'ready' | 'invalid-qr' | 'error'>('loading');
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const guestId = useMemo(() => getGuestId(), []);
  const [locale, setLocale] = useLocale();

  // 1) Razrijesi QR token -> table_id, ucitaj javni meni
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const resolved = await resolveTableToken(tableToken);
      if (cancelled) return;

      if (!resolved.valid) {
        setStatus('invalid-qr');
        return;
      }
      if (resolved.restaurant_slug !== slug) {
        setStatus('invalid-qr');
        return;
      }

      setTable(resolved);

      try {
        const publicMenu = await fetchPublicMenu(slug);
        if (cancelled) return;
        setMenu(publicMenu);
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug, tableToken]);

  // 2) Konekcija na WebSocket Gateway i pridruzivanje sesiji stola
  useEffect(() => {
    if (!table) return;

    const socket = getSocket();
    let cancelled = false;

    getGeoLocation().then((position) => {
      if (cancelled) return;
      socket.emit('join_table_session', {
        table_id: table.table_id,
        qr_token: table.qr_token,
        guest_id: guestId,
        ...(position ?? {}),
      });
    });

    const onCartUpdated = (payload: CartState) => setCart(payload);
    const onJoinError = (payload: { message: string }) => toast.error(payload.message);
    const onPlaceOrderError = (payload: { message: string }) => toast.error(payload.message);
    const onOrderPlaced = (payload: { order_number?: number }) => {
      toast.success(payload.order_number ? `Narudžba #${payload.order_number} je poslana u kuhinju/šank!` : 'Narudžba je poslana!');
      setCartOpen(false);
    };
    const onOrderStatusChanged = (payload: { order_number: number; new_status: string }) => {
      const labels: Record<string, string> = {
        preparing: `👨‍🍳 Narudžba #${payload.order_number} je u pripremi`,
        ready: `🍽️ Narudžba #${payload.order_number} je spremna!`,
        served: `✅ Narudžba #${payload.order_number} poslužena`,
      };
      const message = labels[payload.new_status];
      if (message) toast.info(message, { duration: 6000 });
    };
    const onAvailabilityChanged = (payload: { menu_item_id: string; is_available: boolean }) => {
      if (payload.is_available) {
        fetchPublicMenu(slug).then(setMenu).catch(() => undefined);
        return;
      }
      setMenu((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          categories: prev.categories.map((cat) => ({
            ...cat,
            items: cat.items.filter((item) => item.id !== payload.menu_item_id),
          })),
        };
      });
    };

    socket.on('cart_updated', onCartUpdated);
    socket.on('join_table_session_error', onJoinError);
    socket.on('place_order_error', onPlaceOrderError);
    socket.on('order_placed', onOrderPlaced);
    socket.on('menu_item_availability_changed', onAvailabilityChanged);
    socket.on('order_status_changed', onOrderStatusChanged);

    return () => {
      cancelled = true;
      socket.off('cart_updated', onCartUpdated);
      socket.off('join_table_session_error', onJoinError);
      socket.off('place_order_error', onPlaceOrderError);
      socket.off('order_placed', onOrderPlaced);
      socket.off('menu_item_availability_changed', onAvailabilityChanged);
      socket.off('order_status_changed', onOrderStatusChanged);
    };
  }, [table, guestId]);

  const addToCart = useCallback(
    (item: MenuItem, selectedModifierIds: string[]) => {
      if (!table) return;
      const socket = getSocket();
      const selectedModifiers = item.modifiers
        .filter((m) => selectedModifierIds.includes(m.id))
        .map((m) => ({ id: m.id, name: localize(m.nameJson, locale), price: Number(m.price) }));

      socket.emit('add_cart_item', {
        table_id: table.table_id,
        guest_id: guestId,
        menu_item_id: item.id,
        name: localize(item.nameJson, locale),
        unit_price: Number(item.price),
        quantity: 1,
        selected_modifiers: selectedModifiers,
      });
      setExpandedItem(null);
      toast.success(`Dodano: ${localize(item.nameJson, locale)}`);
    },
    [table, guestId, locale],
  );

  const updateQuantity = useCallback(
    (cartItemId: string, quantity: number) => {
      if (!table) return;
      getSocket().emit('update_cart_item', { table_id: table.table_id, guest_id: guestId, cart_item_id: cartItemId, quantity });
    },
    [table, guestId],
  );

  const placeOrder = useCallback(() => {
    if (!table || cart.items.length === 0) return;
    getSocket().emit('place_order', { table_id: table.table_id });
  }, [table, cart.items.length]);

  const callWaiter = useCallback(
    (type: 'call' | 'bill') => {
      if (!table) return;
      getSocket().emit('call_waiter', { table_id: table.table_id, guest_id: guestId, type });
      toast(type === 'call' ? 'Pozvali ste konobara.' : 'Zatražili ste račun.');
      if (type === 'bill') setBillOpen(true);
    },
    [table, guestId],
  );

  if (status === 'loading') {
    return <CenteredMessage title="Učitavanje menija…" />;
  }
  if (status === 'invalid-qr') {
    return <CenteredMessage title="Nevažeći QR kod" body="Skenirajte QR kod ponovo ili pozovite konobara." />;
  }
  if (status === 'error' || !menu || !table) {
    return <CenteredMessage title="Greška" body="Meni trenutno nije dostupan. Pokušajte ponovo za koji trenutak." />;
  }

  const currency = menu.restaurant.currency;
  const cartCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <main className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold">{menu.restaurant.name}</h1>
            <p className="text-sm text-muted-foreground">
              Sto {table.table_number} {table.zone_name ? `· ${table.zone_name}` : ''}
            </p>
          </div>
          <LanguageSwitcher locale={locale} onChange={setLocale} />
        </div>
        <div className="mt-2.5 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={() => callWaiter('call')}>
            <Bell className="h-3.5 w-3.5" /> Pozovi konobara
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => callWaiter('bill')}>
            <Receipt className="h-3.5 w-3.5" /> Zatraži račun
          </Button>
        </div>

        {menu.categories.length > 1 && (
          <div className="scrollbar-none -mx-4 mt-2.5 flex gap-1.5 overflow-x-auto px-4">
            {menu.categories.map((category) => (
              <button
                key={category.id}
                onClick={() =>
                  document.getElementById(categoryAnchor(category.id))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="shrink-0 whitespace-nowrap rounded-full border border-input px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent"
              >
                {localize(category.nameJson, locale)}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="px-4">
        {menu.categories.map((category) => (
          <section key={category.id} id={categoryAnchor(category.id)} className="scroll-mt-32 mt-6">
            <h2 className="mb-2 text-base font-semibold">{localize(category.nameJson, locale)}</h2>
            <div className="flex flex-col gap-2.5">
              {category.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  currency={currency}
                  locale={locale}
                  expanded={expandedItem === item.id}
                  onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                  onAdd={(modifierIds) => addToCart(item, modifierIds)}
                />
              ))}
              {category.items.length === 0 && (
                <p className="text-sm text-muted-foreground">Trenutno nema dostupnih artikala u ovoj kategoriji.</p>
              )}
            </div>
          </section>
        ))}
      </div>

      {cartCount > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-lg"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag className="h-4 w-4" /> {cartCount} {cartCount === 1 ? 'stavka' : 'stavke'}
          </span>
          <span className="font-bold">{formatMoney(cart.total, currency)}</span>
        </button>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="flex max-h-[80vh] flex-col rounded-t-2xl p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Vaša korpa</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2">
            {cart.items.length === 0 && <p className="py-4 text-sm text-muted-foreground">Korpa je prazna.</p>}
            {cart.items.map((item) => (
              <div key={item.cart_item_id} className="flex items-center justify-between border-b py-2.5">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  {item.selected_modifiers.length > 0 && (
                    <p className="text-xs text-muted-foreground">{item.selected_modifiers.map((m) => m.name).join(', ')}</p>
                  )}
                  {item.item_notes && <p className="text-xs italic text-muted-foreground">„{item.item_notes}"</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.cart_item_id, item.quantity - 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-input text-muted-foreground"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-5 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.cart_item_id, item.quantity + 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-input text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t p-4">
            <div className="mb-3 flex justify-between font-semibold">
              <span>Ukupno</span>
              <span>{formatMoney(cart.total, currency)}</span>
            </div>
            <Button size="lg" className="w-full" disabled={cart.items.length === 0} onClick={placeOrder}>
              Pošalji narudžbu
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {billOpen && (
        <BillModal tableId={table.table_id} qrToken={table.qr_token} guestId={guestId} currency={currency} onClose={() => setBillOpen(false)} />
      )}
    </main>
  );
}

function CenteredMessage({ title, body }: { title: string; body?: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      {body && <p className="max-w-sm text-muted-foreground">{body}</p>}
    </main>
  );
}

function ItemCard({
  item,
  currency,
  locale,
  expanded,
  onToggle,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  locale: string;
  expanded: boolean;
  onToggle: () => void;
  onAdd: (selectedModifierIds: string[]) => void;
}) {
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);

  const toggleModifier = (id: string) => {
    setSelectedModifiers((prev) => (prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]));
  };

  return (
    <Card className="overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-start gap-3 p-3 text-left">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary/60">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <UtensilsCrossed className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium">{localize(item.nameJson, locale)}</p>
            <span className="shrink-0 whitespace-nowrap font-semibold text-primary">{formatMoney(Number(item.price), currency)}</span>
          </div>
          {item.descriptionJson && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{localize(item.descriptionJson, locale)}</p>}
          {item.allergens.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Alergeni: {item.allergens.join(', ')}</p>}
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/40 p-3">
          {item.modifiers.length > 0 && (
            <div className="mb-3 flex flex-col gap-1.5">
              {item.modifiers.map((mod) => (
                <label
                  key={mod.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                    selectedModifiers.includes(mod.id) ? 'border-primary bg-primary/5' : 'border-input',
                  )}
                >
                  <input type="checkbox" checked={selectedModifiers.includes(mod.id)} onChange={() => toggleModifier(mod.id)} />
                  {localize(mod.nameJson, locale)} (+{formatMoney(Number(mod.price), currency)})
                </label>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={() => onAdd(selectedModifiers)}>
            Dodaj u korpu
          </Button>
        </div>
      )}
    </Card>
  );
}
