export type LocalizedText = Record<string, string>;

export interface Modifier {
  id: string;
  nameJson: LocalizedText;
  price: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
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
  isActive: boolean;
  activeFromTime?: string | null;
  activeToTime?: string | null;
  items: MenuItem[];
}
