'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { getToken, getStaffUser } from '@/lib/auth';
import { BillingStatus, createBillingCheckout, fetchBillingStatus } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

const STATUS_LABEL: Record<BillingStatus['subscription_status'], string> = {
  trialing: 'Probni period',
  active: 'Aktivna pretplata',
  past_due: 'Neuspjelo plaćanje',
  cancelled: 'Otkazana pretplata',
};

const STATUS_VARIANT: Record<BillingStatus['subscription_status'], 'secondary' | 'success' | 'destructive'> = {
  trialing: 'secondary',
  active: 'success',
  past_due: 'destructive',
  cancelled: 'destructive',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('bs-BA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function BillingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  useEffect(() => {
    const t = getToken();
    const user = getStaffUser();
    if (!t || !user || !['ADMIN', 'MANAGER'].includes(user.role)) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchBillingStatus(token)
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : 'Greška pri učitavanju.'));
  }, [token]);

  async function onSubscribe() {
    if (!token) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const { url } = await createBillingCheckout(token);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Naplata trenutno nije dostupna.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Naplata</h1>
          <p className="text-muted-foreground">Pretplata restorana na platformu.</p>
        </div>

        {status && (
          <Card className="max-w-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Status pretplate</CardTitle>
                  <CardDescription>Lemon Squeezy hosted checkout.</CardDescription>
                </div>
                <Badge variant={STATUS_VARIANT[status.subscription_status]} className="ml-auto">
                  {STATUS_LABEL[status.subscription_status]}
                </Badge>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="flex flex-col gap-3 pt-5">
              {status.subscription_status === 'trialing' && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Probni period ističe</span>
                  <span className="font-medium">{formatDate(status.trial_ends_at)}</span>
                </div>
              )}
              {status.subscription_renews_at && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sljedeća naplata</span>
                  <span className="font-medium">{formatDate(status.subscription_renews_at)}</span>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}

              {status.subscription_status !== 'active' ? (
                <Button onClick={onSubscribe} disabled={checkoutLoading} className="mt-2">
                  {checkoutLoading ? 'Otvaranje…' : 'Pretplati se (Lemon Squeezy)'}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Za promjenu ili otkazivanje pretplate, otvorite email potvrdu koju ste dobili od Lemon Squeezy-a nakon plaćanja.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
