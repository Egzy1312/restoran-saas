export interface RestaurantTable {
  id: string;
  tableNumber: string;
  zoneName: string;
  capacity: number;
  status: 'free' | 'occupied' | 'reserved' | 'bill_requested';
}
