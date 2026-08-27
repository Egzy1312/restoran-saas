'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } finally {
      // Namjerno UVIJEK prikazujemo "poslato" (bez obzira na ishod) - isti
      // razlog kao na backendu (ne otkrivati da li email postoji, vidi
      // AuthService.forgotPassword).
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Zaboravljena lozinka</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {sent ? (
            <p className="text-center text-sm text-muted-foreground">
              Ako nalog sa ovim emailom postoji, poslate su upute za resetovanje lozinke. Provjerite inbox (i spam folder).
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" autoComplete="username" />
              </div>
              <Button type="submit" disabled={loading} size="lg">
                {loading ? 'Slanje…' : 'Pošalji link za resetovanje'}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            <Link href="/login" className="font-medium text-primary hover:underline">
              Nazad na prijavu
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
