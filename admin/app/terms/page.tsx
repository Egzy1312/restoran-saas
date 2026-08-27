import Link from 'next/link';

export const metadata = { title: 'Uslovi korištenja — Restoran SaaS' };

export default function TermsPage() {
  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-10 flex flex-col gap-4 text-foreground leading-relaxed">
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <strong>Napomena:</strong> ovo je generički predložak, ne pravno provjeren dokument. Prije stvarnog
        lansiranja, zamijenite naziv firme/jurisdikciju ispod i dajte ga na pregled pravniku.
      </p>

      <h1 className="text-2xl font-bold text-foreground">Uslovi korištenja</h1>
      <p className="text-sm text-muted-foreground">Posljednje ažurirano: [datum]</p>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">1. Prihvatanje uslova</h2>
        <p>
          Registracijom i korištenjem platforme [Naziv Firme] ("Platforma") prihvatate ove Uslove korištenja.
          Ako se ne slažete, nemojte koristiti Platformu.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">2. Opis usluge</h2>
        <p>
          Platforma pruža softver kao uslugu (SaaS) restoranima za naručivanje putem QR koda, upravljanje
          narudžbama, rezervacije i analitiku. Svaki restoran ("Korisnik") kreira nalog i upravlja svojim
          podacima nezavisno od drugih korisnika Platforme.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">3. Nalog i sigurnost</h2>
        <p>
          Odgovorni ste za tačnost podataka prilikom registracije i za čuvanje povjerljivosti svoje lozinke.
          Preporučujemo uključivanje dvofaktorske autentikacije (2FA) u postavkama naloga.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">4. Pretplata i plaćanje</h2>
        <p>
          Nakon isteka probnog perioda, nastavak korištenja Platforme zahtijeva aktivnu pretplatu putem Lemon
          Squeezy-a. Cijene i uslovi plaćanja prikazani su u ekranu "Naplata" prije potvrde.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">5. Podaci gostiju</h2>
        <p>
          Korisnik (restoran) je odgovoran za zakonitost prikupljanja podataka svojih gostiju (ime, telefon,
          GPS lokacija radi geofencing provjere) putem Platforme, u skladu sa važećim propisima o zaštiti
          podataka u svojoj jurisdikciji.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">6. Raskid</h2>
        <p>
          Platforma zadržava pravo suspenzije naloga koji krši ove uslove ili ne izmiruje pretplatu. Korisnik
          može u svakom trenutku otkazati pretplatu.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">7. Ograničenje odgovornosti</h2>
        <p>
          Platforma se pruža "kakva jeste", bez garancija. [Naziv Firme] ne odgovara za indirektnu štetu
          proisteklu iz korištenja ili nemogućnosti korištenja usluge.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-foreground mb-1">8. Kontakt</h2>
        <p>Pitanja u vezi ovih uslova: [email za podršku].</p>
      </section>

      <Link href="/register" className="text-primary font-medium mt-4">← Nazad na registraciju</Link>
    </main>
  );
}
