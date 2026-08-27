'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat, LogOut, Plus, Pencil, Trash2, ArrowLeft, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { clearSession, getStaffUser, getToken } from '@/lib/auth';
import {
  createShopProduct,
  deleteShopProduct,
  fetchAllShopProducts,
  ShopProduct,
  updateShopProduct,
  uploadShopProductImage,
  UpsertShopProductPayload,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import ImageUploadField from '@/components/image-upload-field';

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

export default function ShopProductsAdminPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [editing, setEditing] = useState<ShopProduct | 'new' | null>(null);

  useEffect(() => {
    const t = getToken();
    const user = getStaffUser();
    if (!t || !user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  function reload(t: string) {
    fetchAllShopProducts(t).then(setProducts);
  }

  async function handleDelete(product: ShopProduct) {
    if (!token || !confirm(`Obrisati "${product.name}"?`)) return;
    await deleteShopProduct(token, product.id);
    reload(token);
    toast.success('Proizvod obrisan.');
  }

  function logout() {
    clearSession();
    router.replace('/login');
  }

  if (!token) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b bg-card px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChefHat className="h-4 w-4" />
          </div>
          <span className="font-bold">Platforma — Webshop proizvodi</span>
        </div>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" /> Odjava
        </Button>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <Link href="/platform" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Nazad na Platformu
          </Link>
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Proizvod
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16" />
                <TableHead>Naziv</TableHead>
                <TableHead>Cijena</TableHead>
                <TableHead>Zalihe</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-lg bg-secondary/50">
                      {p.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <Printer className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.slug}</div>
                  </TableCell>
                  <TableCell>{formatPrice(p.priceCents, p.currency)}</TableCell>
                  <TableCell>{p.stockQty}</TableCell>
                  <TableCell>
                    <Badge variant={p.isActive ? 'success' : 'secondary'}>{p.isActive ? 'Aktivan' : 'Sakriven'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {products.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nema proizvoda.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </main>

      {editing && token && (
        <ProductForm
          token={token}
          initial={editing === 'new' ? undefined : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload(token);
          }}
        />
      )}
    </div>
  );
}

function ProductForm({
  token,
  initial,
  onCancel,
  onSaved,
}: {
  token: string;
  initial?: ShopProduct;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [price, setPrice] = useState(initial ? (initial.priceCents / 100).toFixed(2) : '');
  const [stockQty, setStockQty] = useState(initial?.stockQty ?? 0);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [sku, setSku] = useState(initial?.sku ?? '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload: UpsertShopProductPayload = {
        name,
        description: description || undefined,
        price_cents: Math.round(Number(price) * 100),
        stock_qty: stockQty,
        image_url: imageUrl || undefined,
        sku: sku || undefined,
        is_active: isActive,
      };
      if (initial) await updateShopProduct(token, initial.id, payload);
      else await createShopProduct(token, payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri čuvanju.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Uredi proizvod' : 'Novi proizvod'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div>
            <Label>Naziv</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Opis</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Cijena (KM)</Label>
              <Input required type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Zalihe</Label>
              <Input type="number" min="0" value={stockQty} onChange={(e) => setStockQty(Number(e.target.value))} className="mt-1" />
            </div>
          </div>
          <ImageUploadField label="Slika proizvoda" value={imageUrl} onChange={setImageUrl} upload={(file) => uploadShopProductImage(token, file)} />
          <div>
            <Label>SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} className="mt-1" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Vidljiv u prodavnici
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Otkaži
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Čuvanje…' : 'Sačuvaj'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
