import { IsIn, IsUUID } from 'class-validator';

/** Payload za `update_order_status` - KDS mijenja status narudzbe (Primljeno -> U pripremanju -> Spremno -> Dostavljeno). */
export class UpdateOrderStatusDto {
  @IsUUID()
  order_id!: string;

  @IsIn(['pending', 'preparing', 'ready', 'served', 'cancelled'])
  status!: string;
}
