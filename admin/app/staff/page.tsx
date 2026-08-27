'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, Plus, KeyRound, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getStaffUser, getToken } from '@/lib/auth';
import { createStaffUser, deleteStaffUser, fetchStaff, StaffAccount, updateStaffUser } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import StaffForm, { StaffFormValues } from './staff-form';

const ROLE_LABEL: Record<StaffAccount['role'], string> = {
  ADMIN: 'Admin',
  MANAGER: 'Menadžer',
  WAITER: 'Konobar',
  KITCHEN: 'Kuhinja',
  BAR: 'Šank',
};

export default function StaffPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [resetTarget, setResetTarget] = useState<StaffAccount | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffAccount | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (token) reload(token);
  }, [token]);

  function reload(t: string) {
    fetchStaff(t).then(setStaff);
  }

  async function handleCreate(values: StaffFormValues) {
    if (!token) return;
    await createStaffUser(token, values);
    setShowForm(false);
    reload(token);
    toast.success('Nalog kreiran.');
  }

  async function handleRoleChange(id: string, role: StaffAccount['role']) {
    if (!token) return;
    await updateStaffUser(token, id, { role });
    reload(token);
  }

  async function handleToggleActive(account: StaffAccount) {
    if (!token) return;
    try {
      await updateStaffUser(token, account.id, { is_active: !account.isActive });
      reload(token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška.');
    }
  }

  async function handleDelete() {
    if (!token || !deleteTarget) return;
    try {
      await deleteStaffUser(token, deleteTarget.id);
      reload(token);
      toast.success('Nalog obrisan.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška.');
    } finally {
      setDeleteTarget(null);
    }
  }

  if (!token) return null;

  const me = getStaffUser();

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Osoblje</h1>
            <p className="text-muted-foreground">Nalozi konobara, kuhinje i menadžmenta.</p>
          </div>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Novi nalog
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ime</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Uloga</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((account) => {
                const isSelf = account.id === me?.id;
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <p className="font-medium">
                        {account.fullName}
                        {isSelf && <span className="ml-1 text-xs font-normal text-muted-foreground">(ti)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground sm:hidden">{account.email}</p>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{account.email}</TableCell>
                    <TableCell>
                      <select
                        value={account.role}
                        onChange={(e) => handleRoleChange(account.id, e.target.value as StaffAccount['role'])}
                        className="rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                      >
                        {Object.entries(ROLE_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleActive(account)} disabled={isSelf} className="disabled:opacity-40">
                        <Badge variant={account.isActive ? 'success' : 'destructive'}>{account.isActive ? 'Aktivan' : 'Neaktivan'}</Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setResetTarget(account)} className="cursor-pointer">
                            <KeyRound className="mr-2 h-4 w-4" />
                            Reset lozinke
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(account)}
                            disabled={isSelf}
                            className="cursor-pointer text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Obriši
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {staff.length === 0 && <CardContent className="text-center text-muted-foreground">Nema naloga osoblja.</CardContent>}
        </Card>
      </div>

      {showForm && <StaffForm onCancel={() => setShowForm(false)} onSubmit={handleCreate} />}

      {resetTarget && token && (
        <ResetPasswordDialog
          account={resetTarget}
          token={token}
          onClose={() => setResetTarget(null)}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obrisati nalog?</DialogTitle>
            <DialogDescription>
              Nalog "{deleteTarget?.fullName}" će biti trajno obrisan. Ova akcija se ne može poništiti.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Otkaži
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Obriši
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function ResetPasswordDialog({ account, token, onClose }: { account: StaffAccount; token: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateStaffUser(token, account.id, { password });
      toast.success('Lozinka je promijenjena.');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Greška.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset lozinke — {account.fullName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Input
            type="text"
            required
            minLength={6}
            placeholder="Nova lozinka (min. 6 karaktera)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Otkaži
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Čuvanje…' : 'Promijeni lozinku'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
