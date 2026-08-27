'use client';

import { FormEvent, useState } from 'react';
import { StaffAccount } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export interface StaffFormValues {
  email: string;
  password: string;
  full_name: string;
  role: StaffAccount['role'];
}

const ROLE_OPTIONS: { value: StaffAccount['role']; label: string }[] = [
  { value: 'ADMIN', label: 'Admin' },
  { value: 'MANAGER', label: 'Menadžer' },
  { value: 'WAITER', label: 'Konobar' },
  { value: 'KITCHEN', label: 'Kuhinja' },
  { value: 'BAR', label: 'Šank' },
];

export default function StaffForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (values: StaffFormValues) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffAccount['role']>('WAITER');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ email, password, full_name: fullName, role });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri kreiranju naloga.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novi nalog osoblja</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <Label>Ime i prezime</Label>
            <Input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Email</Label>
            <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Početna lozinka</Label>
            <Input required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Uloga</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffAccount['role'])}
              className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-2 gap-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
              Otkaži
            </Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Kreiranje…' : 'Kreiraj'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
