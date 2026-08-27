'use client';

import { FormEvent, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function NewTableForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: { table_number: string; zone_name: string; capacity: number }) => Promise<void>;
}) {
  const [tableNumber, setTableNumber] = useState('');
  const [zoneName, setZoneName] = useState('Glavna Sala');
  const [capacity, setCapacity] = useState(4);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ table_number: tableNumber, zone_name: zoneName, capacity });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>Novi sto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label>Broj stola</Label>
            <Input required value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Zona</Label>
            <Input required value={zoneName} onChange={(e) => setZoneName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Kapacitet</Label>
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="mt-1" />
          </div>
          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Otkaži
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Dodavanje…' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
