'use client';

import { Pencil, Trash2, UtensilsCrossed } from 'lucide-react';
import { MenuItem } from '@/types/menu';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

function localizedText(json: Record<string, string> | null | undefined): string {
  if (!json) return '';
  return json.bs ?? json.en ?? Object.values(json).find(Boolean) ?? '';
}

/** Vizuelna kartica artikla - katalog/meni izgled (slika + naziv + cijena) umjesto goleg reda teksta. Modifikatori se sad uredjuju unutar ItemForm-a (na kartici bi zagusili prostor). */
export default function MenuItemCard({
  item,
  categoryLabel,
  onEdit,
  onDelete,
  onToggleAvailability,
}: {
  item: MenuItem;
  /** Prikazuje se samo u rezultatima pretrage (kad se artikli listaju izvan svojih kategorija-tabova). */
  categoryLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAvailability: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[4/3] bg-secondary/60">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={localizedText(item.nameJson)} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <UtensilsCrossed className="h-9 w-9 text-muted-foreground/50" />
          </div>
        )}
        {!item.isAvailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-[1px]">
            <Badge variant="destructive">Rasprodano</Badge>
          </div>
        )}
        {item.modifiers.length > 0 && (
          <Badge variant="secondary" className="absolute right-2 top-2 shadow-sm">
            +{item.modifiers.length} dodataka
          </Badge>
        )}
      </div>

      <CardContent className="p-3.5">
        {categoryLabel && <p className="mb-0.5 text-[11px] font-medium uppercase text-muted-foreground">{categoryLabel}</p>}
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight">{localizedText(item.nameJson)}</h3>
          <span className="shrink-0 text-sm font-bold text-primary">{Number(item.price).toFixed(2)} KM</span>
        </div>

        {item.descriptionJson && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{localizedText(item.descriptionJson)}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="text-[10px] font-normal">
            {item.printTarget === 'bar' ? 'Šank' : 'Kuhinja'}
          </Badge>
          {item.allergens.slice(0, 3).map((a) => (
            <Badge key={a} variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {a}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-2.5">
          <button onClick={onToggleAvailability}>
            <Badge variant={item.isAvailable ? 'success' : 'secondary'} className="cursor-pointer">
              {item.isAvailable ? 'Dostupno' : 'Nedostupno'}
            </Badge>
          </button>
          <div className="flex gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
