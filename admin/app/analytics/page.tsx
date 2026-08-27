'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { getToken } from '@/lib/auth';
import {
  AvgPrepTime,
  downloadCsv,
  fetchAvgPrepTime,
  fetchSummary,
  fetchTableRevenue,
  fetchTopItems,
  Summary,
  TableRevenue,
  TopItem,
} from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DAY_OPTIONS = [
  { value: 1, label: 'Danas' },
  { value: 7, label: '7 dana' },
  { value: 30, label: '30 dana' },
];

export default function AnalyticsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [prepTime, setPrepTime] = useState<AvgPrepTime | null>(null);
  const [tableRevenue, setTableRevenue] = useState<TableRevenue[]>([]);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  useEffect(() => {
    if (!token) return;
    fetchSummary(token, days).then(setSummary);
    fetchTopItems(token, days).then(setTopItems);
    fetchAvgPrepTime(token, days).then(setPrepTime);
    fetchTableRevenue(token, days).then(setTableRevenue);
  }, [token, days]);

  if (!token) return null;

  const maxItemQty = Math.max(1, ...topItems.map((i) => i.quantity));
  const maxTableRevenue = Math.max(1, ...tableRevenue.map((t) => t.revenue));

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Analitika</h1>
            <p className="text-muted-foreground">Promet, artikli i stolovi za odabrani period.</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  days === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCsv(token, `/analytics/report?days=${days}&format=xlsx`, 'izvjestaj.xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Izvještaj (Excel)
          </Button>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(token, `/analytics/report?days=${days}&format=pdf`, 'izvjestaj.pdf')}>
            <FileText className="h-4 w-4" /> Izvještaj (PDF)
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Narudžbi" value={summary?.order_count ?? '—'} />
          <StatCard label="Promet" value={summary ? `${summary.total_revenue.toFixed(2)} KM` : '—'} />
          <StatCard label="Prosj. račun" value={summary ? `${summary.avg_order_value.toFixed(2)} KM` : '—'} />
          <StatCard label="Prosj. priprema" value={prepTime ? `${prepTime.avg_minutes} min` : '—'} hint={prepTime ? `${prepTime.sample_size} narudžbi` : undefined} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Najprodavaniji artikli</CardTitle>
              <button
                onClick={() => downloadCsv(token, `/analytics/top-items?days=${days}&format=csv`, 'top-items.csv')}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {topItems.length === 0 && <p className="text-sm text-muted-foreground">Nema podataka za odabrani period.</p>}
              {topItems.map((item) => (
                <div key={item.menu_item_id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.name}</span>
                    <span className="text-muted-foreground">
                      {item.quantity}× · {item.revenue.toFixed(2)} KM
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(item.quantity / maxItemQty) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Najprofitabilniji stolovi</CardTitle>
              <button
                onClick={() => downloadCsv(token, `/analytics/table-revenue?days=${days}&format=csv`, 'table-revenue.csv')}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Download className="h-3 w-3" /> CSV
              </button>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {tableRevenue.length === 0 && <p className="text-sm text-muted-foreground">Nema podataka za odabrani period.</p>}
              {tableRevenue.map((t) => (
                <div key={t.table_id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      Sto {t.table_number} <span className="font-normal text-muted-foreground">({t.zone_name})</span>
                    </span>
                    <span className="text-muted-foreground">
                      {t.order_count} narudžbi · {t.revenue.toFixed(2)} KM
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${(t.revenue / maxTableRevenue) * 100}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
