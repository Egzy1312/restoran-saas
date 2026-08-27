export interface AdminMenuItem {
  id: string;
  nameJson: Record<string, string>;
  price: string;
  isAvailable: boolean;
}

export interface AdminMenuCategory {
  id: string;
  nameJson: Record<string, string>;
  items: AdminMenuItem[];
}
