'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChefHat } from 'lucide-react';
import { login, verifyTwoFactor } from '@/lib/api';
import { saveSession, StaffUser } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

function Logo() {
  return (
    <div className="mb-2 flex flex-col items-center gap-2">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <ChefHat className="h-6 w-6" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Drugi korak prijave - postavljeno samo ako nalog ima ukljucen 2FA (vidi login()).
  const [preAuthToken, setPreAuthToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  function afterLogin(access_token: string, refresh_token: string, user: StaffUser) {
    if (!['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(user.role)) {
      setError('Ovaj nalog nema pristup admin panelu.');
      return;
    }
    saveSession(access_token, refresh_token, user);
    // SUPER_ADMIN (platforma, restaurant_id: null) ide na platform-admin
    // ekran, nikad na restaurant-scoped /dashboard (vidi jwt.strategy.ts).
    router.replace(user.role === 'SUPER_ADMIN' ? '/platform' : '/dashboard');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if ('requires_2fa' in result) {
        setPreAuthToken(result.pre_auth_token);
        return;
      }
      afterLogin(result.access_token, result.refresh_token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi.');
    } finally {
      setLoading(false);
    }
  }

  async function onVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (!preAuthToken) return;
    setError(null);
    setLoading(true);
    try {
      const { access_token, refresh_token, user } = await verifyTwoFactor(preAuthToken, code);
      afterLogin(access_token, refresh_token, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neispravan kod.');
    } finally {
      setLoading(false);
    }
  }

  if (preAuthToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Logo />
            <CardTitle>Unesite 2FA kod</CardTitle>
            <CardDescription>Otvorite svoju authenticator aplikaciju i unesite trenutni 6-cifreni kod.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onVerifyCode} className="flex flex-col gap-4">
              <Input
                inputMode="numeric"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="text-center text-xl tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} size="lg">
                {loading ? 'Provjera…' : 'Potvrdi'}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPreAuthToken(null);
                  setCode('');
                  setError(null);
                }}
                className="text-center text-sm text-muted-foreground hover:text-primary"
              >
                Nazad na prijavu
              </button>
            </form>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo />
          <CardTitle>Prijava — Admin</CardTitle>
          <CardDescription>Restoran SaaS Platforma</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" autoComplete="username" />
            </div>
            <div>
              <Label htmlFor="password">Lozinka</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" autoComplete="current-password" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={loading} size="lg">
              {loading ? 'Prijavljivanje…' : 'Prijavi se'}
            </Button>

            <div className="flex items-center justify-between text-sm">
              <Link href="/forgot-password" className="text-muted-foreground hover:text-primary">
                Zaboravili ste lozinku?
              </Link>
              <Link href="/register" className="font-medium text-primary hover:underline">
                Registruj restoran
              </Link>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Registracijom prihvatate{' '}
              <Link href="/terms" className="underline">
                Uslove korištenja
              </Link>{' '}
              i{' '}
              <Link href="/privacy" className="underline">
                Politiku privatnosti
              </Link>
              .
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
