export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-brand-700">Restoran Meni</h1>
      <p className="max-w-sm text-stone-600">
        Ova stranica se ne otvara direktno — skenirajte QR kod na svom stolu da
        biste pristupili meniju i naručili.
      </p>
    </main>
  );
}
