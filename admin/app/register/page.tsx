'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { registerRestaurant } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    restaurant_name: '',
    address: '',
    owner_full_name: '',
    email: '',
    password: '',
  });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token, refresh_token, user } = await registerRestaurant(form);
      saveSession(access_token, refresh_token, user);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registracija nije uspjela.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <ChefHat className="h-6 w-6" />
          </div>
          <CardTitle>Registruj svoj restoran</CardTitle>
          <CardDescription>14-dnevni besplatan probni period, bez kartice.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label>Naziv restorana</Label>
              <Input required value={form.restaurant_name} onChange={(e) => update('restaurant_name', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Adresa</Label>
              <Input required value={form.address} onChange={(e) => update('address', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Vaše ime i prezime</Label>
              <Input required value={form.owner_full_name} onChange={(e) => update('owner_full_name', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} className="mt-1" autoComplete="username" />
            </div>
            <div>
              <Label>Lozinka</Label>
              <Input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
                className="mt-1"
                autoComplete="new-password"
              />
            </div>

            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input type="checkbox" required checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" />
              <span>
                Prihvatam{' '}
                <Link href="/terms" target="_blank" className="text-primary underline">
                  Uslove korištenja
                </Link>{' '}
                i{' '}
                <Link href="/privacy" target="_blank" className="text-primary underline">
                  Politiku privatnosti
                </Link>
                .
              </span>
            </label>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading || !acceptedTerms} size="lg">
              {loading ? 'Kreiranje naloga…' : 'Kreiraj nalog'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Već imate nalog?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Prijavite se
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
