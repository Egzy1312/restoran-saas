'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { verifyEmail } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Nedostaje token u linku.');
      return;
    }
    verifyEmail(token)
      .then((res) => {
        setStatus('success');
        setMessage(res.message);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Potvrda emaila nije uspjela.');
      });
  }, [token]);

  if (status === 'loading') return <p className="text-center text-sm text-muted-foreground">Potvrđivanje…</p>;

  return (
    <>
      <p className={`text-center text-sm ${status === 'success' ? 'text-success' : 'text-destructive'}`}>{message}</p>
      <Link href="/dashboard" className="mt-2 text-center text-sm font-medium text-primary hover:underline">
        Nastavi na panel
      </Link>
    </>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Potvrda emaila</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={<p className="text-center text-sm text-muted-foreground">Učitavanje…</p>}>
            <VerifyEmailContent />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
