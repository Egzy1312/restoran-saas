/**
 * Stanje zajednicke korpe jednog stola, drzano u Redisu.
 * Kljuc: `cart:{table_id}`
 */

export interface CartModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  /** Jedinstveni id ove linije u korpi (ne menu_item_id - isti artikal moze
   *  biti dodan vise puta sa razlicitim modifikatorima/napomenama). */
  cart_item_id: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  item_notes?: string;
  selected_modifiers: CartModifier[];
  /** Ko je dodao stavku - guest_id (anonimni uuid iz local storage-a gosta),
   *  koristi se za "split by item" kasnije. */
  added_by: string;
  added_at: string;
}

export interface TableCart {
  table_id: string;
  restaurant_id: string;
  items: CartItem[];
  updated_at: string;
}

export interface TableSessionParticipant {
  guest_id: string;
  socket_id: string;
  joined_at: string;
}

export interface TableSessionState {
  table_id: string;
  restaurant_id: string;
  participants: TableSessionParticipant[];
}
