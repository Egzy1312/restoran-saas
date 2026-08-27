'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { AvailableTable, createReservation, fetchAvailability } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Step = 'form' | 'picking' | 'contact' | 'done';

function todayLocalDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Interactive Floor Plan Booking (modul D.1) - gost bira datum/vrijeme/broj gostiju, zatim konkretan sto. */
export default function ReservationClient({ slug }: { slug: string }) {
  const [step, setStep] = useState<Step>('form');
  const [date, setDate] = useState(todayLocalDate());
  const [time, setTime] = useState('19:00');
  const [guestCount, setGuestCount] = useState(2);
  const [tables, setTables] = useState<AvailableTable[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const reservationTimeIso = `${date}T${time}:00`;

  async function checkAvailability() {
    setError(null);
    setLoading(true);
    try {
      const result = await fetchAvailability(slug, reservationTimeIso, guestCount);
      setTables(result);
      setSelectedTableId(undefined);
      setStep('picking');
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const result = await createReservation(slug, {
        table_id: selectedTableId,
        customer_name: name,
        customer_phone: phone,
        customer_email: email || undefined,
        reservation_time: new Date(reservationTimeIso).toISOString(),
        guest_count: guestCount,
        special_requests: notes || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? 'Rezervacija nije uspjela.');
        return;
      }
      setStep('done');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-md p-5">
      <h1 className="mb-1 text-xl font-bold">Rezervacija stola</h1>
      <p className="mb-5 text-sm text-muted-foreground">Odaberite termin, broj gostiju i (opciono) željeni sto.</p>

      {step === 'form' && (
        <div className="flex flex-col gap-3">
          <div>
            <Label>Datum</Label>
            <Input type="date" value={date} min={todayLocalDate()} onChange={(e) => setDate(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Vrijeme</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Broj gostiju</Label>
            <Input type="number" min={1} value={guestCount} onChange={(e) => setGuestCount(Number(e.target.value))} className="mt-1" />
          </div>
          <Button size="lg" className="mt-2" disabled={loading} onClick={checkAvailability}>
            {loading ? 'Provjera…' : 'Provjeri dostupnost'}
          </Button>
        </div>
      )}

      {step === 'picking' && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              setSelectedTableId(undefined);
              setStep('contact');
            }}
            className="rounded-xl border-2 border-primary bg-primary/5 p-3 text-left"
          >
            <p className="font-medium">Bilo koji sto</p>
            <p className="text-xs text-muted-foreground">Osoblje će odabrati najbolji dostupan sto.</p>
          </button>

          {tables.map((t) => (
            <Card
              key={t.table_id}
              className="cursor-pointer p-3 transition-colors hover:bg-accent"
              onClick={() => {
                setSelectedTableId(t.table_id);
                setStep('contact');
              }}
            >
              <p className="font-medium">
                Sto {t.table_number} <span className="font-normal text-muted-foreground">— {t.zone_name}</span>
              </p>
              <p className="text-xs text-muted-foreground">Kapacitet {t.capacity} osoba</p>
            </Card>
          ))}

          {tables.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nema slobodnih stolova za tačno taj kapacitet — "Bilo koji sto" i dalje radi, osoblje potvrđuje ručno.
            </p>
          )}

          <button onClick={() => setStep('form')} className="mt-1 text-sm text-muted-foreground">
            ← Nazad
          </button>
        </div>
      )}

      {step === 'contact' && (
        <div className="flex flex-col gap-3">
          <div>
            <Label>Ime i prezime</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Telefon</Label>
            <Input required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Email (opciono)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Napomena (opciono)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1" />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button size="lg" className="mt-1" disabled={loading || !name || !phone} onClick={submit}>
            {loading ? 'Slanje…' : 'Potvrdi rezervaciju'}
          </Button>
          <button onClick={() => setStep('picking')} className="text-sm text-muted-foreground">
            ← Nazad
          </button>
        </div>
      )}

      {step === 'done' && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-5 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-success" />
            <p className="font-semibold">Rezervacija poslana!</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {date} u {time} za {guestCount} {guestCount === 1 ? 'osobu' : 'osobe'}. Restoran će potvrditi rezervaciju.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
