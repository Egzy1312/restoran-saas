import { IsIn } from 'class-validator';

export class UpdateOrderStatusDto {
  @IsIn(['pending', 'preparing', 'ready', 'served', 'cancelled'])
  status!: string;
}
