export interface CartModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  cart_item_id: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  item_notes?: string;
  selected_modifiers: CartModifier[];
  added_by: string;
  added_at: string;
}

export interface CartState {
  items: CartItem[];
  total: number;
}
