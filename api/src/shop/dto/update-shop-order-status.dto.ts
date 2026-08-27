import { IsIn } from 'class-validator';

export class UpdateShopOrderStatusDto {
  @IsIn(['pending', 'paid', 'shipped', 'delivered', 'cancelled'])
  status!: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
}
