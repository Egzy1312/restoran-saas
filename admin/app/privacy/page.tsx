import Link from 'next/link';

export const metadata = { title: 'Politika privatnosti — Restoran SaaS' };

export default function PrivacyPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-10 flex flex-col gap-4 text-foreground leading-relaxed">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <strong>Napomena:</strong> ovo je generički predložak, ne pravno provjeren dokument (npr. za GDPR
        usklađenost). Prije stvarnog lansiranja, dajte ga na pregled pravniku.
      </p>

      <h1 className="text-2xl font-bold text-foreground">Politika privatnosti</h1>
      <p className="text-sm text-muted-foreground">Posljednje ažurirano: [datum]</p>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">1. Koje podatke prikupljamo</h2>
        <p className="mb-2"><strong>Osoblje restorana (vlasnici/menadžeri/konobari):</strong> ime, email, lozinka (hashovana, nikad u čitljivom obliku), broj neuspjelih pokušaja prijave (radi sigurnosti).</p>
        <p><strong>Gosti restorana:</strong> ime i broj telefona (za narudžbe/rezervacije), GPS lokacija u trenutku naručivanja (samo ako restoran ima uključen geofencing, radi provjere da li ste fizički u restoranu), jezička preferenca (čuva se lokalno u vašem pregledaču).</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">2. Kako čuvamo tajne podatke</h2>
        <p>
          Lozinke se čuvaju kao bcrypt heš (nikad u čitljivom obliku). Kredencijali trećih strana koje
          restoran unosi (Twilio, Stripe) enkriptovani su at-rest (AES-256-GCM) prije upisa u bazu.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">3. Treće strane</h2>
        <p>
          Restoran može povezati vlastite naloge trećih strana (Twilio za SMS/WhatsApp, Stripe za online
          plaćanje) — ti podaci se dijele SAMO sa uslugom koju je restoran sam povezao, u obimu potrebnom za
          slanje poruke/obradu plaćanja. Platforma sama koristi Lemon Squeezy isključivo za naplatu pretplate
          restorana platformi.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">4. Lokalno skladištenje (local storage)</h2>
        <p>
          Aplikacije za osoblje čuvaju token prijave u local storage vašeg pregledača (ne u kolačiće/cookies).
          Gost PWA čuva jezičku preferencu i sadržaj korpe lokalno radi kontinuiteta sesije.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">5. Vaša prava</h2>
        <p>
          Možete zatražiti brisanje svog naloga i povezanih podataka kontaktiranjem [email za podršku].
          Suspenzija/brisanje restorana ne utiče na podatke drugih restorana na Platformi.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">6. Kontakt</h2>
        <p>Pitanja u vezi privatnosti: [email za podršku].</p>
      </section>

      <Link href="/register" className="text-primary font-medium mt-4">← Nazad na registraciju</Link>
    </main>
  );
}
