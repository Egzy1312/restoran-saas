'use client';

import { FormEvent, useState } from 'react';
import { MenuCategory } from '@/types/menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface CategoryFormValues {
  name_bs: string;
  name_en: string;
  sort_order: number;
  active_from_time?: string;
  active_to_time?: string;
}

export default function CategoryForm({
  initial,
  onCancel,
  onSubmit,
}: {
  initial?: MenuCategory;
  onCancel: () => void;
  onSubmit: (values: CategoryFormValues) => Promise<void>;
}) {
  const [nameBs, setNameBs] = useState(initial?.nameJson.bs ?? '');
  const [nameEn, setNameEn] = useState(initial?.nameJson.en ?? '');
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [fromTime, setFromTime] = useState(initial?.activeFromTime?.slice(11, 16) ?? '');
  const [toTime, setToTime] = useState(initial?.activeToTime?.slice(11, 16) ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({
        name_bs: nameBs,
        name_en: nameEn,
        sort_order: sortOrder,
        active_from_time: fromTime || undefined,
        active_to_time: toTime || undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Uredi kategoriju' : 'Nova kategorija'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label>Naziv (bs)</Label>
            <Input required value={nameBs} onChange={(e) => setNameBs(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Naziv (en)</Label>
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Redoslijed</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="mt-1" />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <Label>Aktivno od</Label>
              <Input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} className="mt-1" />
            </div>
            <div className="flex-1">
              <Label>Aktivno do</Label>
              <Input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} className="mt-1" />
            </div>
          </div>
          <p className="-mt-1 text-xs text-muted-foreground">
            Ostavi prazno za kategoriju koja je uvijek vidljiva (npr. "Dnevni ručak 11:00–14:00").
          </p>

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
