import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

/** Payload za `call_waiter` - poziv konobara ili zahtjev za racun. */
export class CallWaiterDto {
  @IsUUID()
  table_id!: string;

  @IsString()
  guest_id!: string;

  @IsIn(['call', 'bill'])
  type!: 'call' | 'bill';

  @IsOptional()
  @IsIn(['cash', 'card'])
  payment_method?: 'cash' | 'card';
}
