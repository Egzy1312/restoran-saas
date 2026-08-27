'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Phone, MapPin } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { fetchReservations, Reservation, updateReservationStatus } from '@/lib/api';
import AppShell from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const STATUS_LABEL: Record<Reservation['status'], string> = {
  confirmed: 'Potvrđena',
  cancelled: 'Otkazana',
  completed: 'Završena',
  no_show: 'Nije se pojavio/la',
};

const STATUS_VARIANT: Record<Reservation['status'], 'secondary' | 'destructive' | 'success'> = {
  confirmed: 'secondary',
  cancelled: 'destructive',
  completed: 'success',
  no_show: 'destructive',
};

export default function ReservationsPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showPast, setShowPast] = useState(false);

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
    fetchReservations(t).then(setReservations);
  }

  async function setStatus(id: string, status: string) {
    if (!token) return;
    await updateReservationStatus(token, id, status);
    reload(token);
  }

  if (!token) return null;

  const now = Date.now();
  const visible = reservations.filter((r) => showPast || new Date(r.reservationTime).getTime() >= now - 3 * 60 * 60 * 1000);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Rezervacije</h1>
            <p className="text-muted-foreground">Uključujući rezervacije sa web widgeta restorana.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Prikaži prošle
            <Switch checked={showPast} onCheckedChange={setShowPast} />
          </label>
        </div>

        {visible.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Nema rezervacija.</CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {visible.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <p className="font-semibold">
                    {r.customerName}{' '}
                    <span className="inline-flex items-center gap-1 text-sm font-normal text-muted-foreground">
                      <Users className="h-3.5 w-3.5" /> {r.guestCount}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(r.reservationTime).toLocaleString('bs-BA', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <p className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {r.customerPhone}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {r.table ? `Sto ${r.table.tableNumber} (${r.table.zoneName})` : 'Bilo koji sto'}
                    </span>
                  </p>
                  {r.specialRequests && <p className="mt-1 text-xs italic text-muted-foreground">„{r.specialRequests}"</p>}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  {r.status === 'confirmed' && (
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'completed')}>
                        Završi
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setStatus(r.id, 'no_show')}>
                        Ne dolazi
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setStatus(r.id, 'cancelled')}>
                        Otkaži
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
