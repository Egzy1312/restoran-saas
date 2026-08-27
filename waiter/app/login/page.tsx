'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { login } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { access_token, refresh_token, user } = await login(email, password);
      if (!['WAITER', 'ADMIN', 'MANAGER'].includes(user.role)) {
        setError('Ovaj nalog nema pristup konobarskom modulu.');
        return;
      }
      saveSession(access_token, refresh_token, user);
      router.replace('/floor');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Greška pri prijavi.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-col items-center gap-2 pb-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ClipboardList className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">Prijava — Konobar</h1>
          </div>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                autoComplete="username"
              />
            </div>

            <div>
              <Label>Lozinka</Label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1"
                autoComplete="current-password"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" size="lg" disabled={loading}>
              {loading ? 'Prijavljivanje…' : 'Prijavi se'}
            </Button>

            {/* "Zaboravljena lozinka" tok postoji samo u admin panelu (jedno mjesto za sva 3 staff-facing app-a). */}
            <a
              href={`${process.env.NEXT_PUBLIC_ADMIN_URL ?? 'http://localhost:3005'}/forgot-password`}
              className="text-center text-sm text-muted-foreground hover:text-primary"
            >
              Zaboravili ste lozinku?
            </a>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
