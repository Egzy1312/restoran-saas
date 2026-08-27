export interface OrderItemModifier {
  id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  quantity: number;
  unitPrice: string;
  itemNotes?: string | null;
  selectedModifiers: OrderItemModifier[] | null;
  menuItem: {
    id: string;
    nameJson: Record<string, string>;
    printTarget: string;
  } | null;
}

export interface Order {
  id: string;
  orderNumber: number;
  orderType: 'dine_in' | 'takeaway';
  status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  totalAmount: string;
  notes?: string | null;
  createdAt: string;
  table: { id: string; tableNumber: string; zoneName: string } | null;
  items: OrderItem[];
  // Takeaway/Pickup (modul D.3) - popunjeno samo kad orderType === 'takeaway'.
  pickupTime?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}
