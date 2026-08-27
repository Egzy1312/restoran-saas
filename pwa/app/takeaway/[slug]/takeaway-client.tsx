'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Minus, Plus, ShoppingBag, Clock } from 'lucide-react';
import { createTakeawayOrder, EarliestPickup, fetchEarliestPickup, fetchPublicMenu } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { localize, useLocale } from '@/lib/locale';
import { PublicMenuResponse } from '@/types/menu';
import LanguageSwitcher from '@/components/language-switcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '📋 Primljena, čeka pripremu', className: 'text-muted-foreground bg-muted' },
  preparing: { label: '👨‍🍳 U pripremi', className: 'text-amber-700 bg-amber-100' },
  ready: { label: '✅ Spremno za preuzimanje!', className: 'text-success bg-success/10' },
  served: { label: '🛍️ Preuzeto', className: 'text-muted-foreground bg-muted' },
};

function formatMoney(amount: number, currency: string) {
  return `${amount.toFixed(2)} ${currency}`;
}

function toLocalInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const FALLBACK_LEAD_MINUTES = 15;

type Step = 'menu' | 'checkout' | 'done';

/** Takeaway/Pickup (specifikacija, modul D.3) - naruči od kuće, preuzmi u restoranu u odabrano vrijeme. */
export default function TakeawayClient({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [error, setError] = useState(false);
  const [draft, setDraft] = useState<Map<string, number>>(new Map());
  const [step, setStep] = useState<Step>('menu');
  const [locale, setLocale] = useLocale();

  const [earliest, setEarliest] = useState<EarliestPickup | null>(null);
  const [pickupTime, setPickupTime] = useState(() => toLocalInputValue(new Date(Date.now() + FALLBACK_LEAD_MINUTES * 60 * 1000)));
  const [pickupTouched, setPickupTouched] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>('pending');
  const [paymentRedirect, setPaymentRedirect] = useState<'success' | 'cancelled' | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const payment = searchParams.get('payment');
    const paidOrderId = searchParams.get('order_id');
    if (payment === 'success' && paidOrderId) {
      setPaymentRedirect('success');
      setOrderId(paidOrderId);
      setStep('done');
    } else if (payment === 'cancelled') {
      setPaymentRedirect('cancelled');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!orderId) return;
    const socket = getSocket();
    socket.emit('track_order', { order_id: orderId });

    const onStatusChanged = (payload: { order_id: string; new_status: string }) => {
      if (payload.order_id === orderId) setOrderStatus(payload.new_status);
    };
    socket.on('order_status_changed', onStatusChanged);
    return () => {
      socket.off('order_status_changed', onStatusChanged);
    };
  }, [orderId]);

  useEffect(() => {
    fetchPublicMenu(slug)
      .then(setMenu)
      .catch(() => setError(true));
  }, [slug]);

  useEffect(() => {
    fetchEarliestPickup(slug).then((result) => {
      if (!result) return;
      setEarliest(result);
      setPickupTime((prev) => (pickupTouched ? prev : toLocalInputValue(new Date(result.earliest_pickup_time))));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const allItems = useMemo(() => menu?.categories.flatMap((c) => c.items) ?? [], [menu]);

  const cartLines = useMemo(
    () =>
      Array.from(draft.entries())
        .map(([itemId, quantity]) => {
          const item = allItems.find((i) => i.id === itemId);
          if (!item) return null;
          return { item, quantity, lineTotal: Number(item.price) * quantity };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null),
    [draft, allItems],
  );
  const total = cartLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = cartLines.reduce((sum, l) => sum + l.quantity, 0);

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

  async function submit() {
    if (!menu) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await createTakeawayOrder(slug, {
      items: cartLines.map((l) => ({ menu_item_id: l.item.id, quantity: l.quantity })),
      pickup_time: new Date(pickupTime).toISOString(),
      customer_name: name,
      customer_phone: phone,
      payment_method: paymentMethod,
      notes: notes || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error ?? 'Narudžba nije uspjela.');
      return;
    }
    setOrderNumber(result.order_number ?? null);
    setOrderId(result.order_id ?? null);

    if (result.payment_url) {
      window.location.href = result.payment_url;
      return;
    }

    setStep('done');
  }

  if (error) return <p className="p-5 text-center text-muted-foreground">Meni trenutno nije dostupan.</p>;
  if (!menu) return <p className="p-5 text-center text-muted-foreground">Učitavanje…</p>;

  const currency = menu.restaurant.currency;

  if (step === 'done') {
    const statusInfo = STATUS_LABEL[orderStatus] ?? STATUS_LABEL.pending;
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <Card className="max-w-sm border-success/30 bg-success/5">
          <CardContent className="p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-success" />
            <p className="text-lg font-semibold">
              {paymentRedirect === 'success' ? 'Plaćanje uspješno!' : orderNumber ? `Narudžba #${orderNumber} primljena!` : 'Narudžba primljena!'}
            </p>
            {paymentRedirect !== 'success' && (
              <p className="mt-2 text-sm text-muted-foreground">
                Preuzimanje: {new Date(pickupTime).toLocaleString('bs-BA', { dateStyle: 'medium', timeStyle: 'short' })}
                <br />
                Plaćanje: {paymentMethod === 'cash' ? 'gotovina pri preuzimanju' : 'kartica pri preuzimanju'}
              </p>
            )}

            <div className={cn('mt-4 rounded-lg px-4 py-2.5 font-medium', statusInfo.className)}>{statusInfo.label}</div>
            <p className="mt-2 text-xs text-muted-foreground">Status se osvježava uživo, ne treba osvježavati stranicu.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (step === 'checkout') {
    return (
      <main className="mx-auto min-h-screen max-w-md p-5">
        <h1 className="mb-4 text-lg font-bold">Podaci za preuzimanje</h1>

        <Card className="mb-4 bg-muted/50">
          <CardContent className="p-3">
            {cartLines.map((l) => (
              <div key={l.item.id} className="flex justify-between py-0.5 text-sm">
                <span>
                  {l.quantity}× {localize(l.item.nameJson, locale)}
                </span>
                <span>{formatMoney(l.lineTotal, currency)}</span>
              </div>
            ))}
            <div className="mt-2 flex justify-between border-t pt-2 font-bold">
              <span>Ukupno</span>
              <span>{formatMoney(total, currency)}</span>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <div>
            <Label>Vrijeme preuzimanja</Label>
            <Input
              type="datetime-local"
              value={pickupTime}
              min={earliest ? toLocalInputValue(new Date(earliest.earliest_pickup_time)) : undefined}
              onChange={(e) => {
                setPickupTouched(true);
                setPickupTime(e.target.value);
              }}
              className="mt-1"
            />
          </div>
          {earliest && earliest.active_orders > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <Clock className="h-3.5 w-3.5 shrink-0" /> Kuhinja trenutno ima {earliest.active_orders}{' '}
              {earliest.active_orders === 1 ? 'aktivnu narudžbu' : 'aktivnih narudžbi'} — najraniji termin je podignut na ~{earliest.lead_minutes} min.
            </p>
          )}
          <div>
            <Label>Ime i prezime</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label className="mb-1.5 block">Plaćanje</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setPaymentMethod('cash')}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm',
                  paymentMethod === 'cash' ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-input text-muted-foreground',
                )}
              >
                Gotovina pri preuzimanju
              </button>
              <button
                onClick={() => setPaymentMethod('card')}
                className={cn(
                  'flex-1 rounded-lg border py-2 text-sm',
                  paymentMethod === 'card' ? 'border-primary bg-primary/5 font-medium text-primary' : 'border-input text-muted-foreground',
                )}
              >
                Kartica pri preuzimanju
              </button>
            </div>
          </div>

          <div>
            <Label>Napomena (opciono)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>

          {submitError && <p className="text-sm text-destructive">{submitError}</p>}

          <Button size="lg" disabled={submitting || !name || !phone} onClick={submit}>
            {submitting ? 'Slanje…' : `Naruči — ${formatMoney(total, currency)}`}
          </Button>
          <button onClick={() => setStep('menu')} className="text-sm text-muted-foreground">
            ← Nazad na meni
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-bold">{menu.restaurant.name}</h1>
            <p className="text-sm text-muted-foreground">Naručivanje za preuzimanje</p>
          </div>
          <LanguageSwitcher locale={locale} onChange={setLocale} />
        </div>
      </header>

      {paymentRedirect === 'cancelled' && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Plaćanje je otkazano. Vaša narudžba nije poslana - naručite ponovo ili izaberite gotovinu pri preuzimanju.
        </div>
      )}

      <div className="px-4">
        {menu.categories.map((cat) => (
          <section key={cat.id} className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{localize(cat.nameJson, locale)}</h2>
            <div className="flex flex-col gap-2">
              {cat.items.map((item) => {
                const qty = draft.get(item.id) ?? 0;
                return (
                  <Card key={item.id}>
                    <CardContent className="flex items-center justify-between p-2.5">
                      <div>
                        <p className="text-sm font-medium">{localize(item.nameJson, locale)}</p>
                        <p className="text-sm font-semibold text-primary">{formatMoney(Number(item.price), currency)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => changeQty(item.id, -1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-input text-muted-foreground">
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-5 text-center text-sm">{qty}</span>
                        <button onClick={() => changeQty(item.id, 1)} className="flex h-7 w-7 items-center justify-center rounded-full border border-input text-muted-foreground">
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {itemCount > 0 && (
        <button
          onClick={() => setStep('checkout')}
          className="fixed bottom-4 left-4 right-4 z-20 flex items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-lg"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag className="h-4 w-4" /> {itemCount} {itemCount === 1 ? 'stavka' : 'stavke'}
          </span>
          <span className="font-bold">{formatMoney(total, currency)}</span>
        </button>
      )}
    </main>
  );
}
