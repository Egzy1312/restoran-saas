'use client';

import { useEffect, useState } from 'react';
import { fetchPublicMenu } from '@/lib/api';
import { localize, useLocale } from '@/lib/locale';
import { PublicMenuResponse } from '@/types/menu';
import LanguageSwitcher from '@/components/language-switcher';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Read-only prikaz menija za embeddable web widget (modul D.2 - "pregled
 * menija direktno sa sajta restorana"). Za razliku od `/r/{slug}/t/{token}`,
 * ovdje nema stola/korpe/naruivanja - samo prezentacija.
 */
export default function MenuPreviewClient({ slug }: { slug: string }) {
  const [menu, setMenu] = useState<PublicMenuResponse | null>(null);
  const [error, setError] = useState(false);
  const [locale, setLocale] = useLocale();

  useEffect(() => {
    fetchPublicMenu(slug)
      .then(setMenu)
      .catch(() => setError(true));
  }, [slug]);

  if (error) return <p className="p-5 text-center text-muted-foreground">Meni trenutno nije dostupan.</p>;
  if (!menu) return <p className="p-5 text-center text-muted-foreground">Učitavanje…</p>;

  return (
    <main className="mx-auto min-h-screen max-w-md p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">{menu.restaurant.name}</h1>
        <LanguageSwitcher locale={locale} onChange={setLocale} />
      </div>
      {menu.categories.map((cat) => (
        <section key={cat.id} className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{localize(cat.nameJson, locale)}</h2>
          <div className="flex flex-col gap-2">
            {cat.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex justify-between p-2.5">
                  <div>
                    <p className="text-sm font-medium">{localize(item.nameJson, locale)}</p>
                    {item.descriptionJson && <p className="text-xs text-muted-foreground">{localize(item.descriptionJson, locale)}</p>}
                  </div>
                  <span className="whitespace-nowrap text-sm font-semibold text-primary">
                    {Number(item.price).toFixed(2)} {menu.restaurant.currency}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
