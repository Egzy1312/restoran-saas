export interface OrderItem {
  id: string;
  quantity: number;
  itemNotes?: string | null;
  menuItem: { id: string; nameJson: Record<string, string> } | null;
}

export interface Order {
  id: string;
  orderNumber: number;
  status: 'pending_approval' | 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
  totalAmount: string;
  tableId: string | null;
  createdAt: string;
  items: OrderItem[];
}
