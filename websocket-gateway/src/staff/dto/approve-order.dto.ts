import { IsUUID } from 'class-validator';

/** Payload za `approve_order` / `reject_order` - konobar odlucuje o QR narudzbi koja ceka odobrenje (modul C.3). */
export class ApproveOrderDto {
  @IsUUID()
  order_id!: string;
}
