export interface LocalizedText {
  bs?: string;
  en?: string;
  [lang: string]: string | undefined;
}

export interface Modifier {
  id: string;
  nameJson: LocalizedText;
  price: string; // Prisma Decimal se serijalizuje kao string preko JSON-a
}

export interface MenuItem {
  id: string;
  nameJson: LocalizedText;
  descriptionJson?: LocalizedText | null;
  price: string;
  imageUrl?: string | null;
  isAvailable: boolean;
  allergens: string[];
  printTarget: string;
  modifiers: Modifier[];
}

export interface MenuCategory {
  id: string;
  nameJson: LocalizedText;
  sortOrder: number;
  items: MenuItem[];
}

export interface PublicMenuResponse {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    currency: string;
  };
  categories: MenuCategory[];
}
