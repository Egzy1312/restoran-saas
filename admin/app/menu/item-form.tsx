'use client';

import { FormEvent, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { MenuItem, Modifier } from '@/types/menu';
import { uploadMenuItemImage } from '@/lib/api';
import { getToken } from '@/lib/auth';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import ImageUploadField from '@/components/image-upload-field';
import { cn } from '@/lib/utils';

export interface ItemFormValues {
  name_bs: string;
  name_en: string;
  description_bs?: string;
  price: number;
  image_url?: string;
  allergens: string[];
  print_target: string;
}

const ALLERGEN_OPTIONS = ['gluten', 'lactose', 'nuts', 'eggs', 'fish', 'soy'];

function localizedText(json: Record<string, string> | null | undefined): string {
  if (!json) return '';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}

export default function ItemForm({
  initial,
  onCancel,
  onSubmit,
  onAddModifier,
  onDeleteModifier,
}: {
  initial?: MenuItem;
  onCancel: () => void;
  onSubmit: (values: ItemFormValues) => Promise<void>;
  /** Modifikatori se cuvaju odmah (ne cekaju "Sačuvaj" na formi artikla) - zahtijevaju postojeci item.id, zato samo pri uredjivanju. */
  onAddModifier?: (name: string, price: number) => Promise<Modifier>;
  onDeleteModifier?: (id: string) => Promise<void>;
}) {
  const [nameBs, setNameBs] = useState(initial?.nameJson.bs ?? '');
  const [nameEn, setNameEn] = useState(initial?.nameJson.en ?? '');
  const [descriptionBs, setDescriptionBs] = useState(initial?.descriptionJson?.bs ?? '');
  const [price, setPrice] = useState(initial ? Number(initial.price) : 0);
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? '');
  const [allergens, setAllergens] = useState<string[]>(initial?.allergens ?? []);
  const [printTarget, setPrintTarget] = useState(initial?.printTarget ?? 'kitchen');
  const [saving, setSaving] = useState(false);

  const [modifiers, setModifiers] = useState<Modifier[]>(initial?.modifiers ?? []);
  const [modifierName, setModifierName] = useState('');
  const [modifierPrice, setModifierPrice] = useState('');
  const [modifierSaving, setModifierSaving] = useState(false);

  function toggleAllergen(a: string) {
    setAllergens((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name_bs: nameBs,
        name_en: nameEn,
        description_bs: descriptionBs || undefined,
        price,
        image_url: imageUrl || undefined,
        allergens,
        print_target: printTarget,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddModifier() {
    if (!onAddModifier || !modifierName || !modifierPrice) return;
    setModifierSaving(true);
    try {
      const created = await onAddModifier(modifierName, Number(modifierPrice));
      setModifiers((m) => [...m, created]);
      setModifierName('');
      setModifierPrice('');
    } finally {
      setModifierSaving(false);
    }
  }

  async function handleDeleteModifier(id: string) {
    if (!onDeleteModifier) return;
    await onDeleteModifier(id);
    setModifiers((m) => m.filter((mod) => mod.id !== id));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Uredi artikal' : 'Novi artikal'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <ImageUploadField
            label="Slika artikla"
            value={imageUrl}
            onChange={setImageUrl}
            upload={(file) => uploadMenuItemImage(getToken()!, file)}
          />
          <div>
            <Label>Naziv (bs)</Label>
            <Input required value={nameBs} onChange={(e) => setNameBs(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Naziv (en)</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Opis (bs)</Label>
            <Textarea value={descriptionBs} onChange={(e) => setDescriptionBs(e.target.value)} rows={2} className="mt-1" />
          </div>
          <div>
            <Label>Cijena</Label>
            <Input type="number" step="0.01" min="0" required value={price} onChange={(e) => setPrice(Number(e.target.value))} className="mt-1" />
          </div>
          <div>
            <Label className="mb-1.5 block">Alergeni</Label>
            <div className="flex flex-wrap gap-2">
              {ALLERGEN_OPTIONS.map((a) => (
                <button
                  type="button"
                  key={a}
                  onClick={() => toggleAllergen(a)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    allergens.includes(a) ? 'border-primary bg-primary text-primary-foreground' : 'border-input text-muted-foreground hover:bg-accent',
                  )}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Štampa na</Label>
            <select
              value={printTarget}
              onChange={(e) => setPrintTarget(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              <option value="kitchen">Kuhinja</option>
              <option value="bar">Šank</option>
            </select>
          </div>

          {initial && (
            <>
              <Separator />
              <div>
                <Label className="mb-1.5 block">Modifikatori (dodaci)</Label>
                {modifiers.length > 0 && (
                  <ul className="mb-2 flex flex-col gap-1">
                    {modifiers.map((mod) => (
                      <li key={mod.id} className="flex items-center justify-between rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                        <span>
                          {localizedText(mod.nameJson)} <span className="text-muted-foreground">(+{Number(mod.price).toFixed(2)} KM)</span>
                        </span>
                        <button type="button" onClick={() => handleDeleteModifier(mod.id)} className="text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-1.5">
                  <Input placeholder="Naziv (npr. Extra sir)" value={modifierName} onChange={(e) => setModifierName(e.target.value)} className="h-9 flex-1 text-sm" />
                  <Input placeholder="Cijena" type="number" step="0.01" value={modifierPrice} onChange={(e) => setModifierPrice(e.target.value)} className="h-9 w-24 text-sm" />
                  <Button type="button" size="icon" className="h-9 w-9 shrink-0" disabled={modifierSaving || !modifierName || !modifierPrice} onClick={handleAddModifier}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Separator />
            </>
          )}

          <DialogFooter className="mt-1 gap-2">
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
