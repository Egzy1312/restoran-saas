'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DollarSign, Receipt, Clock, TrendingUp, UtensilsCrossed, LayoutGrid, CalendarCheck, ArrowRight } from 'lucide-react';
import { getStaffUser, getToken } from '@/lib/auth';
import { fetchAvgPrepTime, fetchBillingStatus, fetchSummary, fetchTopItems, BillingStatus, Summary, TopItem, AvgPrepTime } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function formatCurrency(amount: number): string {
  return `${amount.toFixed(2)} KM`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [prepTime, setPrepTime] = useState<AvgPrepTime | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    const t = getToken();
    const user = getStaffUser();
    if (!t || !user) {
      router.replace('/login');
      return;
    }
    if (user.role === 'SUPER_ADMIN') {
      router.replace('/platform');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchSummary(token, 1).then(setSummary).catch(() => undefined);
    fetchTopItems(token, 7).then(setTopItems).catch(() => undefined);
    fetchAvgPrepTime(token, 1).then(setPrepTime).catch(() => undefined);
    fetchBillingStatus(token).then(setBilling).catch(() => undefined);
  }, [token]);

  const user = getStaffUser();
  const trialDaysLeft = billing?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(billing.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Dobrodošli{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''} 👋</h1>
          <p className="text-muted-foreground">Pregled poslovanja za danas.</p>
        </div>

        {billing?.subscription_status === 'trialing' && trialDaysLeft !== null && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-medium">Probni period — još {trialDaysLeft} {trialDaysLeft === 1 ? 'dan' : 'dana'}</p>
                <p className="text-sm text-muted-foreground">Pretplatite se kad budete spremni, bez prekida rada.</p>
              </div>
              <Link href="/billing" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Pogledaj naplatu <ArrowRight className="h-4 w-4" />
              </Link>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Receipt} label="Narudžbe danas" value={summary ? String(summary.order_count) : '—'} />
          <StatCard icon={DollarSign} label="Promet danas" value={summary ? formatCurrency(summary.total_revenue) : '—'} />
          <StatCard icon={TrendingUp} label="Prosječan račun" value={summary ? formatCurrency(summary.avg_order_value) : '—'} />
          <StatCard icon={Clock} label="Prosj. vrijeme pripreme" value={prepTime ? `${prepTime.avg_minutes} min` : '—'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Najprodavaniji artikli (7 dana)</CardTitle>
              <CardDescription>Po količini prodatih porcija.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {topItems.length === 0 && <p className="text-sm text-muted-foreground">Nema podataka za ovaj period.</p>}
              {topItems.slice(0, 5).map((item, i) => (
                <div key={item.menu_item_id} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-secondary text-xs font-semibold">{i + 1}</span>
                    {item.name}
                  </span>
                  <span className="text-muted-foreground">{item.quantity}×</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brze akcije</CardTitle>
              <CardDescription>Najčešće korišteni ekrani.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <QuickAction href="/menu" icon={UtensilsCrossed} label="Uredi meni" />
              <QuickAction href="/tables" icon={LayoutGrid} label="Tlocrt stolova" />
              <QuickAction href="/reservations" icon={CalendarCheck} label="Rezervacije" />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xl font-bold leading-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickAction({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center text-sm font-medium transition-colors hover:bg-accent"
    >
      <Icon className="h-6 w-6 text-primary" />
      {label}
    </Link>
  );
}
