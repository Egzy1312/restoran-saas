'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Minus, Plus, ShoppingCart, Printer, ArrowLeft, Banknote } from 'lucide-react';
import { createShopOrder, fetchShopProducts, ShopOrder, ShopProduct } from '@/lib/api';
import PublicHeader from '@/components/public-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export default function ShopPage() {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<'browse' | 'checkout' | 'done'>('browse');
  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({ customer_name: '', customer_email: '', customer_phone: '', shipping_address: '' });

  useEffect(() => {
    fetchShopProducts().then(setProducts).catch(() => setError('Greška pri učitavanju proizvoda.'));
  }, []);

  function setQty(productId: string, qty: number) {
    setCart((c) => {
      const next = { ...c };
      if (qty <= 0) delete next[productId];
      else next[productId] = qty;
      return next;
    });
  }

  const cartItems = Object.entries(cart)
    .map(([productId, quantity]) => ({ product: products.find((p) => p.id === productId), quantity }))
    .filter((i): i is { product: ShopProduct; quantity: number } => !!i.product);
  const cartTotal = cartItems.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0);
  const cartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const currency = products[0]?.currency ?? 'BAM';

  async function onCheckout(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await createShopOrder({
        items: cartItems.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        customer_name: form.customer_name,
        customer_email: form.customer_email,
        customer_phone: form.customer_phone || undefined,
        shipping_address: form.shipping_address,
      });
      if (result.payment_url) {
        window.location.href = result.payment_url;
        return;
      }
      setOrder(result);
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Narudžba nije uspjela.');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done' && order) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <PublicHeader />
        <main className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center px-4 py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
            <ShoppingCart className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold">Hvala na narudžbi!</h1>
          <p className="mt-2 text-muted-foreground">
            Broj narudžbe: <span className="font-mono">{order.id.slice(0, 8)}</span>. Kontaktiraćemo vas na{' '}
            {order.customerEmail} u vezi dostave.
          </p>
          <p className="mt-4 text-lg font-semibold">{formatPrice(order.totalCents, order.currency)}</p>
          <div className="mt-5 flex items-center gap-2 rounded-lg border bg-secondary/50 px-4 py-3 text-sm">
            <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span>Plaćanje pouzećem — iznos platite kuriru gotovinom prilikom preuzimanja pošiljke.</span>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        {step === 'browse' && (
          <>
            <div className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight">Prodavnica</h1>
              <p className="mt-2 text-muted-foreground">
                Termalni printeri spremni za rad sa Print Gateway agentom — LAN priključak, ESC/POS, CP852.
              </p>
            </div>

            {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="p-5">
                    <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-secondary/50">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.name} className="h-full w-full rounded-lg object-cover" />
                      ) : (
                        <Printer className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <h3 className="font-semibold">{product.name}</h3>
                    {product.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-lg font-bold">{formatPrice(product.priceCents, product.currency)}</span>
                      {product.stockQty === 0 ? (
                        <span className="text-sm text-destructive">Nema na zalihi</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(product.id, (cart[product.id] ?? 0) - 1)} disabled={!cart[product.id]}>
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <span className="w-5 text-center text-sm font-medium">{cart[product.id] ?? 0}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setQty(product.id, Math.min(product.stockQty, (cart[product.id] ?? 0) + 1))}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {products.length === 0 && !error && <p className="text-muted-foreground">Učitavanje…</p>}
            </div>

            {cartCount > 0 && (
              <div className="sticky bottom-4 mt-8 flex items-center justify-between rounded-xl border bg-card p-4 shadow-lg">
                <div>
                  <p className="font-medium">{cartCount} {cartCount === 1 ? 'artikal' : 'artikla'} u korpi</p>
                  <p className="text-sm text-muted-foreground">Ukupno: {formatPrice(cartTotal, currency)}</p>
                </div>
                <Button onClick={() => setStep('checkout')}>Nastavi na plaćanje</Button>
              </div>
            )}
          </>
        )}

        {step === 'checkout' && (
          <div className="mx-auto max-w-lg">
            <button onClick={() => setStep('browse')} className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Nazad na prodavnicu
            </button>
            <h1 className="text-2xl font-bold tracking-tight">Podaci za dostavu</h1>

            <Card className="mt-4">
              <CardContent className="p-5">
                <div className="mb-4 flex flex-col gap-1 border-b pb-4 text-sm">
                  {cartItems.map((i) => (
                    <div key={i.product.id} className="flex justify-between">
                      <span>
                        {i.quantity}× {i.product.name}
                      </span>
                      <span>{formatPrice(i.product.priceCents * i.quantity, i.product.currency)}</span>
                    </div>
                  ))}
                  <div className="mt-1 flex justify-between font-semibold">
                    <span>Ukupno</span>
                    <span>{formatPrice(cartTotal, currency)}</span>
                  </div>
                </div>

                <div className="mb-4 flex items-center gap-2 rounded-lg border bg-secondary/50 px-3 py-2.5 text-sm">
                  <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    Plaćanje pouzećem — iznos platite kuriru gotovinom prilikom preuzimanja pošiljke, nema online plaćanja.
                  </span>
                </div>

                <form onSubmit={onCheckout} className="flex flex-col gap-4">
                  <div>
                    <Label>Ime i prezime / naziv restorana</Label>
                    <Input required value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" required value={form.customer_email} onChange={(e) => setForm((f) => ({ ...f, customer_email: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label>Telefon</Label>
                    <Input value={form.customer_phone} onChange={(e) => setForm((f) => ({ ...f, customer_phone: e.target.value }))} className="mt-1" placeholder="+387..." />
                  </div>
                  <div>
                    <Label>Adresa za dostavu</Label>
                    <Textarea required value={form.shipping_address} onChange={(e) => setForm((f) => ({ ...f, shipping_address: e.target.value }))} className="mt-1" rows={2} />
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button type="submit" size="lg" disabled={loading}>
                    {loading ? 'Slanje…' : 'Pošalji narudžbu'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
