import { IsUUID } from 'class-validator';

/**
 * Payload za `track_order` - koristi ga gost koji NEMA sto/sobu (Takeaway/
 * Pickup, modul D.3 - naruceno preko `POST /api/orders/takeaway/:slug`, bez
 * WebSocket sesije u tom trenutku). `order_id` je nasumican UUID vracen pri
 * kreiranju narudzbe - dovoljno nepogodiv da sluzi kao "token" za pracenje,
 * bez potrebe za punim nalogom/QR tokenom.
 */
export class TrackOrderDto {
  @IsUUID()
  order_id!: string;
}
