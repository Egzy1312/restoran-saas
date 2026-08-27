import Link from 'next/link';
import {
  QrCode,
  MonitorSmartphone,
  LayoutGrid,
  CalendarCheck,
  BarChart3,
  ShieldCheck,
  ArrowRight,
  Check,
  Printer,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import PublicHeader from '@/components/public-header';

const FEATURES = [
  {
    icon: QrCode,
    title: 'QR meni i narudžba',
    description: 'Gost skenira kod na stolu, naruči i po želji plati karticom — bez čekanja konobara.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Kuhinjski ekran uživo',
    description: 'Narudžbe stižu direktno na ekran kuhinje i šanka, automatski razvrstane po stanici.',
  },
  {
    icon: LayoutGrid,
    title: 'Vizuelni tlocrt sale',
    description: 'Status svakog stola u realnom vremenu — slobodan, zauzet, traži račun.',
  },
  {
    icon: CalendarCheck,
    title: 'Rezervacije',
    description: 'Gosti rezervišu online (i sa vašeg sajta), vi potvrđujete iz jednog panela.',
  },
  {
    icon: BarChart3,
    title: 'Analitika',
    description: 'Promet, najprodavaniji artikli i profitabilnost po stolu — izvoz u Excel i PDF.',
  },
  {
    icon: ShieldCheck,
    title: 'Sigurnost',
    description: 'Dvofaktorska autentikacija, enkriptovani podaci, kontrola pristupa po ulozi osoblja.',
  },
];

const STEPS = [
  { title: 'Registruj restoran', description: 'Dvije minute — naziv, adresa, email. Bez kartice.' },
  { title: 'Dodaj meni i stolove', description: 'Unesi kategorije, artikle i tlocrt sale u admin panelu.' },
  { title: 'Zalijepi QR kodove', description: 'Odštampaj kodove po stolu i gosti mogu odmah naručivati.' },
];

const PRICING_FEATURES = [
  'Neograničen broj stolova i narudžbi',
  'QR meni, korpa uživo, kuhinjski ekran',
  'Vizuelni tlocrt sale i konobarski modul',
  'Rezervacije sa SMS/WhatsApp podsjetnicima',
  'Analitika sa izvozom u Excel i PDF',
  'Neograničen broj naloga osoblja',
  'Dvofaktorska autentikacija (2FA)',
  'Email podrška',
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            Sve-u-jednom platforma za restorane
          </span>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Naručivanje, kuhinja i sto —<br />sve na jednom mjestu.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            QR meni, narudžbe uživo u kuhinji, tlocrt stolova, rezervacije i analitika. Bez papira, bez čekanja
            konobara da donese jelovnik.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/register">
                Registruj svoj restoran besplatno <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">Već imaš nalog? Prijavi se</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">14 dana besplatno · bez kartice · otkaži bilo kad</p>
        </section>

        {/* Features */}
        <section id="features" className="border-y bg-secondary/30 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight">Sve što ti treba, na jednom mjestu</h2>
              <p className="mt-3 text-muted-foreground">Od QR koda na stolu do izvještaja na kraju mjeseca.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <Card key={f.title}>
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{f.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Hardver */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                <Printer className="h-4 w-4" /> Hardver
              </span>
              <h2 className="text-3xl font-bold tracking-tight">Termalni printeri, spremni za rad iz kutije</h2>
              <p className="mt-3 text-muted-foreground">
                Prodajemo LAN termalne printere unaprijed testirane sa Print Gateway agentom — samo ih priključite
                na mrežu restorana i unesite IP u Postavkama. ESC/POS kompatibilni, sa CP852 kodnom stranicom za
                č/ć/š/ž/đ, dostupni u 58mm i 80mm širini.
              </p>
              <ul className="mt-5 flex flex-col gap-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" /> Direktna integracija sa Smart Routing (kuhinja/šank)
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" /> Ethernet (LAN) priključak, bez dodatnih drajvera
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-success" /> Dostava na adresu restorana
                </li>
              </ul>
              <Button size="lg" className="mt-6" asChild>
                <Link href="/shop">
                  Pogledaj prodavnicu <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="p-6 text-center">
                  <Printer className="mx-auto h-10 w-10 text-primary" />
                  <p className="mt-3 font-semibold">58mm printer</p>
                  <p className="text-sm text-muted-foreground">Za šank i manje stanice</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <Printer className="mx-auto h-12 w-12 text-primary" />
                  <p className="mt-3 font-semibold">80mm printer</p>
                  <p className="text-sm text-muted-foreground">Za kuhinju, duže liste artikala</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight">Krenite za manje od 10 minuta</h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
                  {i + 1}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Cijene */}
        <section id="pricing" className="border-t bg-secondary/30 py-20">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold tracking-tight">Jedna cijena, sve uključeno</h2>
            <p className="mt-3 text-muted-foreground">Bez skrivenih troškova, bez naplate po stolu ili narudžbi.</p>
          </div>

          <Card className="mx-auto mt-10 max-w-md border-primary/30">
            <CardContent className="p-8 text-center">
              <p className="text-sm font-medium text-muted-foreground">Po restoranu</p>
              <p className="mt-2">
                <span className="text-5xl font-bold tracking-tight">79 KM</span>
                <span className="text-muted-foreground"> / mjesečno</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">14 dana besplatno, bez kartice</p>

              <ul className="mt-6 flex flex-col gap-2.5 text-left text-sm">
                {PRICING_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-success" /> {f}
                  </li>
                ))}
              </ul>

              <Button size="lg" className="mt-7 w-full" asChild>
                <Link href="/register">
                  Započni besplatni period <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">Otkažite kad god želite, jednim klikom.</p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t bg-card py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Restoran SaaS Platforma</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-foreground">
              Uslovi korištenja
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Politika privatnosti
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
